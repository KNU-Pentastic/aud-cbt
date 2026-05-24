from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.checkin import CheckinOut
from app.schemas.common import ApiModel
from app.schemas.safety import SafetyEventOut


class ProviderProfile(BaseModel):
    model_config = ApiModel

    provider_id: str
    name: str
    email: EmailStr
    affiliation: str
    active_patient_count: int
    notification_preferences: dict = Field(default_factory=dict)


class Medication(BaseModel):
    name: str
    dose: str | None = None
    frequency: str | None = None
    note: str | None = None


class PrimaryTriggersInput(BaseModel):
    raw_text: str


class SupportPersonInput(BaseModel):
    name: str
    relationship: Literal["spouse", "parent", "sibling", "child", "friend", "other"]
    phone: str


class SupportPersonOut(SupportPersonInput):
    sso_id: str
    access_level: Literal["info_only"] = "info_only"


class DischargeProfileInput(BaseModel):
    name: str
    phone: str
    date_of_birth: date
    sex: Literal["male", "female", "other"]
    discharge_date: date
    diagnosis_severity: Literal["moderate", "severe"]
    admission_days: int = Field(ge=1)
    medications: list[Medication]
    comorbidities: list[
        Literal["depression", "anxiety", "insomnia", "ptsd", "bipolar", "other"]
    ] = Field(default_factory=list)
    suicide_ideation_history: Literal["none", "past", "during_admission", "current"]
    primary_triggers: PrimaryTriggersInput
    sso: SupportPersonInput
    next_outpatient_date: date


class PatientCreateResponse(BaseModel):
    patient_id: str
    registration_code: str
    expires_at: datetime
    normalized_triggers: list[str]


class RegistrationCodeRegenResponse(BaseModel):
    registration_code: str
    expires_at: datetime


class PatientListItem(BaseModel):
    model_config = ApiModel

    patient_id: str
    name: str
    current_week: int
    sobriety_days: int
    last_active_at: datetime | None = None
    program_status: Literal["active", "completed", "withdrawn"]
    llm_locked: bool
    unacknowledged_safety_events_count: int


class ProgressBlock(BaseModel):
    current_week: int
    sobriety_days: int
    medication_adherence_rate_30d: float


class SessionSummaryBlock(BaseModel):
    # 필드명은 openapi.yaml 의 SessionSummary 스키마와 정확히 일치시킨다.
    session_completed_objectives: list[str] = Field(default_factory=list)
    session_unaddressed_objectives: list[str] = Field(default_factory=list)
    patient_key_insights: list[str] = Field(default_factory=list)
    identified_triggers: list[dict] = Field(default_factory=list)
    assigned_homework: str = ""
    emotional_tone: str = "neutral"
    next_session_handoff_notes: str = ""
    safety_flags: list[dict] = Field(default_factory=list)
    generated_at: datetime | None = None
    model_used: str = "claude-sonnet-4-6"
    generation_time_ms: int = 0


class RecentSession(BaseModel):
    session_id: str
    week_number: int
    ended_at: datetime | None
    summary: SessionSummaryBlock | None = None


class RecentSafetyEvents(BaseModel):
    grade_a: list[SafetyEventOut] = Field(default_factory=list)
    grade_b: list[SafetyEventOut] = Field(default_factory=list)


class LLMLockStatus(BaseModel):
    locked: bool
    locked_at: datetime | None = None
    reason: str | None = None


class PatientDetailDashboard(BaseModel):
    patient_id: str
    discharge_profile: dict
    progress: ProgressBlock
    recent_checkins_30d: list[CheckinOut]
    active_session: dict | None = None
    recent_sessions: list[RecentSession]
    recent_safety_events: RecentSafetyEvents
    llm_lock_status: LLMLockStatus


class MedicationsUpdateIn(BaseModel):
    medications: list[Medication]
    change_note: str | None = None


class MedicationsUpdateOut(BaseModel):
    patient_id: str
    medications: list[Medication]
    updated_at: datetime


class NextOutpatientDateIn(BaseModel):
    next_outpatient_date: date
    change_note: str | None = None


class NextOutpatientDateOut(BaseModel):
    patient_id: str
    next_outpatient_date: date
    updated_at: datetime


class ProgramStatusIn(BaseModel):
    new_status: Literal["completed", "withdrawn"]
    reason: str | None = None


class ProgramStatusOut(BaseModel):
    patient_id: str
    program_status: str
    changed_at: datetime
