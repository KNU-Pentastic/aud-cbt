"""D2 환자 목록 (단순) — GET /provider/patients

[JUNIOR DEV TASK]
patient_checkin.py list_checkins 의 페이지네이션 패턴을 그대로 따라하면 됩니다.

구현:
  - provider.provider_id 가 담당인 Patient 목록 (last_active_at desc)
  - 각 항목:
      sobriety_days = (today - discharge_date).days, 음수면 0
      unacknowledged_safety_events_count = 그 환자의 SafetyEvent 중
          provider_acknowledged_at IS NULL 인 row count
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Query
from sqlalchemy import desc, func, nulls_last, select

from app.deps import CurrentProvider, DbSession
from app.models.patient import Patient
from app.models.safety_event import SafetyEvent
from app.schemas.common import PaginatedEnvelope, Pagination
from app.schemas.provider import PatientListItem

router = APIRouter(prefix="/provider/patients", tags=["Provider - D2"])


@router.get("", response_model=PaginatedEnvelope[PatientListItem])
def list_patients(
    provider: CurrentProvider,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedEnvelope[PatientListItem]:
    base = select(Patient).where(Patient.provider_id == provider.provider_id)
    total = int(
        db.execute(
            select(func.count(Patient.patient_id)).where(
                Patient.provider_id == provider.provider_id
            )
        ).scalar()
        or 0
    )
    rows = (
        db.execute(
            base.order_by(nulls_last(desc(Patient.last_active_at)))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )

    today = datetime.now(timezone.utc).date()
    items: list[PatientListItem] = []
    for p in rows:
        unack = int(
            db.execute(
                select(func.count(SafetyEvent.safety_event_id)).where(
                    SafetyEvent.patient_id == p.patient_id,
                    SafetyEvent.provider_acknowledged_at.is_(None),
                )
            ).scalar()
            or 0
        )
        items.append(
            PatientListItem(
                patient_id=p.patient_id,
                name=p.name,
                current_week=p.current_week,
                sobriety_days=max(0, (today - p.discharge_date).days),
                last_active_at=p.last_active_at,
                program_status=p.program_status,  # type: ignore[arg-type]
                llm_locked=p.llm_locked,
                unacknowledged_safety_events_count=unack,
            )
        )

    return PaginatedEnvelope[PatientListItem](
        items=items,
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=total,
            total_pages=(total + page_size - 1) // page_size if total else 0,
        ),
    )
