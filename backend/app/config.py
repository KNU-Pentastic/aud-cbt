import hashlib
from functools import lru_cache
from typing import List

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# 운영 환경에서 그대로 두면 안 되는 안전하지 않은 기본값들 — fail-fast 의 판단 기준.
_INSECURE_JWT_SECRET = "change-me"
_INSECURE_INTERNAL_KEY = "dev-internal-key-change-me"
_NON_PROD_ENVS = {"development", "dev", "test", "local"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    app_port: int = 8000
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg2://aud:aud@localhost:5432/aud_cbt"
    database_url_async: str = "postgresql+asyncpg://aud:aud@localhost:5432/aud_cbt"

    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    patient_token_ttl_seconds: int = 86400
    provider_token_ttl_seconds: int = 28800

    # 저장 PII(이름·전화·발화 원문 등 민감/식별정보) 암호화 키. Fernet(base64 32B) 형식.
    # 비워두면 개발 편의를 위해 jwt_secret 에서 결정론적으로 파생한다(운영 금지).
    pii_encryption_key: str = ""

    # 환자 구글 OAuth 2.1 로그인용 허용 client_id 목록(웹/iOS/안드 여러 개 가능, 콤마 구분).
    google_client_ids: str = ""

    internal_service_keys: str = "dev-internal-key-change-me"

    anthropic_api_key: str = ""
    use_llm_mock: bool = True
    llm_daily_token_quota: int = 200000
    llm_model_dialogue: str = "claude-opus-4-7"
    llm_model_tracking: str = "claude-sonnet-4-6"
    llm_model_classifier: str = "claude-haiku-4-5"
    # 라이브 대화 SSE 에 prompt-trace(참고 프롬프트)·stage_progress(주차/단계 진행도)
    # 이벤트를 실어 보낼지. 데모·디버깅용으로 기본 on. 운영에서는 LLM_TRACE=false 권장.
    llm_trace: bool = True

    registration_code_ttl_days: int = 7

    cors_origins: str = "http://localhost:3000,http://localhost:8081,http://localhost:19006"

    @field_validator("internal_service_keys", "cors_origins")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() not in _NON_PROD_ENVS

    @model_validator(mode="after")
    def _enforce_secure_production(self) -> "Settings":
        """운영 환경에서 안전하지 않은 기본 시크릿이 남아 있으면 기동을 막는다.

        안전성 확보조치 기준(접근통제·암호화)상 인증/내부 통신 비밀값이 공개된 기본값으로
        운영되는 것을 차단한다. 개발(app_env=development 등)에서는 그대로 통과시킨다.
        """
        if not self.is_production:
            return self
        problems: list[str] = []
        if self.jwt_secret == _INSECURE_JWT_SECRET:
            problems.append("JWT_SECRET")
        if _INSECURE_INTERNAL_KEY in self.internal_keys_set:
            problems.append("INTERNAL_SERVICE_KEYS")
        if not self.pii_encryption_key:
            problems.append("PII_ENCRYPTION_KEY")
        if problems:
            raise ValueError(
                "운영 환경(APP_ENV=%s)에서 안전하지 않은 기본값/미설정 항목: %s. "
                "각 항목에 강한 비밀값을 설정한 뒤 다시 기동하세요."
                % (self.app_env, ", ".join(problems))
            )
        return self

    @property
    def internal_keys_set(self) -> set[str]:
        return {k.strip() for k in self.internal_service_keys.split(",") if k.strip()}

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def google_client_id_set(self) -> set[str]:
        return {c.strip() for c in self.google_client_ids.split(",") if c.strip()}

    @property
    def pii_key_material(self) -> bytes:
        """Fernet 키(32바이트 url-safe base64). 미설정 시 jwt_secret 에서 파생(개발 전용)."""
        import base64

        raw = self.pii_encryption_key.strip()
        if raw:
            return raw.encode("utf-8")
        digest = hashlib.sha256(("pii::" + self.jwt_secret).encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest)

    @property
    def llm_mock_enabled(self) -> bool:
        return self.use_llm_mock or not self.anthropic_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
