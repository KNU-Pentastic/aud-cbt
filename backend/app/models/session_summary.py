from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SessionSummary(Base):
    __tablename__ = "session_summaries"

    session_summary_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sessions.session_id"), unique=True, index=True
    )
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)
    week_number: Mapped[int] = mapped_column(Integer)

    completed_objectives: Mapped[list] = mapped_column(JSON, default=list)
    unaddressed_objectives: Mapped[list] = mapped_column(JSON, default=list)
    key_insights: Mapped[list] = mapped_column(JSON, default=list)
    identified_triggers: Mapped[list] = mapped_column(JSON, default=list)
    assigned_homework: Mapped[str] = mapped_column(String(2000), default="")
    emotional_tone: Mapped[str] = mapped_column(String(40), default="neutral")
    handoff_notes: Mapped[str] = mapped_column(String(4000), default="")
    safety_flags: Mapped[list] = mapped_column(JSON, default=list)

    model_used: Mapped[str] = mapped_column(String(64), default="claude-sonnet-4-6")
    generation_time_ms: Mapped[int] = mapped_column(Integer, default=0)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
