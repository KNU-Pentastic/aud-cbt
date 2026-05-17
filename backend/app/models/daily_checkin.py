from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DailyCheckin(Base):
    __tablename__ = "daily_checkins"
    __table_args__ = (UniqueConstraint("patient_id", "date", name="uq_checkin_patient_date"),)

    checkin_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)

    date: Mapped[date] = mapped_column(Date, index=True)
    mood_nrs: Mapped[int] = mapped_column(Integer)
    craving_nrs: Mapped[int] = mapped_column(Integer)
    sleep_hours: Mapped[float] = mapped_column(Float)
    medication_records: Mapped[list] = mapped_column(JSON, default=list)
    free_note: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    patient = relationship("Patient", back_populates="checkins")


class P4Event(Base):
    """Records that the P4 emergency screen was shown to the patient."""

    __tablename__ = "p4_events"

    p4_event_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)

    trigger: Mapped[str] = mapped_column(String(32))  # auto_safety_event | manual_button
    related_safety_event_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    clicked_resource: Mapped[str | None] = mapped_column(String(16), nullable=True)
    shown_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
