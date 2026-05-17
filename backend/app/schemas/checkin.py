from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.common import (
    ApiModel,
    NRSScore,
    RecommendedAction,
    SafetyEventType,
    SafetyGrade,
)


class MedicationRecord(BaseModel):
    medication_name: str
    taken: bool
    side_effect_note: str | None = None


class CheckinSubmit(BaseModel):
    mood_nrs: NRSScore
    craving_nrs: NRSScore
    sleep_hours: float = Field(ge=0, le=12)
    medication_records: list[MedicationRecord]
    free_note: str | None = Field(default=None, max_length=2000)


class CheckinPatch(BaseModel):
    mood_nrs: NRSScore | None = None
    craving_nrs: NRSScore | None = None
    sleep_hours: float | None = Field(default=None, ge=0, le=12)
    medication_records: list[MedicationRecord] | None = None
    free_note: str | None = Field(default=None, max_length=2000)


class CheckinOut(BaseModel):
    model_config = ApiModel

    checkin_id: str
    date: date
    mood_nrs: NRSScore
    craving_nrs: NRSScore
    sleep_hours: float
    medication_records: list[MedicationRecord]
    free_note: str | None
    submitted_at: datetime


class SafetyClassification(BaseModel):
    grade: SafetyGrade
    event_type: SafetyEventType
    next_action: RecommendedAction


class CheckinResponse(BaseModel):
    checkin: CheckinOut
    safety_classification: SafetyClassification | None = None
