from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    internal_service_keys: str = "dev-internal-key-change-me"

    anthropic_api_key: str = ""
    use_llm_mock: bool = True
    llm_daily_token_quota: int = 200000
    llm_model_dialogue: str = "claude-opus-4-7"
    llm_model_tracking: str = "claude-sonnet-4-6"
    llm_model_classifier: str = "claude-haiku-4-5"

    registration_code_ttl_days: int = 7

    cors_origins: str = "http://localhost:3000,http://localhost:8081,http://localhost:19006"

    @field_validator("internal_service_keys", "cors_origins")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @property
    def internal_keys_set(self) -> set[str]:
        return {k.strip() for k in self.internal_service_keys.split(",") if k.strip()}

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_mock_enabled(self) -> bool:
        return self.use_llm_mock or not self.anthropic_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
