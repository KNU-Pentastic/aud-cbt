"""접속기록 기록 헬퍼 — 의료진의 환자 개인정보 열람/변경을 append-only 로 남긴다.

안전성 확보조치 기준 제8조(접속기록 보관·점검) 대응. 호출부는 환자 PII 를 읽는
의료진 엔드포인트에서 record_patient_access(...) 를 부른다. 기록 자체가 본 요청을
실패시키면 안 되므로 예외는 삼킨다(가용성 우선, 누락은 로그로 남김).
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.ids import access_log_id
from app.models.access_log import AccessLog

log = logging.getLogger(__name__)


def record_patient_access(
    db: Session,
    *,
    actor_role: str,
    actor_id: str | None,
    action: str,
    patient_id: str | None,
    request_id: str | None = None,
    client_ip: str | None = None,
) -> None:
    try:
        db.add(
            AccessLog(
                access_log_id=access_log_id(),
                actor_role=actor_role,
                actor_id=actor_id,
                action=action,
                patient_id=patient_id,
                request_id=request_id,
                client_ip=client_ip,
            )
        )
        db.commit()
    except Exception:  # 접속기록 실패가 본 기능을 막지 않도록.
        log.exception("failed to write access log action=%s patient=%s", action, patient_id)
        db.rollback()
