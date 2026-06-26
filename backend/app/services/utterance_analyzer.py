"""환자 발화 분석기 — 정량 평가용. Haiku.

매 환자 발화를 감정·의도·인지왜곡·갈망강도·관련 CBT 단계로 구조화 분석한다.
데모·평가(LLM_TRACE) 전용이며, 치료 응답 생성에는 전혀 관여하지 않는다 — '코치가
왜 이렇게 답했는가'를 평가자가 읽을 수 있도록 환자 발화를 해석해 보여줄 뿐이다.
"""

from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from app.config import settings
from app.schemas.internal import (
    LLMInvokeRequest,
    UtteranceAnalysisRequest,
    UtteranceAnalysisResponse,
)
from app.services import llm_gateway

_SYS = (
    "You are a clinical utterance analyzer for a Korean alcohol-use-disorder CBT app. "
    "Analyze ONLY the latest patient utterance, using the prior dialogue as context. "
    "Report the patient's emotional state, communicative intent, any cognitive "
    "distortions (e.g. 흑백논리, 재앙화, 과잉일반화, 절제위반효과(AVE)), an estimated "
    "craving intensity (0=none, 10=overwhelming), key topics, and which of the 5 CBT "
    "session steps it most relates to (1=체크인 리뷰, 2=과제 리뷰, 3=핵심 콘텐츠, "
    "4=개인화, 5=이번 주 과제; use null if unrelated). "
    "Every string value MUST be natural Korean. Keep 'summary' to one sentence "
    "explaining what the coach should attend to in the reply. "
    'Reply ONLY with strict JSON: {"primary_emotion": str, "emotions": [str], '
    '"intent": str, "cognitive_distortions": [str], "craving_intensity": 0..10, '
    '"topics": [str], "relevant_step": 1..5 or null, "summary": str}'
)


def _str_list(value: object, limit: int = 6) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(x) for x in value if str(x).strip()][:limit]


def analyze(db: Session, req: UtteranceAnalysisRequest) -> UtteranceAnalysisResponse:
    messages: list[dict] = []
    for turn in (req.recent_dialogue or [])[-4:]:
        messages.append({"role": turn.role, "content": turn.text})
    messages.append({"role": "user", "content": req.text})

    try:
        resp = llm_gateway.invoke(
            db,
            LLMInvokeRequest(
                model=settings.llm_model_classifier,
                messages=messages,
                system=_SYS,
                max_tokens=400,
                temperature=0.0,
                stream=False,
                patient_id=req.patient_id,
                purpose="utterance_analysis",
                caller_component="utterance_analyzer",
            ),
        )
        m = re.search(r"\{.*\}", resp.content, re.S)
        data = json.loads(m.group(0)) if m else {}
    except Exception:
        data = {}

    try:
        craving = int(round(float(data.get("craving_intensity", 0))))
    except (TypeError, ValueError):
        craving = 0
    craving = max(0, min(10, craving))

    step = data.get("relevant_step")
    try:
        step = int(step) if step is not None else None
    except (TypeError, ValueError):
        step = None
    if step is not None and not (1 <= step <= 5):
        step = None

    return UtteranceAnalysisResponse(
        primary_emotion=str(data.get("primary_emotion", "") or ""),
        emotions=_str_list(data.get("emotions")),
        intent=str(data.get("intent", "") or ""),
        cognitive_distortions=_str_list(data.get("cognitive_distortions")),
        craving_intensity=craving,
        topics=_str_list(data.get("topics")),
        relevant_step=step,
        summary=str(data.get("summary", "") or ""),
    )
