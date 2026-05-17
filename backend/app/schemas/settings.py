from pydantic import BaseModel, Field

from app.schemas.provider import SupportPersonOut


class SettingsOut(BaseModel):
    daily_checkin_time: str
    session_day_of_week: int = Field(ge=0, le=6)
    sso: SupportPersonOut | None = None


class SettingsPatch(BaseModel):
    daily_checkin_time: str | None = None
    session_day_of_week: int | None = Field(default=None, ge=0, le=6)
