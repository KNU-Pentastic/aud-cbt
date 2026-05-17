from datetime import date

from pydantic import BaseModel

from app.schemas.common import ApiModel


class TodayTasks(BaseModel):
    checkin_pending: bool
    session_today: bool


class PatientHomeResponse(BaseModel):
    model_config = ApiModel

    patient_id: str
    name: str
    sobriety_days: int
    current_week: int
    days_to_next_session: int | None = None
    today_tasks: TodayTasks
    next_outpatient_date: date | None = None
    llm_locked: bool = False


class ProgressResponse(BaseModel):
    sobriety_days: int
    weeks_completed: int
    current_week: int
    next_session_date: date | None = None
