"""Reference router for the junior dev.

Pattern: validate input → query/mutate DB → call internal service if needed → return schema.

This router is fully implemented so the junior dev can copy its shape for
P1 home, P4 safety, P5 progress, P8 settings, and the simpler provider endpoints.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Path, Query, status
from sqlalchemy import func, select

from app.deps import CurrentPatient, DbSession
from app.exceptions import conflict, not_found
from app.ids import checkin_id as new_checkin_id
from app.ids import medication_log_id as new_med_log_id
from app.models.daily_checkin import DailyCheckin
from app.models.medication import MedicationLog
from app.schemas.checkin import (
    CheckinOut,
    CheckinPatch,
    CheckinResponse,
    CheckinSubmit,
    SafetyClassification,
)
from app.schemas.common import PaginatedEnvelope, Pagination
from app.schemas.internal import SafetyClassifyRequest
from app.services import safety_classifier

router = APIRouter(prefix="/me/checkins", tags=["Patient - Checkin"])


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _materialize_medication_logs(
    db: DbSession, patient_id: str, checkin: DailyCheckin
) -> None:
    """Replace today's MedicationLog rows for this patient with the new records."""
    db.query(MedicationLog).filter(
        MedicationLog.patient_id == patient_id,
        MedicationLog.date == checkin.date,
    ).delete()
    for r in checkin.medication_records or []:
        db.add(
            MedicationLog(
                medication_log_id=new_med_log_id(),
                patient_id=patient_id,
                checkin_id=checkin.checkin_id,
                medication_name=r.get("medication_name", ""),
                date=checkin.date,
                taken=bool(r.get("taken")),
                side_effect_note=r.get("side_effect_note"),
            )
        )


def _classify_free_note(
    db: DbSession, patient_id: str, free_note: str | None
) -> SafetyClassification | None:
    if not free_note or not free_note.strip():
        return None
    res = safety_classifier.classify(
        db,
        SafetyClassifyRequest(
            patient_id=patient_id,
            text=free_note,
            source="checkin_free_note",
        ),
    )
    if not res.classified or res.grade == "none":
        return None
    return SafetyClassification(
        grade=res.grade,  # type: ignore[arg-type]
        event_type=res.event_type,  # type: ignore[arg-type]
        next_action=res.recommended_action,
    )


@router.post(
    "",
    response_model=CheckinResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_checkin(
    body: CheckinSubmit, patient: CurrentPatient, db: DbSession
) -> CheckinResponse:
    today = _today()
    existing = db.execute(
        select(DailyCheckin).where(
            DailyCheckin.patient_id == patient.patient_id,
            DailyCheckin.date == today,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise conflict(
            "Today's check-in already submitted",
            code="CHECKIN_ALREADY_SUBMITTED",
        )

    checkin = DailyCheckin(
        checkin_id=new_checkin_id(),
        patient_id=patient.patient_id,
        date=today,
        mood_nrs=body.mood_nrs,
        craving_nrs=body.craving_nrs,
        sleep_hours=body.sleep_hours,
        medication_records=[r.model_dump() for r in body.medication_records],
        free_note=body.free_note,
    )
    db.add(checkin)
    _materialize_medication_logs(db, patient.patient_id, checkin)
    db.commit()
    db.refresh(checkin)

    classification = _classify_free_note(db, patient.patient_id, body.free_note)
    return CheckinResponse(
        checkin=CheckinOut.model_validate(checkin),
        safety_classification=classification,
    )


@router.get("", response_model=PaginatedEnvelope[CheckinOut])
def list_checkins(
    patient: CurrentPatient,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
) -> PaginatedEnvelope[CheckinOut]:
    stmt = select(DailyCheckin).where(DailyCheckin.patient_id == patient.patient_id)
    count_stmt = select(func.count(DailyCheckin.checkin_id)).where(
        DailyCheckin.patient_id == patient.patient_id
    )
    if from_ is not None:
        stmt = stmt.where(DailyCheckin.date >= from_)
        count_stmt = count_stmt.where(DailyCheckin.date >= from_)
    if to is not None:
        stmt = stmt.where(DailyCheckin.date <= to)
        count_stmt = count_stmt.where(DailyCheckin.date <= to)

    total = int(db.execute(count_stmt).scalar() or 0)
    rows = (
        db.execute(
            stmt.order_by(DailyCheckin.date.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )
    return PaginatedEnvelope[CheckinOut](
        items=[CheckinOut.model_validate(r) for r in rows],
        pagination=Pagination(
            page=page,
            page_size=page_size,
            total_items=total,
            total_pages=(total + page_size - 1) // page_size if total else 0,
        ),
    )


@router.get("/{checkin_id}", response_model=CheckinOut)
def get_checkin(
    patient: CurrentPatient, db: DbSession, checkin_id: str = Path(...)
) -> CheckinOut:
    row = db.get(DailyCheckin, checkin_id)
    if row is None or row.patient_id != patient.patient_id:
        raise not_found("Check-in not found")
    return CheckinOut.model_validate(row)


@router.patch("/{checkin_id}", response_model=CheckinResponse)
def patch_checkin(
    body: CheckinPatch,
    patient: CurrentPatient,
    db: DbSession,
    checkin_id: str = Path(...),
) -> CheckinResponse:
    row = db.get(DailyCheckin, checkin_id)
    if row is None or row.patient_id != patient.patient_id:
        raise not_found("Check-in not found")

    age = datetime.now(timezone.utc) - row.submitted_at
    if age > timedelta(hours=24):
        raise conflict("Edit window (24h) expired", code="CHECKIN_EDIT_WINDOW_EXPIRED")

    data = body.model_dump(exclude_unset=True)
    if "medication_records" in data and data["medication_records"] is not None:
        data["medication_records"] = [
            r if isinstance(r, dict) else r.model_dump() for r in data["medication_records"]
        ]
    for k, v in data.items():
        setattr(row, k, v)
    db.flush()

    if "medication_records" in data:
        _materialize_medication_logs(db, patient.patient_id, row)
    db.commit()
    db.refresh(row)

    classification = (
        _classify_free_note(db, patient.patient_id, row.free_note)
        if "free_note" in data
        else None
    )
    return CheckinResponse(
        checkin=CheckinOut.model_validate(row),
        safety_classification=classification,
    )
