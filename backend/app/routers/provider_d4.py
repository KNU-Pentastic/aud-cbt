"""D4 재평가 — 약물 갱신, 다음 외래일 갱신, 프로그램 상태 변경 (v3.0 축소)

[JUNIOR DEV TASK]
- PUT /provider/patients/{patient_id}/medications  → 약물 전체 교체 (DischargeProfile.medications)
- PATCH /provider/patients/{patient_id}/next-outpatient-date  → 미래 날짜 검증, 환자 row 갱신
- PATCH /provider/patients/{patient_id}/program-status  → completed | withdrawn

힌트:
  - 담당 의사 검증: patient.provider_id != provider.provider_id 이면 forbidden
  - 모든 핸들러는 patient = db.get(Patient, patient_id) 로 먼저 가져오고 None / 권한 체크
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter

from app.deps import CurrentProvider, DbSession
from app.exceptions import forbidden, not_found, validation_error
from app.models.patient import Patient
from app.schemas.provider import (
    MedicationsUpdateIn,
    MedicationsUpdateOut,
    NextOutpatientDateIn,
    NextOutpatientDateOut,
    ProgramStatusIn,
    ProgramStatusOut,
)

router = APIRouter(prefix="/provider/patients", tags=["Provider - D4"])


def _own_patient(db: DbSession, provider, patient_id: str) -> Patient:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise not_found("Patient not found")
    if patient.provider_id != provider.provider_id:
        raise forbidden("Not assigned to this patient")
    return patient


@router.put("/{patient_id}/medications", response_model=MedicationsUpdateOut)
def update_medications(
    patient_id: str,
    body: MedicationsUpdateIn,
    provider: CurrentProvider,
    db: DbSession,
) -> MedicationsUpdateOut:
    patient = _own_patient(db, provider, patient_id)
    dp = patient.discharge_profile
    if dp is None:
        raise not_found("Discharge profile missing")
    dp.medications = [m.model_dump() for m in body.medications]
    db.commit()
    db.refresh(dp)
    return MedicationsUpdateOut(
        patient_id=patient.patient_id,
        medications=body.medications,
        updated_at=dp.updated_at,
    )


@router.patch("/{patient_id}/next-outpatient-date", response_model=NextOutpatientDateOut)
def update_next_outpatient(
    patient_id: str,
    body: NextOutpatientDateIn,
    provider: CurrentProvider,
    db: DbSession,
) -> NextOutpatientDateOut:
    if body.next_outpatient_date < date.today():
        raise validation_error(
            "next_outpatient_date must not be in the past",
            details=[{"field": "next_outpatient_date", "issue": "past date"}],
        )
    patient = _own_patient(db, provider, patient_id)
    patient.next_outpatient_date = body.next_outpatient_date
    db.commit()
    db.refresh(patient)
    return NextOutpatientDateOut(
        patient_id=patient.patient_id,
        next_outpatient_date=patient.next_outpatient_date,
        updated_at=datetime.now(timezone.utc),
    )


@router.patch("/{patient_id}/program-status", response_model=ProgramStatusOut)
def update_program_status(
    patient_id: str,
    body: ProgramStatusIn,
    provider: CurrentProvider,
    db: DbSession,
) -> ProgramStatusOut:
    patient = _own_patient(db, provider, patient_id)
    patient.program_status = body.new_status
    db.commit()
    db.refresh(patient)
    return ProgramStatusOut(
        patient_id=patient.patient_id,
        program_status=patient.program_status,
        changed_at=datetime.now(timezone.utc),
    )
