"""Conversation orchestrator — produces SSE events for /me/conversations/{id}/messages.

Event protocol (matches openapi.yaml + API doc §5.3):
  start              { message_id, conversation_id }
  token              { text }
  safety_classified  { grade, event_type }
  context_switched   { from, to }
  done               { message_id, finish_reason }
  error              { code, message }
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.ids import conversation_id as new_conv_id
from app.ids import message_id as new_message_id
from app.ids import session_id as new_session_id
from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.session import Session as CbtSession
from app.schemas.internal import (
    ContextBuildRequest,
    DialogueTurn,
    LLMInvokeRequest,
    OutputFilterRequest,
    SafetyClassifyRequest,
    SessionSummarizeRequest,
    StageTrackRequest,
)
from app.services import (
    context_builder,
    llm_gateway,
    output_filter,
    safety_classifier,
    session_summarizer,
    stage_tracker,
)

log = logging.getLogger(__name__)


# -------- DB helpers --------


def active_conversation(
    db: Session, patient_id: str, context: str | None = None
) -> Conversation | None:
    """가장 최근 active 대화. context 지정 시 해당 종류만 조회한다.

    context 를 구분하지 않으면 갈망(craving) 대화가 메인 세션을 가려, 세션 진입 시
    엉뚱한 대화가 로드되어 이전 세션 대화가 사라지는 것처럼 보인다(BUG C). 그래서
    세션/갈망을 각각 독립적으로 조회할 수 있게 한다.
    """
    stmt = select(Conversation).where(
        Conversation.patient_id == patient_id, Conversation.status == "active"
    )
    if context is not None:
        stmt = stmt.where(Conversation.context == context)
    return (
        db.execute(stmt.order_by(Conversation.started_at.desc()).limit(1)).scalars().first()
    )


def start_session(db: Session, patient: Patient) -> Conversation:
    sess = CbtSession(
        session_id=new_session_id(),
        patient_id=patient.patient_id,
        week_number=patient.current_week,
        phase=patient.current_phase,
        status="in_progress",
    )
    # conversations.session_id FK가 sessions를 참조하므로, sessions 행을 먼저
    # flush해 같은 트랜잭션 안에 만들어둔 뒤 conversation을 추가한다.
    # (둘 사이에 ORM relationship이 없어 add_all 순서로는 INSERT 순서가 보장되지 않음)
    db.add(sess)
    db.flush()
    conv = Conversation(
        conversation_id=new_conv_id(),
        patient_id=patient.patient_id,
        context="session",
        session_id=sess.session_id,
        week_number=patient.current_week,
        status="active",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def start_craving(db: Session, patient: Patient) -> Conversation:
    conv = Conversation(
        conversation_id=new_conv_id(),
        patient_id=patient.patient_id,
        context="craving",
        status="active",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def end_conversation(
    db: Session, conv: Conversation, reason: str
) -> tuple[datetime, datetime | None]:
    now = datetime.now(timezone.utc)
    conv.status = "ended"
    conv.ended_at = now
    conv.end_reason = reason
    next_available_at: datetime | None = None
    if conv.session_id:
        sess = db.get(CbtSession, conv.session_id)
        if sess is not None:
            sess.status = "completed" if reason == "completed" else "ended"
            sess.ended_at = now
            sess.end_reason = reason
    db.commit()
    return now, next_available_at


# -------- SSE helpers --------


def _sse(event: str, data: dict) -> dict:
    """sse_starlette 가 인코딩할 SSE 이벤트를 dict 로 돌려준다.

    주의: 직접 포맷한 문자열("event: x\\ndata: {...}\\n\\n")을 yield 하면
    sse_starlette 가 그 문자열 '전체'를 다시 data 필드로 감싸
    `data: event: x` / `data: data: {...}` 처럼 한 번 더 래핑한다. 그 결과
    클라이언트는 event 라인이 없고 data 가 JSON 이 아닌 프레임을 받아 파싱에
    실패하고, 토큰이 화면에 실시간으로 표시되지 않는다(대화방을 나갔다 들어와야
    DB 에서 다시 불러와 보임). {event, data} dict 를 yield 하면 sse_starlette 가
    올바른 SSE 프레임을 생성한다.
    """
    return {"event": event, "data": json.dumps(data, ensure_ascii=False)}


def _recent_turns(db: Session, conversation_id: str, limit: int = 6) -> list[DialogueTurn]:
    rows = (
        db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    rows.reverse()
    return [DialogueTurn(role=m.role, text=m.text) for m in rows]  # type: ignore[arg-type]


_FALLBACK_REPLY = (
    "잠깐 호흡을 가다듬어 볼까요. 지금 떠오르는 생각을 한 줄만 적어주시면, "
    "그것부터 천천히 함께 살펴볼게요."
)


def _phase_for_week(week: int) -> int:
    """12주 → CBI Phase 결정 매핑 (context_builder 와 동일 규칙)."""
    if week <= 1:
        return 1
    if week <= 3:
        return 2
    if week <= 11:
        return 3
    return 4


def _summarize_session(db: Session, patient: Patient, conv: Conversation, sess: CbtSession) -> None:
    """세션 종료 시 요약 생성 (실패해도 대화 흐름을 막지 않는다)."""
    turns = _recent_turns(db, conv.conversation_id, limit=200)
    full = [{"role": t.role, "text": t.text} for t in turns]
    prev = context_builder._previous_summary_block(db, patient.patient_id)
    session_summarizer.summarize(
        db,
        SessionSummarizeRequest(
            session_id=sess.session_id,
            patient_id=patient.patient_id,
            week_number=conv.week_number or patient.current_week,
            full_dialogue=full,
            session_objectives=[],
            previous_summary=prev,
            patient_context={"current_week": patient.current_week},
        ),
    )


def _advance_session_stage(db: Session, patient: Patient, conv: Conversation) -> bool:
    """세션 대화의 5단계 진행을 stage_tracker 로 갱신한다.

    5단계를 모두 마쳤다고 LLM 이 판단하면(세션 종료는 LLM 이 결정) 대화를 종료하고
    요약 생성 + 다음 주차로 진행한 뒤 True 를 반환한다.
    """
    if not conv.session_id:
        return False
    sess = db.get(CbtSession, conv.session_id)
    if sess is None or sess.status != "in_progress":
        return False

    dialogue = [
        {"role": t.role, "text": t.text}
        for t in _recent_turns(db, conv.conversation_id, limit=40)
    ]
    resp = stage_tracker.track(
        db,
        StageTrackRequest(
            conversation_id=conv.conversation_id,
            session_id=sess.session_id,
            week_number=conv.week_number or patient.current_week,
            current_step=sess.current_step,
            step_objectives=[],
            dialogue=dialogue,
        ),
    )
    sess.current_step = resp.current_step
    db.commit()

    if resp.current_step >= 5 and resp.ready_to_advance:
        end_conversation(db, conv, "completed")  # conv + session 모두 종료 처리
        try:
            _summarize_session(db, patient, conv, sess)
        except Exception:
            log.exception("session summarize failed")
        if patient.current_week < 12:
            patient.current_week += 1
            patient.current_phase = _phase_for_week(patient.current_week)
            db.commit()
        return True
    return False


# -------- Orchestrated stream --------


async def stream_user_message(
    db: Session,
    patient: Patient,
    conv: Conversation,
    user_text: str,
) -> AsyncGenerator[dict, None]:
    # 1) Persist user turn
    user_msg = Message(
        message_id=new_message_id(),
        conversation_id=conv.conversation_id,
        role="user",
        text=user_text,
    )
    db.add(user_msg)
    db.commit()

    # 2) Safety classify
    classify_req = SafetyClassifyRequest(
        patient_id=patient.patient_id,
        text=user_text,
        source="conversation_message",
        conversation_context=conv.context,  # type: ignore[arg-type]
        recent_dialogue=_recent_turns(db, conv.conversation_id),
    )
    classification = safety_classifier.classify(db, classify_req)

    if classification.grade == "A":
        yield _sse(
            "safety_classified",
            {"grade": "A", "event_type": classification.event_type},
        )
        yield _sse("done", {"finish_reason": "safety_locked"})
        return

    # 3) Possibly switch context (grade B)
    if classification.grade == "B" and classification.recommended_action in (
        "switch_resu",
        "switch_soma",
    ):
        new_ctx = "resu" if classification.recommended_action == "switch_resu" else "soma"
        if conv.context != new_ctx:
            old_ctx = conv.context
            conv.context = new_ctx
            db.commit()
            yield _sse(
                "safety_classified",
                {"grade": "B", "event_type": classification.event_type},
            )
            yield _sse("context_switched", {"from": old_ctx, "to": new_ctx})
    elif classification.grade == "B":
        yield _sse(
            "safety_classified",
            {"grade": "B", "event_type": classification.event_type},
        )

    # 4) Build context
    try:
        ctx = context_builder.build(
            db,
            ContextBuildRequest(
                patient_id=patient.patient_id,
                context_type=conv.context,  # type: ignore[arg-type]
                week_number=conv.week_number,
            ),
        )
    except Exception:
        log.exception("context_build failed")
        yield _sse("error", {"code": "CONTEXT_BUILD_FAILED", "message": "internal error"})
        yield _sse("done", {"finish_reason": "error"})
        return

    # 5) Compose messages from recent dialogue + new user turn
    history = _recent_turns(db, conv.conversation_id, limit=20)
    messages = [{"role": h.role, "content": h.text} for h in history]

    assistant_msg_id = new_message_id()
    yield _sse(
        "start",
        {"message_id": assistant_msg_id, "conversation_id": conv.conversation_id},
    )

    # 6) Stream from LLM gateway
    buffered: list[str] = []
    try:
        async for token in llm_gateway.stream(
            db,
            LLMInvokeRequest(
                model=settings.llm_model_dialogue,
                messages=messages,
                system=ctx.system_prompt,
                max_tokens=1024,
                temperature=0.7,
                stream=True,
                patient_id=patient.patient_id,
                purpose="patient_dialogue",
                caller_component="orchestrator",
            ),
        ):
            buffered.append(token)
            yield _sse("token", {"text": token})
    except Exception as exc:
        log.exception("LLM stream failed")
        yield _sse("error", {"code": "LLM_STREAM_FAILED", "message": str(exc)[:200]})
        yield _sse("done", {"finish_reason": "error"})
        return

    full = "".join(buffered).strip() or _FALLBACK_REPLY

    # 7) Output filter — on hard fail, replace with safe fallback message
    try:
        verdict = output_filter.check(
            db,
            OutputFilterRequest(text=full, conversation_context=conv.context),  # type: ignore[arg-type]
        )
        if not verdict.passed and verdict.recommended_action == "fallback":
            full = _FALLBACK_REPLY
    except Exception:
        log.exception("output_filter failed")

    # 8) Persist assistant turn
    db.add(
        Message(
            message_id=assistant_msg_id,
            conversation_id=conv.conversation_id,
            role="assistant",
            text=full,
        )
    )
    patient.last_active_at = datetime.now(timezone.utc)
    db.commit()

    # 9) 세션 대화면 5단계 진행을 추적 — LLM 이 세션 종료를 판단하면 자동 종료한다.
    session_completed = False
    if conv.context == "session":
        try:
            session_completed = _advance_session_stage(db, patient, conv)
        except Exception:
            log.exception("stage tracking failed")

    if session_completed:
        yield _sse("session_completed", {"week_number": patient.current_week})
        yield _sse("done", {"message_id": assistant_msg_id, "finish_reason": "session_complete"})
    else:
        yield _sse("done", {"message_id": assistant_msg_id, "finish_reason": "stop"})


async def safety_locked_stream(reason: str) -> AsyncGenerator[dict, None]:
    yield _sse("safety_classified", {"grade": "A", "event_type": reason})
    yield _sse("done", {"finish_reason": "safety_locked"})
    await asyncio.sleep(0)
