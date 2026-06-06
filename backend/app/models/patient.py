from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Patient(Base):
    __tablename__ = "patients"

    patient_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.provider_id"), index=True)

    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40))
    date_of_birth: Mapped[date] = mapped_column(Date)
    sex: Mapped[str] = mapped_column(String(16))

    pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_registered: Mapped[bool] = mapped_column(Boolean, default=False)

    discharge_date: Mapped[date] = mapped_column(Date)
    next_outpatient_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    program_status: Mapped[str] = mapped_column(String(20), default="active")
    current_week: Mapped[int] = mapped_column(Integer, default=1)
    current_phase: Mapped[int] = mapped_column(Integer, default=1)

    # P8 settings
    daily_checkin_time: Mapped[str] = mapped_column(String(5), default="20:00")
    session_day_of_week: Mapped[int] = mapped_column(Integer, default=0)  # 0=Mon

    # Safety lock state (managed by backend; clients also enforce their own lock policy)
    llm_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    llm_locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    llm_lock_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Provider unlock audit — who released the most recent safety lock, when, and why.
    # Cleared whenever a new grade-A event re-locks the patient.
    llm_unlocked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    llm_unlocked_by: Mapped[str | None] = mapped_column(String(40), nullable=True)
    llm_unlock_note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    provider = relationship("Provider")
    discharge_profile = relationship(
        "DischargeProfile", uselist=False, back_populates="patient", cascade="all, delete-orphan"
    )
    sso = relationship(
        "SupportPerson", uselist=False, back_populates="patient", cascade="all, delete-orphan"
    )
    checkins = relationship(
        "DailyCheckin", back_populates="patient", cascade="all, delete-orphan"
    )
