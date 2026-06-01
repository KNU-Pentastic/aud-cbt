"""D0 — 환자 신규 등록. 트리거 정규화 + 등록 코드 발급/재발급.

8개 필드(diagnosis_severity, admission_days, medications, comorbidities,
suicide_ideation_history, primary_triggers, sso, next_outpatient_date)를
한 번에 받아 Patient + DischargeProfile + SupportPerson + RegistrationCode를 생성.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Response, status
from sqlalchemy import delete, select

from app.config import settings
from app.deps import CurrentProvider, DbSession
from app.exceptions import forbidden, not_found
from app.ids import (
    discharge_profile_id,
    patient_id as new_patient_id,
    registration_code as new_reg_code,
    sso_id as new_sso_id,
)
from app.models import (
    CbtSession,
    Conversation,
    DailyCheckin,
    LLMUsage,
    MedicationLog,
    Message,
    P4Event,
    SafetyEvent,
    SessionSummary,
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
    RegistrationCodeStatusResponse,
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
    # 이미 가입한 환자도 재발급을 허용한다(기기/PIN 분실 대응). 새 코드로 다시 등록할 수
    # 있도록 가입 상태를 초기화한다 — 기존 PIN 은 무효화된다.
    if patient.is_registered:
        patient.is_registered = False
        patient.pin_hash = None
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


@router.get(
    "/{patient_id}/registration-code",
    response_model=RegistrationCodeStatusResponse,
)
def get_registration_code(
    patient_id: str, provider: CurrentProvider, db: DbSession
) -> RegistrationCodeStatusResponse:
    """현재(가장 최근) 등록 코드와 가입 상태를 반환 — 의료진이 코드를 다시 확인할 때."""
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise not_found("Patient not found")
    if patient.provider_id != provider.provider_id:
        raise forbidden("Not assigned to this patient")

    rc = (
        db.execute(
            select(RegistrationCode)
            .where(RegistrationCode.patient_id == patient_id)
            .order_by(RegistrationCode.created_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if rc is None:
        return RegistrationCodeStatusResponse(
            registration_code=None, status="none", expires_at=None,
            is_registered=patient.is_registered,
        )
    now = datetime.now(timezone.utc)
    if rc.consumed_at is not None:
        code_status = "consumed"
    elif rc.expires_at <= now:
        code_status = "expired"
    else:
        code_status = "active"
    return RegistrationCodeStatusResponse(
        registration_code=rc.code,
        status=code_status,
        expires_at=rc.expires_at,
        is_registered=patient.is_registered,
    )


@router.delete("/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(
    patient_id: str, provider: CurrentProvider, db: DbSession
) -> Response:
    """환자 영구 삭제 — 환자와 모든 관련 데이터를 DB 에서 제거한다(비가역).

    환자를 참조하는 테이블 중 일부만 ORM cascade 가 설정돼 있어 `db.delete(patient)`
    만으로는 FK 제약을 위반한다. 따라서 자식 → 부모 순서로 명시적으로 삭제한다.
    """
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise not_found("Patient not found")
    if patient.provider_id != provider.provider_id:
        raise forbidden("Not assigned to this patient")

    conv_ids = select(Conversation.conversation_id).where(
        Conversation.patient_id == patient_id
    )
    # FK 안전 순서: messages → conversations → session_summaries → sessions → 나머지 → patient
    db.execute(delete(Message).where(Message.conversation_id.in_(conv_ids)))
    db.execute(delete(Conversation).where(Conversation.patient_id == patient_id))
    db.execute(delete(SessionSummary).where(SessionSummary.patient_id == patient_id))
    db.execute(delete(CbtSession).where(CbtSession.patient_id == patient_id))
    db.execute(delete(SafetyEvent).where(SafetyEvent.patient_id == patient_id))
    db.execute(delete(P4Event).where(P4Event.patient_id == patient_id))
    db.execute(delete(RegistrationCode).where(RegistrationCode.patient_id == patient_id))
    db.execute(delete(MedicationLog).where(MedicationLog.patient_id == patient_id))
    db.execute(delete(LLMUsage).where(LLMUsage.patient_id == patient_id))
    db.execute(delete(DailyCheckin).where(DailyCheckin.patient_id == patient_id))
    db.execute(delete(DischargeProfile).where(DischargeProfile.patient_id == patient_id))
    db.execute(delete(SupportPerson).where(SupportPerson.patient_id == patient_id))
    db.execute(delete(Patient).where(Patient.patient_id == patient_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
