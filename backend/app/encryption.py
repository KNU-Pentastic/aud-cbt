"""저장 PII(민감/식별정보) 애플리케이션 레벨 암호화.

개인정보의 안전성 확보조치 기준 제7조(개인정보의 암호화)와 의료기관 개인정보보호
가이드라인(건강정보=민감정보의 저장 시 암호화 권장)에 맞춰, 환자 이름·연락처와
발화 원문(건강정보) 같은 민감/식별정보를 DB 에 평문으로 두지 않는다.

- Fernet(AES-128-CBC + HMAC) 대칭키 암호화. 키는 settings.pii_key_material.
- SQLAlchemy TypeDecorator 로 ORM 컬럼에 투명 적용(읽을 때 자동 복호화).
- 저장값에 "enc:v1:" 프리픽스를 붙여 암호문임을 표시한다. 프리픽스가 없으면
  (마이그레이션 전 평문 잔존 행) 그대로 반환해 기동/조회가 깨지지 않게 한다.
"""

from __future__ import annotations

import hashlib
import hmac
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

from app.config import settings

_PREFIX = "enc:v1:"


def blind_index(value: str | None) -> str | None:
    """결정론적 조회용 인덱스(HMAC-SHA256).

    이메일처럼 암호화(EncryptedString, 비결정적) 저장하면서도 동등 조회·유니크 제약이
    필요한 값에 사용한다. 정규화(트림+소문자) 후 HMAC 해시하므로 같은 입력은 항상 같은
    인덱스를 내고, 원문은 복원되지 않는다. 키는 PII 키에서 파생(암호화 키와 분리).
    """
    if value is None:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    key = hashlib.sha256(b"blind-index::" + settings.pii_key_material).digest()
    return hmac.new(key, normalized.encode("utf-8"), hashlib.sha256).hexdigest()


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    return Fernet(settings.pii_key_material)


def encrypt(plaintext: str | None) -> str | None:
    if plaintext is None:
        return None
    token = _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")
    return _PREFIX + token


def decrypt(stored: str | None) -> str | None:
    if stored is None:
        return None
    if not stored.startswith(_PREFIX):
        # 마이그레이션 이전에 저장된 평문 잔존 행 — 있는 그대로 반환한다.
        return stored
    token = stored[len(_PREFIX) :].encode("ascii")
    try:
        return _fernet().decrypt(token).decode("utf-8")
    except InvalidToken:
        # 키 불일치/손상 — 데이터 유실 대신 빈 값으로 안전하게 처리한다.
        return ""


class EncryptedString(TypeDecorator):
    """평문 ``str`` 처럼 쓰지만 DB 에는 암호문으로 저장되는 컬럼 타입.

    암호문은 base64 라 평문보다 길어진다. 길이 여유를 위해 내부 저장 길이는
    선언 길이의 약 3배 + 패딩으로 잡는다.
    """

    impl = String
    cache_ok = True

    def __init__(self, length: int = 255, **kwargs):
        self._declared_length = length
        super().__init__(length=length * 3 + 120, **kwargs)

    def process_bind_param(self, value, dialect):
        return encrypt(value)

    def process_result_value(self, value, dialect):
        return decrypt(value)
