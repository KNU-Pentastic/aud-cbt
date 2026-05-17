from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Session(Base):
    """A scheduled weekly CBT session. May have 0..1 associated Conversation."""

    __tablename__ = "sessions"

    session_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)

    week_number: Mapped[int] = mapped_column(Integer)
    phase: Mapped[int] = mapped_column(Integer, default=1)

    current_step: Mapped[int] = mapped_column(Integer, default=1)  # CBT 5-step
    status: Mapped[str] = mapped_column(String(20), default="in_progress")

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_reason: Mapped[str | None] = mapped_column(String(40), nullable=True)
