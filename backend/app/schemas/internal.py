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
    text: str = Field(max_length=16_000)


class SafetyClassifyRequest(BaseModel):
    patient_id: str
    text: str = Field(max_length=16_000)
    source: Literal["conversation_message", "checkin_free_note", "conversation_pattern"]
    conversation_context: ConversationContextLit | None = None
    recent_dialogue: list[DialogueTurn] = Field(default_factory=list, max_length=500)


class SafetyClassifyResponse(BaseModel):
    classified: bool
    grade: SafetyGradeOrNone
    event_type: SafetyEventTypeOrNone
    confidence: float = Field(ge=0, le=1)
    matched_by: Literal["rule_keyword", "llm_classifier", "both", "none"]
    safety_event_id: str | None = None
    recommended_action: RecommendedAction
    # 의료진 알림에 '왜 잡혔는지' 표시하기 위한 사유/근거.
    reasoning: str | None = None
    matched_keyword: str | None = None
    evidence_span: str | None = None


# ---- Utterance analyzer (정량 평가용 발화 분석; LLM_TRACE 전용) ----
class UtteranceAnalysisRequest(BaseModel):
    patient_id: str
    text: str = Field(max_length=16_000)
    conversation_context: ConversationContextLit | None = None
    recent_dialogue: list[DialogueTurn] = Field(default_factory=list, max_length=500)


class UtteranceAnalysisResponse(BaseModel):
    primary_emotion: str = ""
    emotions: list[str] = Field(default_factory=list)
    intent: str = ""
    cognitive_distortions: list[str] = Field(default_factory=list)
    craving_intensity: int = Field(default=0, ge=0, le=10)
    topics: list[str] = Field(default_factory=list)
    relevant_step: int | None = Field(default=None, ge=1, le=5)
    summary: str = ""


# ---- Stage tracker ----
class StageTrackRequest(BaseModel):
    conversation_id: str
    session_id: str
    week_number: int = Field(ge=1, le=12)
    current_step: int = Field(ge=1, le=5)
    step_objectives: list[str] = Field(default_factory=list)
    dialogue: list[dict] = Field(default_factory=list, max_length=500)


class StageTrackResponse(BaseModel):
    # 대화가 지금까지 도달한 절대 단계(1~5). 단조 비감소 — 기록된 단계 아래로 내려가지 않는다.
    current_step: int = Field(ge=1, le=5)
    ready_to_advance: bool
    step_completion_estimate: float = Field(ge=0, le=1)
    delivered_objectives: list[str]
    recommended_next_action: Literal["advance_step", "continue_current"]
    # 추적 판단이 실제로 이뤄졌는지. LLM 호출 실패(Anthropic 장애)나 파싱 실패로 판단을
    # 얻지 못하면 False — 이때 단계는 전진하지 않는다. 호출부가 '진짜 미완료'와 '장애로
    # 판단 불가'를 구분해, 장애로 얼어붙은 단계를 종료 시 복구할지 결정하는 데 쓴다.
    tracked: bool = True


# ---- Session summarizer ----
class SessionSummarizeRequest(BaseModel):
    session_id: str
    patient_id: str
    week_number: int = Field(ge=1, le=12)
    full_dialogue: list[dict] = Field(max_length=800)
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
    text: str = Field(max_length=16_000)
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
    messages: list[dict] = Field(max_length=500)
    system: str | None = Field(default=None, max_length=100_000)
    # 호출당 출력 토큰 상한 — 한 번의 호출이 막대한 출력 비용을 내지 못하게 막는다.
    max_tokens: int = Field(ge=1, le=4096)
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
        "utterance_analysis",
    ]
    caller_component: Literal[
        "orchestrator",
        "safety_classifier",
        "stage_tracker",
        "session_summarizer",
        "output_filter",
        "trigger_normalizer",
        "module_classifier",
        "utterance_analyzer",
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
    # 세션 대화에서 '지금 몇 단계인지'를 코치 프롬프트에 주입하기 위함. None 이면 1단계로 본다.
    current_step: int | None = Field(default=None, ge=1, le=5)


class ContextBuildResponse(BaseModel):
    system_prompt: str
    context_blocks: dict[str, Any]
    prompt_version: str


# ---- Trigger normalize ----
class TriggerNormalizeRequest(BaseModel):
    raw_text: str = Field(max_length=4_000)


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
