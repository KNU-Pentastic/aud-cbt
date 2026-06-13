from datetime import datetime, timezone

from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.deps import CurrentPatient, DbSession
from app.exceptions import gone, not_found, unauthorized
from app.models.patient import Patient
from app.models.provider import Provider
from app.models.registration_code import RegistrationCode
from app.schemas.auth import (
    PatientLoginIn,
    PatientOAuthGoogleIn,
    PatientRegisterIn,
    PinChangeIn,
    ProviderLoginIn,
)
from app.schemas.common import TokenResponse
from app.security import create_access_token, hash_secret, token_ttl, verify_secret
from app.services import google_oauth

router = APIRouter(prefix="/auth", tags=["Auth"])


def _consume_code(db: DbSession, code: str) -> Patient:
    row = db.get(RegistrationCode, code)
    if row is None:
        raise not_found("Registration code not found", code="REG_CODE_NOT_FOUND")
    now = datetime.now(timezone.utc)
    if row.consumed_at is not None:
        raise not_found("Registration code already used", code="REG_CODE_USED")
    if row.expires_at <= now:
        raise gone("Registration code expired", code="REG_CODE_EXPIRED")
    patient = db.get(Patient, row.patient_id)
    if patient is None:
        raise not_found("Patient not found", code="PATIENT_NOT_FOUND")
    row.consumed_at = now
    return patient


@router.post("/patient/register", response_model=TokenResponse)
def patient_register(body: PatientRegisterIn, db: DbSession) -> TokenResponse:
    patient = _consume_code(db, body.registration_code)
    patient.pin_hash = hash_secret(body.pin)
    patient.is_registered = True
    patient.last_active_at = datetime.now(timezone.utc)
    db.commit()
    token = create_access_token(subject=patient.patient_id, role="patient")
    return TokenResponse(access_token=token, expires_in=token_ttl("patient"))


@router.post("/patient/login", response_model=TokenResponse)
def patient_login(body: PatientLoginIn, db: DbSession) -> TokenResponse:
    # We do NOT consume the registration code here — login is by code+PIN repeatedly.
    row = db.get(RegistrationCode, body.registration_code)
    if row is None:
        raise unauthorized("Invalid credentials", code="INVALID_CREDENTIALS")
    patient = db.get(Patient, row.patient_id)
    if patient is None or not patient.pin_hash or not patient.is_registered:
        raise unauthorized("Invalid credentials", code="INVALID_CREDENTIALS")
    if not verify_secret(body.pin, patient.pin_hash):
        raise unauthorized("Invalid credentials", code="INVALID_CREDENTIALS")
    patient.last_active_at = datetime.now(timezone.utc)
    db.commit()
    token = create_access_token(subject=patient.patient_id, role="patient")
    return TokenResponse(access_token=token, expires_in=token_ttl("patient"))


@router.post("/patient/oauth/google", response_model=TokenResponse)
def patient_oauth_google(body: PatientOAuthGoogleIn, db: DbSession) -> TokenResponse:
    """구글 OAuth 2.1 회원가입/로그인.

    - 이미 구글 계정이 연동된 환자: registration_code 없이 바로 로그인.
    - 최초 연동: 의료진이 발급한 registration_code 로 환자 신원을 바인딩(회원가입).
    환자앱은 PKCE 로 받은 id_token 만 보내고, 백엔드가 구글 JWKS 로 검증한다.
    """
    try:
        claims = google_oauth.verify_id_token(body.id_token)
    except google_oauth.GoogleTokenError:
        raise unauthorized("Invalid Google token", code="INVALID_GOOGLE_TOKEN")

    google_sub = str(claims["sub"])
    email = claims.get("email")
    now = datetime.now(timezone.utc)

    # 1) 이미 연동된 환자 → 로그인
    patient = db.execute(
        select(Patient).where(Patient.google_sub == google_sub)
    ).scalar_one_or_none()
    if patient is not None:
        if email and not patient.email:
            patient.email = email
        patient.last_active_at = now
        db.commit()
        token = create_access_token(subject=patient.patient_id, role="patient")
        return TokenResponse(access_token=token, expires_in=token_ttl("patient"))

    # 2) 최초 연동 → 등록 코드로 신원 바인딩(회원가입)
    if not body.registration_code:
        raise not_found(
            "Google account not linked; registration code required",
            code="OAUTH_LINK_REQUIRED",
        )
    patient = _consume_code(db, body.registration_code)
    patient.google_sub = google_sub
    if email:
        patient.email = email
    patient.is_registered = True
    patient.last_active_at = now
    db.commit()
    token = create_access_token(subject=patient.patient_id, role="patient")
    return TokenResponse(access_token=token, expires_in=token_ttl("patient"))


@router.post("/provider/login", response_model=TokenResponse)
def provider_login(body: ProviderLoginIn, db: DbSession) -> TokenResponse:
    provider = db.execute(
        select(Provider).where(Provider.email == str(body.email).lower())
    ).scalar_one_or_none()
    if provider is None or not verify_secret(body.password, provider.password_hash):
        raise unauthorized("Invalid credentials", code="INVALID_CREDENTIALS")
    token = create_access_token(subject=provider.provider_id, role="provider")
    return TokenResponse(access_token=token, expires_in=token_ttl("provider"))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout() -> Response:
    # v3.0: no server-side blacklist. Client discards the token.
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/patient/pin/change", status_code=status.HTTP_204_NO_CONTENT)
def change_pin(body: PinChangeIn, patient: CurrentPatient, db: DbSession) -> Response:
    if not patient.pin_hash or not verify_secret(body.current_pin, patient.pin_hash):
        raise unauthorized("Current PIN incorrect", code="INVALID_PIN")
    patient.pin_hash = hash_secret(body.new_pin)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
