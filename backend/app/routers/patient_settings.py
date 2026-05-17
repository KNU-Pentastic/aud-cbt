"""P8 설정 + SSO — /me/settings, /me/sso

[JUNIOR DEV TASK]
구현해야 할 4개 엔드포인트:
  GET  /me/settings           → SettingsOut
  PATCH /me/settings          → SettingsOut  (daily_checkin_time, session_day_of_week)
  POST /me/sso                → SupportPersonOut (1명 한도 — 있으면 교체)
  DELETE /me/sso/{sso_id}     → 204

힌트:
  - 환자 본인 SSO는 patient.sso (back_populates="sso", uselist=False)
  - 교체 시 db.delete(old_sso) 후 새로 add
"""

from fastapi import APIRouter, Path, Response, status

from app.deps import CurrentPatient, DbSession
from app.exceptions import not_found
from app.ids import sso_id as new_sso_id
from app.models.support_person import SupportPerson
from app.schemas.provider import SupportPersonInput, SupportPersonOut
from app.schemas.settings import SettingsOut, SettingsPatch

router = APIRouter(tags=["Patient - Settings"])


def _settings_dto(patient) -> SettingsOut:
    sso = patient.sso
    sso_out = (
        SupportPersonOut(
            sso_id=sso.sso_id,
            name=sso.name,
            relationship=sso.relationship_type,  # type: ignore[arg-type]
            phone=sso.phone,
        )
        if sso
        else None
    )
    return SettingsOut(
        daily_checkin_time=patient.daily_checkin_time,
        session_day_of_week=patient.session_day_of_week,
        sso=sso_out,
    )


@router.get("/me/settings", response_model=SettingsOut)
def get_settings(patient: CurrentPatient) -> SettingsOut:
    return _settings_dto(patient)


@router.patch("/me/settings", response_model=SettingsOut)
def patch_settings(
    body: SettingsPatch, patient: CurrentPatient, db: DbSession
) -> SettingsOut:
    # TODO(junior): body.model_dump(exclude_unset=True) 를 patient에 setattr → commit.
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(patient, k, v)
    db.commit()
    db.refresh(patient)
    return _settings_dto(patient)


@router.post("/me/sso", response_model=SupportPersonOut)
def upsert_sso(
    body: SupportPersonInput, patient: CurrentPatient, db: DbSession
) -> SupportPersonOut:
    # TODO(junior): 기존 SSO 있으면 db.delete, 새로 SupportPerson(relationship_type=body.relationship, ...) add.
    if patient.sso is not None:
        db.delete(patient.sso)
        db.flush()
    sso = SupportPerson(
        sso_id=new_sso_id(),
        patient_id=patient.patient_id,
        name=body.name,
        relationship_type=body.relationship,
        phone=body.phone,
        access_level="info_only",
    )
    db.add(sso)
    db.commit()
    db.refresh(sso)
    return SupportPersonOut(
        sso_id=sso.sso_id,
        name=sso.name,
        relationship=sso.relationship_type,  # type: ignore[arg-type]
        phone=sso.phone,
    )


@router.delete("/me/sso/{sso_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sso(
    patient: CurrentPatient, db: DbSession, sso_id: str = Path(...)
) -> Response:
    sso = db.get(SupportPerson, sso_id)
    if sso is None or sso.patient_id != patient.patient_id:
        raise not_found("SSO not found")
    db.delete(sso)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
