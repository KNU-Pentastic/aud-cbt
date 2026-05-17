from typing import Annotated

import jwt
from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.exceptions import forbidden, unauthorized
from app.models.patient import Patient
from app.models.provider import Provider
from app.security import decode_token


bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def _decode_or_401(token: str) -> dict:
    try:
        return decode_token(token)
    except jwt.ExpiredSignatureError:
        raise unauthorized("Token expired", "TOKEN_EXPIRED")
    except jwt.PyJWTError:
        raise unauthorized("Invalid token", "INVALID_TOKEN")


def _bearer_token(creds: HTTPAuthorizationCredentials | None) -> str:
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise unauthorized("Missing bearer token")
    return creds.credentials


def current_claims(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    token = _bearer_token(creds)
    return _decode_or_401(token)


def current_patient(
    claims: Annotated[dict, Depends(current_claims)],
    db: DbSession,
) -> Patient:
    if claims.get("role") != "patient":
        raise forbidden("Patient access required", "WRONG_ROLE")
    patient = db.get(Patient, claims["sub"])
    if patient is None:
        raise unauthorized("Patient not found", "INVALID_TOKEN")
    return patient


def current_provider(
    claims: Annotated[dict, Depends(current_claims)],
    db: DbSession,
) -> Provider:
    if claims.get("role") != "provider":
        raise forbidden("Provider access required", "WRONG_ROLE")
    provider = db.get(Provider, claims["sub"])
    if provider is None:
        raise unauthorized("Provider not found", "INVALID_TOKEN")
    return provider


def require_internal_key(
    x_internal_service_key: Annotated[str | None, Header(alias="X-Internal-Service-Key")] = None,
) -> str:
    if not x_internal_service_key or x_internal_service_key not in settings.internal_keys_set:
        raise unauthorized("Invalid internal service key", "INVALID_INTERNAL_KEY")
    return x_internal_service_key


def request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


CurrentPatient = Annotated[Patient, Depends(current_patient)]
CurrentProvider = Annotated[Provider, Depends(current_provider)]
InternalKey = Annotated[str, Depends(require_internal_key)]
RequestId = Annotated[str, Depends(request_id)]
