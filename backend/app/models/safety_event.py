from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SafetyEvent(Base):
    __tablename__ = "safety_events"

    safety_event_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)

    grade: Mapped[str] = mapped_column(String(2))  # A | B
    event_type: Mapped[str] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(40))
    recommended_action: Mapped[str] = mapped_column(String(40))

    matched_by: Mapped[str] = mapped_column(String(20), default="none")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)

    raw_text: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    conversation_id: Mapped[str | None] = mapped_column(String(40), nullable=True)

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Post-MVP fields kept null in v3.0
    provider_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    provider_acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
