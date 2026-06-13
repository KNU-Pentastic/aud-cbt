"""구글 OAuth 2.1 id_token 검증.

환자앱이 구글 로그인(Authorization Code + PKCE)으로 받은 id_token 을 백엔드가
검증한다. 토큰을 신뢰하기 전에:
  - 구글 JWKS 로 서명(RS256) 검증
  - aud(audience) 가 우리가 등록한 client_id 중 하나인지
  - iss(issuer) 가 구글인지
  - 만료(exp) 등 표준 클레임

검증을 통과하면 sub(구글 고유 식별자)·email 을 담은 클레임 dict 를 돌려준다.
오프라인 JWKS 검증이라 매 로그인마다 구글에 토큰을 왕복시키지 않는다(키만 캐시).
"""

from __future__ import annotations

import jwt
from jwt import PyJWKClient

from app.config import settings

_GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs"
_GOOGLE_ISSUERS = {"https://accounts.google.com", "accounts.google.com"}

_jwk_client: PyJWKClient | None = None


class GoogleTokenError(Exception):
    """id_token 검증 실패(서명/aud/iss/만료/구성 누락 등)."""


def _client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(_GOOGLE_JWKS_URI)
    return _jwk_client


def verify_id_token(id_token: str) -> dict:
    allowed = settings.google_client_id_set
    if not allowed:
        raise GoogleTokenError("GOOGLE_CLIENT_IDS 가 설정되지 않았습니다.")
    try:
        signing_key = _client().get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=list(allowed),
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise GoogleTokenError(f"id_token 검증 실패: {exc}") from exc
    except Exception as exc:  # JWKS 조회 등 네트워크 오류
        raise GoogleTokenError(f"구글 키 조회 실패: {exc}") from exc

    if claims.get("iss") not in _GOOGLE_ISSUERS:
        raise GoogleTokenError("issuer 가 구글이 아닙니다.")
    if not claims.get("sub"):
        raise GoogleTokenError("sub 클레임이 없습니다.")
    return claims
