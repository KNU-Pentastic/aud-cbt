from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MedicationLog(Base):
    """Per-day per-medication adherence record. Populated from DailyCheckin.medication_records."""

    __tablename__ = "medication_logs"

    medication_log_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)
    checkin_id: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    medication_name: Mapped[str] = mapped_column(String(120))
    date: Mapped[date] = mapped_column(Date, index=True)
    taken: Mapped[bool] = mapped_column(Boolean)
    side_effect_note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
