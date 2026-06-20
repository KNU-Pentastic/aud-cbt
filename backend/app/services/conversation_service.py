"""Conversation orchestrator — produces SSE events for /me/conversations/{id}/messages.

Event protocol (matches openapi.yaml + API doc §5.3):
  start              { message_id, conversation_id }
  token              { text }
  safety_classified  { grade, event_type }
  context_switched   { from, to }
  session_completed  { week_number }
  done               { message_id, finish_reason }
  error              { code, message }

Trace events (LLM_TRACE=on 일 때만 — 정량 평가/라이브 관찰용; 운영 빌드에선 끈다):
  context_used       { context_type, phase, week_number, prompt_version,
                       prompt_blocks[], selected_modules, system_prompt_chars,
                       system_prompt }                       # ② context_builder / ③ module
  output_filter      { passed, recommended_action, violations[],
                       replaced_with_fallback }              # ⑤ output_filter
  utterance_analysis { text, analysis{...}, safety{...} }    # ⑥ utterance (+ ① safety)
  stage_progress     { week_number, phase, current_step, ready_to_advance,
                       step_completion, drift, session_advanced, next_week }  # ⑦ stage
  session_summary    { ...SessionSummary }                   # ⑧ session_summarizer
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
    SessionSummary,
    SessionSummarizeRequest,
    StageTrackRequest,
    UtteranceAnalysisRequest,
)
from app.services import (
    context_builder,
    llm_gateway,
    output_filter,
    safety_classifier,
    session_summarizer,
    stage_tracker,
    utterance_analyzer,
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


def _recent_turns(
    db: Session,
    conversation_id: str,
    limit: int = 6,
    exclude_safety: bool = False,
) -> list[DialogueTurn]:
    """최근 대화 턴을 시간순으로 돌려준다.

    exclude_safety=True 면 안전 위기(grade A)로 표시된(safety_excluded) 발화를 빼고
    돌려준다. 의료진이 잠금을 푼 뒤 환자가 같은 대화를 이어갈 때, 위기 발화 한 줄만
    LLM 맥락(분류기·코치·단계추적)에서 도려내기 위함이다. 이렇게 하면:
      (a) 분류기가 옛 위기 발화를 '누적 맥락'으로 다시 보고 재잠금하지 않고,
      (b) 코치 답변이 그 위기('죽고 싶다')에 고착되지 않으며,
      (c) 위기 외의 정상 대화는 원문 그대로 남아 진료 후에도 맥락이 끊기지 않는다.
    기본값(False)은 전체를 돌려준다 — 세션 종료 요약은 위기를 임상 기록으로 남겨야
    하므로 제외하지 않는다.
    """
    stmt = select(Message).where(Message.conversation_id == conversation_id)
    if exclude_safety:
        stmt = stmt.where(Message.safety_excluded.is_(False))
    rows = (
        db.execute(stmt.order_by(Message.created_at.desc()).limit(limit))
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


def _summarize_session(
    db: Session, patient: Patient, conv: Conversation, sess: CbtSession
) -> SessionSummary | None:
    """세션 종료 시 요약 생성 (실패해도 대화 흐름을 막지 않는다).

    생성된 SessionSummary DTO 를 돌려준다(LLM_TRACE=on 일 때 session_summary 이벤트로
    라이브 노출하기 위함). 호출부에서 예외를 잡으므로 여기선 그대로 던진다.
    """
    turns = _recent_turns(db, conv.conversation_id, limit=200)
    full = [{"role": t.role, "text": t.text} for t in turns]
    prev = context_builder._previous_summary_block(db, patient.patient_id)
    return session_summarizer.summarize(
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


def _advance_session_stage(
    db: Session, patient: Patient, conv: Conversation
) -> dict | None:
    """세션 대화의 5단계 진행을 stage_tracker 로 갱신하고 진행도 dict 를 돌려준다.

    5단계를 모두 마쳤다고 LLM 이 판단하면(세션 종료는 LLM 이 결정) 대화를 종료하고
    요약 생성 + 다음 주차로 진행한다. 반환 dict 는 stage_progress SSE 이벤트로 그대로
    노출되어, 클라이언트가 '지금 몇 주차·몇 단계인지'를 표시할 수 있다.
    세션 대화가 아니거나 진행 가능한 세션이 없으면 None.
    """
    if not conv.session_id:
        return None
    sess = db.get(CbtSession, conv.session_id)
    if sess is None or sess.status != "in_progress":
        return None

    # 단계 진행 판단에서도 위기 발화는 뺀다(exclude_safety). 위기 발화로 '주제
    # 이탈(drift)'이 잡혀 세션이 멈추는 것을 막는다. 위기 외 정상 대화는 그대로 보므로
    # 진행 맥락이 끊기지 않고, current_step 은 sess 에 보존돼 단계가 되돌아가지 않는다.
    dialogue = [
        {"role": t.role, "text": t.text}
        for t in _recent_turns(db, conv.conversation_id, limit=40, exclude_safety=True)
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
    week = conv.week_number or patient.current_week
    sess.current_step = resp.current_step
    db.commit()

    advanced = False
    next_week: int | None = None
    summary_dump: dict | None = None
    if resp.current_step >= 5 and resp.ready_to_advance:
        end_conversation(db, conv, "completed")  # conv + session 모두 종료 처리
        try:
            dto = _summarize_session(db, patient, conv, sess)
            if dto is not None:
                summary_dump = dto.model_dump(mode="json")  # datetime → ISO 문자열
        except Exception:
            log.exception("session summarize failed")
        if patient.current_week < 12:
            patient.current_week += 1
            patient.current_phase = _phase_for_week(patient.current_week)
            db.commit()
            next_week = patient.current_week
        advanced = True

    return {
        "week_number": week,
        "total_weeks": 12,
        "phase": _phase_for_week(week),
        "current_step": resp.current_step,
        "total_steps": 5,
        "ready_to_advance": resp.ready_to_advance,
        "step_completion": round(resp.step_completion_estimate, 2),
        "drift": resp.step_drift_risk,
        "session_advanced": advanced,
        "next_week": next_week,
        # 세션 종료 시 생성된 요약(⑧ session_summarizer). stage_progress 와 분리해
        # 아래 stream_user_message 에서 별도 session_summary 이벤트로 노출한다.
        "session_summary": summary_dump,
    }


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
    #    맥락(recent_dialogue)에서 위기로 표시된 옛 발화는 뺀다(exclude_safety). 의료진이
    #    잠금을 푼 뒤 같은 대화를 이어가도, 분류기가 그 위기 발화를 '누적 맥락'으로 다시
    #    보고 무해한 새 발화를 grade A 로 재잠금하지 않게 한다. 방금 저장한 현재 발화는
    #    아직 표시 전이라 그대로 분류되며(위기면 아래에서 표시), 위기 외 정상 대화는
    #    원문 그대로 남아 맥락이 끊기지 않는다.
    classify_req = SafetyClassifyRequest(
        patient_id=patient.patient_id,
        text=user_text,
        source="conversation_message",
        conversation_context=conv.context,  # type: ignore[arg-type]
        recent_dialogue=_recent_turns(db, conv.conversation_id, exclude_safety=True),
    )
    classification = safety_classifier.classify(db, classify_req)

    if classification.grade == "A":
        # 이 발화가 위기다 — 표시해 둔다. 이후 같은 대화의 LLM 맥락(분류기·코치·단계추적)
        # 에서 이 한 줄만 도려내, 잠금 해제 후 재잠금/고착 없이 정상 대화를 이어가게 한다.
        # (화면·세션 종료 요약에는 그대로 남아 임상 기록은 보존된다.)
        user_msg.safety_excluded = True
        db.commit()
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

    # 4b) prompt-trace: 이 답변에서 LLM 이 정확히 어떤 가이드라인을 참고했는지 노출한다.
    #     블록 식별자·제목·본문 + 조립된 전체 시스템 프롬프트(환자 컨텍스트 포함).
    #     정량 평가용(LLM_TRACE=on) — 운영 배포 빌드에서는 LLM_TRACE=false 로 끈다.
    if settings.llm_trace:
        cb = ctx.context_blocks
        yield _sse(
            "context_used",
            {
                "context_type": conv.context,
                "phase": cb.get("phase"),
                "week_number": cb.get("week_number") or conv.week_number,
                "prompt_version": ctx.prompt_version,
                "prompt_blocks": cb.get("prompt_blocks", []),
                "selected_modules": cb.get("selected_modules"),
                "system_prompt_chars": len(ctx.system_prompt),
                "system_prompt": ctx.system_prompt,
            },
        )

    # 5) Compose messages from recent dialogue + new user turn
    #    exclude_safety=True: 위기로 표시된 발화만 빼고 코치에게 전달한다. 위기 외 정상
    #    대화는 원문 그대로 남아 진료 후에도 맥락이 끊기지 않고, 코치 답변이 옛 위기에
    #    고착되지 않는다.
    history = _recent_turns(db, conv.conversation_id, limit=20, exclude_safety=True)
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
        replaced = not verdict.passed and verdict.recommended_action == "fallback"
        if replaced:
            full = _FALLBACK_REPLY
        # 출력 가드(⑤ output_filter): 통과 여부·위반 항목·폴백 대체 여부를 트레이스로 노출.
        if settings.llm_trace:
            yield _sse(
                "output_filter",
                {
                    "passed": verdict.passed,
                    "recommended_action": verdict.recommended_action,
                    "violations": [v.model_dump() for v in verdict.violations],
                    "replaced_with_fallback": replaced,
                },
            )
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

    # 8b) 발화 분석(정량 평가용): 방금 환자 발화를 감정·의도·인지왜곡·갈망강도·관련
    #     CBT 단계로 구조화 분석하고, 이미 step 2 에서 돌린 안전 분류 결과와 함께 노출한다.
    #     답변 스트림 이후에 실행해 첫 토큰 지연을 막는다. LLM_TRACE=on 일 때만.
    if settings.llm_trace:
        try:
            analysis = utterance_analyzer.analyze(
                db,
                UtteranceAnalysisRequest(
                    patient_id=patient.patient_id,
                    text=user_text,
                    conversation_context=conv.context,  # type: ignore[arg-type]
                    recent_dialogue=history[:-1],  # 직전 맥락(현재 발화 제외)
                ),
            )
            yield _sse(
                "utterance_analysis",
                {
                    "text": user_text[:500],
                    "analysis": analysis.model_dump(),
                    "safety": {
                        "grade": classification.grade,
                        "event_type": classification.event_type,
                        "confidence": classification.confidence,
                        "matched_by": classification.matched_by,
                        "recommended_action": classification.recommended_action,
                    },
                },
            )
        except Exception:
            log.exception("utterance analysis failed")

    # 9) 세션 대화면 5단계 진행을 추적 — LLM 이 세션 종료를 판단하면 자동 종료한다.
    #    진행도(stage_progress)를 라이브 응답에 실어, 지금 몇 주차·몇 단계인지 노출한다.
    progress: dict | None = None
    if conv.context == "session":
        try:
            progress = _advance_session_stage(db, patient, conv)
        except Exception:
            log.exception("stage tracking failed")

    if progress is not None and settings.llm_trace:
        # stage_progress 페이로드에서 큰 요약 본문은 분리해, 세션 종료 시에만 별도
        # session_summary(⑧) 이벤트로 보낸다.
        summary_dump = progress.get("session_summary")
        yield _sse(
            "stage_progress",
            {k: v for k, v in progress.items() if k != "session_summary"},
        )
        if summary_dump:
            yield _sse("session_summary", summary_dump)

    if progress is not None and progress["session_advanced"]:
        yield _sse("session_completed", {"week_number": patient.current_week})
        yield _sse("done", {"message_id": assistant_msg_id, "finish_reason": "session_complete"})
    else:
        yield _sse("done", {"message_id": assistant_msg_id, "finish_reason": "stop"})


async def safety_locked_stream(reason: str) -> AsyncGenerator[dict, None]:
    yield _sse("safety_classified", {"grade": "A", "event_type": reason})
    yield _sse("done", {"finish_reason": "safety_locked"})
    await asyncio.sleep(0)
