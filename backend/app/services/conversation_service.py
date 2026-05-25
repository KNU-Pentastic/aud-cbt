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
)
from app.services import (
    context_builder,
    llm_gateway,
    output_filter,
    safety_classifier,
)

log = logging.getLogger(__name__)


# -------- DB helpers --------


def active_conversation(db: Session, patient_id: str) -> Conversation | None:
    return (
        db.execute(
            select(Conversation)
            .where(Conversation.patient_id == patient_id, Conversation.status == "active")
            .order_by(Conversation.started_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
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


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


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


# -------- Orchestrated stream --------


async def stream_user_message(
    db: Session,
    patient: Patient,
    conv: Conversation,
    user_text: str,
) -> AsyncGenerator[str, None]:
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

    yield _sse("done", {"message_id": assistant_msg_id, "finish_reason": "stop"})


async def safety_locked_stream(reason: str) -> AsyncGenerator[str, None]:
    yield _sse("safety_classified", {"grade": "A", "event_type": reason})
    yield _sse("done", {"finish_reason": "safety_locked"})
    await asyncio.sleep(0)
