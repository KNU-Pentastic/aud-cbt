from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ApiModel, ConversationContextLit


class ConversationOut(BaseModel):
    model_config = ApiModel

    conversation_id: str
    context: ConversationContextLit
    session_id: str | None = None
    week_number: int | None = None
    started_at: datetime


class CurrentSessionInfo(BaseModel):
    active_conversation_id: str | None = None
    current_week: int
    next_session_date: date | None = None
    llm_locked: bool = False


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    client_message_id: UUID | None = None


class MessageOut(BaseModel):
    model_config = ApiModel

    message_id: str
    conversation_id: str
    role: Literal["user", "assistant"]
    text: str
    created_at: datetime


class ConversationEndIn(BaseModel):
    reason: Literal["completed", "abandoned_by_user", "timeout"]


class ConversationEndOut(BaseModel):
    ended_at: datetime
    reason: str
    next_session_available_at: datetime | None = None
    # 이 종료로 세션이 '완료'(5단계 도달)로 처리돼 다음 주차로 진행됐는지. 종료 응답 전에
    # 동기로 확정되므로, 클라이언트는 이 값으로 완료 안내/홈 갱신을 정확히 분기할 수 있다.
    completed: bool = False
