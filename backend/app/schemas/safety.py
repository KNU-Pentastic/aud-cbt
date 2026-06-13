from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ApiModel, RecommendedAction, SafetyEventType, SafetyGrade


class P4ShownIn(BaseModel):
    trigger: Literal["auto_safety_event", "manual_button"]
    related_safety_event_id: str | None = Field(default=None, pattern=r"^se_[a-z0-9]+$")
    clicked_resource: Literal["1393", "119", "sso", "none"] | None = None


class P4ShownOut(BaseModel):
    p4_event_id: str
    shown_at: datetime


class SafetyEventOut(BaseModel):
    model_config = ApiModel

    safety_event_id: str
    grade: SafetyGrade
    event_type: SafetyEventType
    detected_at: datetime
    source: Literal["conversation_message", "checkin_free_note", "conversation_pattern"]
    recommended_action: RecommendedAction
    # 의료진이 '왜 이 알림이 떴는지' 판단할 수 있도록 탐지 방식·신뢰도·사유·근거를 노출.
    matched_by: Literal["rule_keyword", "llm_classifier", "both", "none"] = "none"
    confidence: float = 0.0
    reasoning: str | None = None
    matched_keyword: str | None = None
    evidence_span: str | None = None
