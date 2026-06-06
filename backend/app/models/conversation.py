from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    conversation_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)

    # session | craving | resu | soma
    context: Mapped[str] = mapped_column(String(16), index=True)
    session_id: Mapped[str | None] = mapped_column(
        ForeignKey("sessions.session_id"), nullable=True
    )
    week_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="active")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_reason: Mapped[str | None] = mapped_column(String(40), nullable=True)

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class Message(Base):
    __tablename__ = "messages"

    message_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.conversation_id"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # 안전 위기(grade A)로 분류된 발화 표시. True 면 이후 같은 대화의 LLM 맥락
    # (분류기·코치·단계추적)에서 제외해, 잠금 해제 후 재잠금/위기 고착을 막는다.
    # 화면 표시와 세션 종료 요약(임상 기록)에는 그대로 남는다.
    safety_excluded: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    conversation = relationship("Conversation", back_populates="messages")
