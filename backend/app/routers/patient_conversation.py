from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Path, Request, status
from sqlalchemy import func, select
from sse_starlette.sse import EventSourceResponse

from app.deps import CurrentPatient, DbSession
from app.exceptions import conflict, locked, not_found, too_many
from app.models.conversation import Conversation, Message
from app.ratelimit import limiter
from app.schemas.common import PaginatedEnvelope, Pagination
from app.schemas.conversation import (
    ConversationEndIn,
    ConversationEndOut,
    ConversationOut,
    CurrentSessionInfo,
    MessageIn,
    MessageOut,
)
from app.services import conversation_service, llm_gateway

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
@limiter.limit("6/minute")
def start_session(request: Request, patient: CurrentPatient, db: DbSession) -> ConversationOut:
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
@limiter.limit("6/minute")
def start_craving(request: Request, patient: CurrentPatient, db: DbSession) -> ConversationOut:
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
@limiter.limit("12/minute")
async def send_message(
    request: Request,
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

    # 쿼터 프리플라이트: 이미 소진된 흔한 경우를 스트림 시작 전에 깔끔한 429 로 돌려준다
    # (스트림 도중에 넘기는 경계 케이스는 conversation_service 의 SSE error 이벤트가 처리).
    if llm_gateway.quota_remaining(db, patient.patient_id) <= 0:
        raise too_many("Daily LLM token quota exceeded", code="LLM_TOKEN_QUOTA_EXCEEDED")

    gen = conversation_service.stream_user_message(db, patient, conv, body.text)
    return EventSourceResponse(gen, ping=15)


@router.post("/{conversation_id}/opening")
@limiter.limit("6/minute")
async def session_opening(
    request: Request,
    patient: CurrentPatient,
    db: DbSession,
    conversation_id: str = Path(..., pattern=r"^c_[a-z0-9]+$"),
):
    """세션 대화에서 코치가 먼저 말을 거는 오프닝을 SSE 로 스트리밍한다.

    세션1(첫 세션)을 제외한 주간 세션에서, 환자가 첫 메시지를 보내기 전에 코치가 직전
    맥락(직전 세션 요약·최근 체크인)을 참고해 개인화된 인사로 세션을 연다. 클라이언트는
    새 세션을 만든 직후(또는 메시지가 비어 있는 세션에 재진입할 때) 이 엔드포인트를
    호출한다. 이벤트 흐름: start → token(반복) → done. 이미 메시지가 있으면 done 만 온다.
    """
    conv = _get_conversation_or_404(db, patient.patient_id, conversation_id)
    if conv.status != "active":
        raise conflict("Conversation already ended", code="CONVERSATION_ENDED")
    if patient.llm_locked:
        gen = conversation_service.safety_locked_stream(
            patient.llm_lock_reason or "suicide_risk"
        )
        return EventSourceResponse(gen, ping=15)
    if llm_gateway.quota_remaining(db, patient.patient_id) <= 0:
        raise too_many("Daily LLM token quota exceeded", code="LLM_TOKEN_QUOTA_EXCEEDED")
    gen = conversation_service.stream_session_opening(db, patient, conv)
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
    background: BackgroundTasks,
    conversation_id: str = Path(..., pattern=r"^c_[a-z0-9]+$"),
) -> ConversationEndOut:
    conv = _get_conversation_or_404(db, patient.patient_id, conversation_id)
    if conv.status != "active":
        raise conflict("Conversation already ended", code="CONVERSATION_ENDED")
    # 종료를 즉시 확정·커밋해 수십 ms 안에 응답한다. 단계 복구·세션 요약·다음 주차
    # 진행 같은 무거운 LLM 작업은 응답 후 백그라운드로 미뤄, 배포 프록시 타임아웃이나
    # 요청 도중 프로세스 종료가 '종료 커밋'을 삼켜 세션이 active 로 되살아나는 것을 막는다.
    ended_at, next_avail = conversation_service.end_conversation(db, conv, body.reason)
    if body.reason == "completed":
        background.add_task(
            conversation_service.finalize_completion, conversation_id, body.reason
        )
    return ConversationEndOut(
        ended_at=ended_at,
        reason=body.reason,
        next_session_available_at=next_avail,
    )
