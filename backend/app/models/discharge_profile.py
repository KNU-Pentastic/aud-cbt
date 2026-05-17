from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DischargeProfile(Base):
    __tablename__ = "discharge_profiles"

    discharge_profile_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_id: Mapped[str] = mapped_column(
        ForeignKey("patients.patient_id"), unique=True, index=True
    )

    diagnosis_severity: Mapped[str] = mapped_column(String(20))  # moderate | severe
    admission_days: Mapped[int] = mapped_column(Integer)
    suicide_ideation_history: Mapped[str] = mapped_column(String(32))

    # List[Medication] payload — see schemas.discharge_profile.Medication
    medications: Mapped[list] = mapped_column(JSON, default=list)
    comorbidities: Mapped[list] = mapped_column(JSON, default=list)

    primary_triggers_raw: Mapped[str] = mapped_column(String(2000))
    normalized_triggers: Mapped[list] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    patient = relationship("Patient", back_populates="discharge_profile")
