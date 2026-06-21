"""접속기록(access log).

개인정보의 안전성 확보조치 기준 제8조: 개인정보처리시스템 접속기록을 보관·점검해야
한다. 민감정보(건강정보)를 처리하는 시스템이므로 2년 이상 보관 대상이다.

여기서는 '의료진이 어떤 환자의 개인정보를 언제 열람/변경했는지'를 1행씩 남긴다.
삭제·변조를 막기 위해 append-only 로만 쓴다(수정/삭제 경로를 두지 않음).
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AccessLog(Base):
    __tablename__ = "access_logs"

    access_log_id: Mapped[str] = mapped_column(String(40), primary_key=True)

    actor_role: Mapped[str] = mapped_column(String(20))  # provider | patient | system
    actor_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)

    action: Mapped[str] = mapped_column(String(60))  # 예: patient.detail.read
    patient_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)

    request_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
