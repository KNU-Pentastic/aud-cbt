"""P4 응급 안내 — POST /me/safety/p4-shown, GET /me/safety/events

[JUNIOR DEV TASK]
patient_checkin.py 의 list_checkins 페이지네이션 패턴을 그대로 복사해 쓰면 됩니다.

구현:
  1) POST /me/safety/p4-shown — body 받아 P4Event 한 줄 INSERT, 응답 객체 반환
  2) GET  /me/safety/events  — 본인 SafetyEvent 페이지네이션 (detected_at desc)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select

from app.deps import CurrentPatient, DbSession
from app.ids import p4_event_id as new_p4_event_id
from app.models.daily_checkin import P4Event
from app.models.safety_event import SafetyEvent
from app.schemas.common import PaginatedEnvelope, Pagination
from app.schemas.safety import P4ShownIn, P4ShownOut, SafetyEventOut

router = APIRouter(prefix="/me/safety", tags=["Patient - Safety"])


@router.post("/p4-shown", response_model=P4ShownOut, status_code=status.HTTP_201_CREATED)
def record_p4_shown(
    body: P4ShownIn, patient: CurrentPatient, db: DbSession
) -> P4ShownOut:
    evt = P4Event(
        p4_event_id=new_p4_event_id(),
        patient_id=patient.patient_id,
        trigger=body.trigger,
        related_safety_event_id=body.related_safety_event_id,
        clicked_resource=body.clicked_resource,
        shown_at=datetime.now(timezone.utc),
    )
    db.add(evt)
    db.commit()
    db.refresh(evt)
    return P4ShownOut(p4_event_id=evt.p4_event_id, shown_at=evt.shown_at)


@router.get("/events", response_model=PaginatedEnvelope[SafetyEventOut])
def list_events(
    patient: CurrentPatient,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedEnvelope[SafetyEventOut]:
    total = int(db.execute(
        select(func.count(SafetyEvent.safety_event_id))
        .where(SafetyEvent.patient_id == patient.patient_id)
    ).scalar() or 0)

    rows = db.execute(
        select(SafetyEvent)
        .where(SafetyEvent.patient_id == patient.patient_id)
        .order_by(SafetyEvent.detected_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()

    return PaginatedEnvelope[SafetyEventOut](
        items=[SafetyEventOut.model_validate(r) for r in rows],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=total,
            total_pages=(total + page_size - 1) // page_size if total else 0,
        ),
    )
