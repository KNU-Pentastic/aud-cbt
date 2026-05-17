from datetime import date

from sqlalchemy import JSON, Date, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LLMUsage(Base):
    __tablename__ = "llm_usage"
    __table_args__ = (UniqueConstraint("patient_id", "date", name="uq_usage_patient_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(String(40), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    used_tokens: Mapped[int] = mapped_column(Integer, default=0)
    breakdown_by_model: Mapped[dict] = mapped_column(JSON, default=dict)
