from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import (
    ConversationContextLit,
    RecommendedAction,
    SafetyEventTypeOrNone,
    SafetyGrade,
    SafetyGradeOrNone,
)


# ---- Safety classifier ----
class DialogueTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str


class SafetyClassifyRequest(BaseModel):
    patient_id: str
    text: str
    source: Literal["conversation_message", "checkin_free_note", "conversation_pattern"]
    conversation_context: ConversationContextLit | None = None
    recent_dialogue: list[DialogueTurn] = Field(default_factory=list)


class SafetyClassifyResponse(BaseModel):
    classified: bool
    grade: SafetyGradeOrNone
    event_type: SafetyEventTypeOrNone
    confidence: float = Field(ge=0, le=1)
    matched_by: Literal["rule_keyword", "llm_classifier", "both", "none"]
    safety_event_id: str | None = None
    recommended_action: RecommendedAction


# ---- Stage tracker ----
class StageTrackRequest(BaseModel):
    conversation_id: str
    session_id: str
    week_number: int = Field(ge=1, le=12)
    current_step: int = Field(ge=1, le=5)
    step_objectives: list[str] = Field(default_factory=list)
    dialogue: list[dict] = Field(default_factory=list)


class StageTrackResponse(BaseModel):
    current_step: int = Field(ge=1, le=5)
    ready_to_advance: bool
    step_completion_estimate: float = Field(ge=0, le=1)
    step_drift_risk: Literal["low", "medium", "high"]
    delivered_objectives: list[str]
    recommended_next_action: Literal["advance_step", "redirect_to_step_topic", "continue_current"]


# ---- Session summarizer ----
class SessionSummarizeRequest(BaseModel):
    session_id: str
    patient_id: str
    week_number: int = Field(ge=1, le=12)
    full_dialogue: list[dict]
    session_objectives: list[str]
    previous_summary: dict | None = None
    patient_context: dict = Field(default_factory=dict)
    async_: bool = Field(default=False, alias="async")


class TriggerEntry(BaseModel):
    tag: str
    context: str


class SafetyFlag(BaseModel):
    grade: SafetyGrade
    event_type: str


class SessionSummary(BaseModel):
    session_completed_objectives: list[str] = Field(default_factory=list)
    session_unaddressed_objectives: list[str] = Field(default_factory=list)
    patient_key_insights: list[str] = Field(default_factory=list)
    identified_triggers: list[TriggerEntry] = Field(default_factory=list)
    assigned_homework: str = ""
    emotional_tone: Literal["engaged", "resistant", "low", "volatile", "neutral"] = "neutral"
    next_session_handoff_notes: str = ""
    safety_flags: list[SafetyFlag] = Field(default_factory=list)
    generated_at: datetime
    model_used: str = "claude-sonnet-4-6"
    generation_time_ms: int = 0


class SessionSummarizeAsyncAck(BaseModel):
    job_id: str
    status: Literal["queued", "processing"]


# ---- Output filter ----
class OutputFilterRequest(BaseModel):
    text: str
    conversation_context: ConversationContextLit
    message_id: str | None = None


class Violation(BaseModel):
    filter: Literal["medical_terminology", "ave_violation", "mi_style"]
    severity: Literal["low", "medium", "high"]
    matched_text: str
    reasoning: str


class OutputFilterResponse(BaseModel):
    passed: bool
    violations: list[Violation] = Field(default_factory=list)
    recommended_action: Literal["allow", "regenerate", "fallback"]


# ---- LLM gateway ----
class LLMInvokeRequest(BaseModel):
    model: Literal["claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"]
    messages: list[dict]
    system: str | None = None
    max_tokens: int = Field(ge=1)
    temperature: float | None = Field(default=None, ge=0, le=1)
    stream: bool = False
    patient_id: str
    purpose: Literal[
        "patient_dialogue",
        "safety_classification",
        "stage_tracking",
        "session_summarization",
        "output_filtering",
        "trigger_normalization",
        "module_classification",
    ]
    caller_component: Literal[
        "orchestrator",
        "safety_classifier",
        "stage_tracker",
        "session_summarizer",
        "output_filter",
        "trigger_normalizer",
        "module_classifier",
    ]


class LLMUsageBlock(BaseModel):
    input_tokens: int
    output_tokens: int


class LLMInvokeResponse(BaseModel):
    content: str
    usage: LLMUsageBlock
    stop_reason: str
    invocation_id: str


class LLMUsageOut(BaseModel):
    date: date
    used_tokens: int
    daily_quota: int
    quota_remaining: int
    breakdown_by_model: dict[str, int]


# ---- Phase 3 module classifier ----
# CBI Phase 3 모듈 9종 (NIAAA CBI §5). 분류기는 환자 기능분석 데이터로 1~2개를 고른다.
ModuleCode = Literal[
    "CRAV", "DREF", "MOOD", "ASSN", "COMM", "JOBF", "SARC", "SSSO", "MUTU"
]


class ModuleClassifyRequest(BaseModel):
    patient_id: str
    week_number: int = Field(ge=1, le=12)
    normalized_triggers: list[str] = Field(default_factory=list)
    comorbidities: list[str] = Field(default_factory=list)
    recent_checkins: list[dict] = Field(default_factory=list)
    previous_modules: list[str] = Field(default_factory=list)


class ModuleClassifyResponse(BaseModel):
    selected_modules: list[ModuleCode] = Field(default_factory=list, max_length=2)
    rationale: str = ""
    confidence: float = Field(default=0.0, ge=0, le=1)


# ---- Context builder ----
class ContextBuildRequest(BaseModel):
    patient_id: str
    context_type: ConversationContextLit
    week_number: int | None = Field(default=None, ge=1, le=12)


class ContextBuildResponse(BaseModel):
    system_prompt: str
    context_blocks: dict[str, Any]
    prompt_version: str


# ---- Trigger normalize ----
class TriggerNormalizeRequest(BaseModel):
    raw_text: str


class TriggerNormalizeResponse(BaseModel):
    normalized_tags: list[str]
    confidence: float = Field(ge=0, le=1)
    reasoning: str


# ---- Health ----
class ComponentHealth(BaseModel):
    name: str
    status: Literal["healthy", "degraded", "unhealthy"]
    response_time_ms: int
    error_message: str | None = None
    last_success_at: datetime


class HealthResponse(BaseModel):
    overall_status: Literal["healthy", "degraded", "unhealthy"]
    components: list[ComponentHealth]
