from datetime import datetime, timezone

from fastapi import APIRouter, Path, status
from sqlalchemy import func, select
from sse_starlette.sse import EventSourceResponse

from app.deps import CurrentPatient, DbSession
from app.exceptions import conflict, locked, not_found
from app.models.conversation import Conversation, Message
from app.schemas.common import PaginatedEnvelope, Pagination
from app.schemas.conversation import (
    ConversationEndIn,
    ConversationEndOut,
    ConversationOut,
    CurrentSessionInfo,
    MessageIn,
    MessageOut,
)
from app.services import conversation_service

router = APIRouter(prefix="/me/conversations", tags=["Patient - Conversation"])


def _next_session_date(patient) -> "datetime.date | None":
    # Simple v3.0 rule: next session is on patient.session_day_of_week of next week.
    from datetime import timedelta

    today = datetime.now(timezone.utc).date()
    days_ahead = (patient.session_day_of_week - today.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return today + timedelta(days=days_ahead)


@router.get("/current-session", response_model=CurrentSessionInfo)
def current_session(patient: CurrentPatient, db: DbSession) -> CurrentSessionInfo:
    conv = conversation_service.active_conversation(db, patient.patient_id, context="session")
    return CurrentSessionInfo(
        active_conversation_id=conv.conversation_id if conv else None,
        current_week=patient.current_week,
        next_session_date=_next_session_date(patient),
        llm_locked=patient.llm_locked,
    )


@router.post(
    "/sessions",
    response_model=ConversationOut,
    status_code=status.HTTP_201_CREATED,
)
def start_session(patient: CurrentPatient, db: DbSession) -> ConversationOut:
    if patient.llm_locked:
        raise locked("LLM dialogue is currently locked")
    existing = conversation_service.active_conversation(db, patient.patient_id, context="session")
    if existing is not None:
        raise conflict("An active conversation already exists", code="CONVERSATION_ACTIVE")
    conv = conversation_service.start_session(db, patient)
    return ConversationOut.model_validate(conv)


@router.post(
    "/craving",
    response_model=ConversationOut,
    status_code=status.HTTP_201_CREATED,
)
def start_craving(patient: CurrentPatient, db: DbSession) -> ConversationOut:
    if patient.llm_locked:
        raise locked("LLM dialogue is currently locked")
    existing = conversation_service.active_conversation(db, patient.patient_id, context="craving")
    if existing is not None:
        return ConversationOut.model_validate(existing)
    conv = conversation_service.start_craving(db, patient)
    return ConversationOut.model_validate(conv)


def _get_conversation_or_404(
    db: DbSession, patient_id: str, conversation_id: str
) -> Conversation:
    conv = db.get(Conversation, conversation_id)
    if conv is None or conv.patient_id != patient_id:
        raise not_found("Conversation not found")
    return conv


@router.post("/{conversation_id}/messages")
async def send_message(
    body: MessageIn,
    patient: CurrentPatient,
    db: DbSession,
    conversation_id: str = Path(..., pattern=r"^c_[a-z0-9]+$"),
):
    conv = _get_conversation_or_404(db, patient.patient_id, conversation_id)
    if conv.status != "active":
        raise conflict("Conversation already ended", code="CONVERSATION_ENDED")

    if patient.llm_locked:
        # v3.0 weakened policy: emit safety_locked stream rather than 423
        gen = conversation_service.safety_locked_stream(
            patient.llm_lock_reason or "suicide_risk"
        )
        return EventSourceResponse(gen, ping=15)

    gen = conversation_service.stream_user_message(db, patient, conv, body.text)
    return EventSourceResponse(gen, ping=15)


@router.get("/{conversation_id}/messages", response_model=PaginatedEnvelope[MessageOut])
def list_messages(
    patient: CurrentPatient,
    db: DbSession,
    conversation_id: str = Path(..., pattern=r"^c_[a-z0-9]+$"),
    page: int = 1,
    page_size: int = 20,
) -> PaginatedEnvelope[MessageOut]:
    conv = _get_conversation_or_404(db, patient.patient_id, conversation_id)
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    total_items = int(
        db.execute(
            select(func.count(Message.message_id)).where(
                Message.conversation_id == conv.conversation_id
            )
        ).scalar()
        or 0
    )
    offset = (page - 1) * page_size
    rows = (
        db.execute(
            select(Message)
            .where(Message.conversation_id == conv.conversation_id)
            .order_by(Message.created_at.asc())
            .offset(offset)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return PaginatedEnvelope[MessageOut](
        items=[MessageOut.model_validate(m) for m in rows],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=(total_items + page_size - 1) // page_size if total_items else 0,
        ),
    )


@router.post("/{conversation_id}/end", response_model=ConversationEndOut)
def end_conversation(
    body: ConversationEndIn,
    patient: CurrentPatient,
    db: DbSession,
    conversation_id: str = Path(..., pattern=r"^c_[a-z0-9]+$"),
) -> ConversationEndOut:
    conv = _get_conversation_or_404(db, patient.patient_id, conversation_id)
    if conv.status != "active":
        raise conflict("Conversation already ended", code="CONVERSATION_ENDED")
    ended_at, next_avail = conversation_service.end_conversation(db, conv, body.reason)
    return ConversationEndOut(
        ended_at=ended_at,
        reason=body.reason,
        next_session_available_at=next_avail,
    )
