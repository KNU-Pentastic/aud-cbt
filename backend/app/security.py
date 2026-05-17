from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt
from passlib.context import CryptContext

from app.config import settings


_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

Role = Literal["patient", "provider"]


def hash_secret(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_secret(plain: str, hashed: str) -> bool:
    try:
        return _pwd_context.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(*, subject: str, role: Role, extra: dict[str, Any] | None = None) -> str:
    ttl = (
        settings.patient_token_ttl_seconds
        if role == "patient"
        else settings.provider_token_ttl_seconds
    )
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def token_ttl(role: Role) -> int:
    return (
        settings.patient_token_ttl_seconds
        if role == "patient"
        else settings.provider_token_ttl_seconds
    )
