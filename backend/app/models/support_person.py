from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SupportPerson(Base):
    __tablename__ = "support_persons"

    sso_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_id: Mapped[str] = mapped_column(
        ForeignKey("patients.patient_id"), unique=True, index=True
    )

    name: Mapped[str] = mapped_column(String(120))
    relationship_type: Mapped[str] = mapped_column(String(32))
    phone: Mapped[str] = mapped_column(String(40))
    access_level: Mapped[str] = mapped_column(String(32), default="info_only")

    patient = relationship("Patient", back_populates="sso")
