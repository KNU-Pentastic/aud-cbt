"""D0 — 환자 신규 등록. 트리거 정규화 + 등록 코드 발급/재발급.

8개 필드(diagnosis_severity, admission_days, medications, comorbidities,
suicide_ideation_history, primary_triggers, sso, next_outpatient_date)를
한 번에 받아 Patient + DischargeProfile + SupportPerson + RegistrationCode를 생성.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, status
from sqlalchemy import select

from app.config import settings
from app.deps import CurrentProvider, DbSession
from app.exceptions import conflict, forbidden, not_found
from app.ids import (
    discharge_profile_id,
    patient_id as new_patient_id,
    registration_code as new_reg_code,
    sso_id as new_sso_id,
)
from app.models.discharge_profile import DischargeProfile
from app.models.patient import Patient
from app.models.registration_code import RegistrationCode
from app.models.support_person import SupportPerson
from app.schemas.internal import TriggerNormalizeRequest
from app.schemas.provider import (
    DischargeProfileInput,
    PatientCreateResponse,
    RegistrationCodeRegenResponse,
)
from app.services import trigger_normalizer

router = APIRouter(prefix="/provider/patients", tags=["Provider - D0"])


def _issue_code(db: DbSession, patient_id: str) -> RegistrationCode:
    code = new_reg_code()
    while db.get(RegistrationCode, code) is not None:
        code = new_reg_code()
    rc = RegistrationCode(
        code=code,
        patient_id=patient_id,
        expires_at=datetime.now(timezone.utc)
        + timedelta(days=settings.registration_code_ttl_days),
    )
    db.add(rc)
    return rc


@router.post(
    "",
    response_model=PatientCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_patient(
    body: DischargeProfileInput, provider: CurrentProvider, db: DbSession
) -> PatientCreateResponse:
    normalized = trigger_normalizer.normalize(
        db, TriggerNormalizeRequest(raw_text=body.primary_triggers.raw_text)
    ).normalized_tags

    pid = new_patient_id()
    patient = Patient(
        patient_id=pid,
        provider_id=provider.provider_id,
        name=body.name,
        phone=body.phone,
        date_of_birth=body.date_of_birth,
        sex=body.sex,
        discharge_date=body.discharge_date,
        next_outpatient_date=body.next_outpatient_date,
        program_status="active",
        current_week=1,
        current_phase=1,
    )
    profile = DischargeProfile(
        discharge_profile_id=discharge_profile_id(),
        patient_id=pid,
        diagnosis_severity=body.diagnosis_severity,
        admission_days=body.admission_days,
        suicide_ideation_history=body.suicide_ideation_history,
        medications=[m.model_dump() for m in body.medications],
        comorbidities=list(body.comorbidities),
        primary_triggers_raw=body.primary_triggers.raw_text,
        normalized_triggers=normalized,
    )
    sso = SupportPerson(
        sso_id=new_sso_id(),
        patient_id=pid,
        name=body.sso.name,
        relationship_type=body.sso.relationship,
        phone=body.sso.phone,
        access_level="info_only",
    )
    db.add_all([patient, profile, sso])
    rc = _issue_code(db, pid)
    db.commit()
    return PatientCreateResponse(
        patient_id=pid,
        registration_code=rc.code,
        expires_at=rc.expires_at,
        normalized_triggers=normalized,
    )


@router.post(
    "/{patient_id}/registration-code/regenerate",
    response_model=RegistrationCodeRegenResponse,
)
def regenerate_code(
    patient_id: str, provider: CurrentProvider, db: DbSession
) -> RegistrationCodeRegenResponse:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise not_found("Patient not found")
    if patient.provider_id != provider.provider_id:
        raise forbidden("Not assigned to this patient")
    if patient.is_registered:
        raise conflict(
            "Patient already registered", code="PATIENT_ALREADY_REGISTERED"
        )
    # Invalidate all prior unconsumed codes for this patient.
    prior = (
        db.execute(
            select(RegistrationCode).where(
                RegistrationCode.patient_id == patient_id,
                RegistrationCode.consumed_at.is_(None),
            )
        )
        .scalars()
        .all()
    )
    now = datetime.now(timezone.utc)
    for rc in prior:
        rc.consumed_at = now
    rc = _issue_code(db, patient_id)
    db.commit()
    return RegistrationCodeRegenResponse(
        registration_code=rc.code, expires_at=rc.expires_at
    )
