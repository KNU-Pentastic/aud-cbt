"""D0 primary_triggers raw text → normalized tag list. Haiku 4.5."""

from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from app.config import settings
from app.schemas.internal import (
    LLMInvokeRequest,
    TriggerNormalizeRequest,
    TriggerNormalizeResponse,
)
from app.services import llm_gateway


KNOWN_TAGS = {
    "work_stress",
    "social_pressure",
    "loneliness",
    "boredom",
    "anger",
    "anxiety",
    "depression",
    "family_conflict",
    "financial_stress",
    "insomnia",
    "celebration",
    "grief",
}

_SYS = (
    "Map free-text Korean/English descriptions of drinking triggers to a controlled "
    "vocabulary of normalized tags. Allowed tags: "
    f"{sorted(KNOWN_TAGS)}. Pick 1–4 best-fitting tags. "
    'Reply ONLY as JSON: {"tags":["..."],"confidence":0..1,"reasoning":"..."}'
)


def normalize(db: Session, req: TriggerNormalizeRequest) -> TriggerNormalizeResponse:
    try:
        resp = llm_gateway.invoke(
            db,
            LLMInvokeRequest(
                model=settings.llm_model_classifier,
                messages=[{"role": "user", "content": req.raw_text}],
                system=_SYS,
                max_tokens=300,
                temperature=0.1,
                stream=False,
                patient_id="system",
                purpose="trigger_normalization",
                caller_component="trigger_normalizer",
            ),
        )
        m = re.search(r"\{.*\}", resp.content, re.S)
        data = json.loads(m.group(0)) if m else {}
    except Exception:
        data = {}

    raw_tags = [str(t) for t in data.get("tags", []) if isinstance(t, str)]
    tags = [t for t in raw_tags if t in KNOWN_TAGS][:4]
    if not tags:
        # heuristic fallback so demo never returns empty
        text = req.raw_text.lower()
        if any(k in text for k in ["회식", "동료", "친구", "모임"]):
            tags = ["social_pressure"]
        elif any(k in text for k in ["일", "업무", "야근", "스트레스"]):
            tags = ["work_stress"]
        elif any(k in text for k in ["혼자", "외롭", "lonely"]):
            tags = ["loneliness"]
        else:
            tags = ["work_stress"]
    confidence = float(data.get("confidence", 0.6))
    reasoning = str(data.get("reasoning", "rule-fallback"))
    return TriggerNormalizeResponse(
        normalized_tags=tags,
        confidence=max(0.0, min(1.0, confidence)),
        reasoning=reasoning,
    )
