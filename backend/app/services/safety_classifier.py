"""Safety classifier — rule + LLM hybrid. Recall > Precision.

Per func spec §6.1: 5 risk types, 2 grades.
  Grade A (emergency): suicide_risk, acute_intoxication  → llm_lock_p4
  Grade B (non-emergency): relapse → switch_resu, medication_stop → switch_soma,
                          paws → paws_resource
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.ids import safety_event_id
from app.models.patient import Patient
from app.models.safety_event import SafetyEvent
from app.schemas.internal import (
    LLMInvokeRequest,
    SafetyClassifyRequest,
    SafetyClassifyResponse,
)
from app.services import llm_gateway


# ---------- Keyword rules (conservative; recall-oriented) ----------

_RULES_A_SUICIDE = [
    "자살", "죽고 싶", "사라지고 싶", "끝내고 싶", "목숨", "유서",
    "kill myself", "end it all", "suicide",
]

_RULES_A_INTOX = [
    "지금 마시", "방금 마셨", "취했", "한 병 다", "토했", "필름이 끊",
    "drunk now", "i'm drinking right now",
]

_RULES_B_RELAPSE = [
    "어제 한 잔", "그제 마셨", "다시 마셨", "오늘 마셨", "참다가 마셨", "한 모금",
    "drank yesterday", "had a drink",
]

_RULES_B_MEDSTOP = [
    "약 안 먹", "약 끊", "복용 중단", "복약 안", "약 끊은", "약을 안",
    "stopped meds", "skipping pills",
]

_RULES_B_PAWS = [
    "잠을 못", "한 달째 잠", "집중이 안", "계속 불안", "갈망이 가시질",
    "can't sleep for", "constant cravings",
]


def _scan(text: str, rules: list[str]) -> str | None:
    low = text.lower()
    for r in rules:
        if r.lower() in low:
            return r
    return None


def _rule_classify(text: str) -> tuple[str, str, str] | None:
    """Returns (grade, event_type, matched_keyword) or None."""
    if m := _scan(text, _RULES_A_SUICIDE):
        return "A", "suicide_risk", m
    if m := _scan(text, _RULES_A_INTOX):
        return "A", "acute_intoxication", m
    if m := _scan(text, _RULES_B_RELAPSE):
        return "B", "relapse", m
    if m := _scan(text, _RULES_B_MEDSTOP):
        return "B", "medication_stop", m
    if m := _scan(text, _RULES_B_PAWS):
        return "B", "paws", m
    return None


_LLM_SYSTEM = (
    "You are a clinical safety classifier for an alcohol-use-disorder CBT app. "
    "Classify the patient text into one of: suicide_risk, acute_intoxication, "
    "relapse, medication_stop, paws, or none. Assign grade A for "
    "suicide_risk/acute_intoxication, grade B for relapse/medication_stop/paws, "
    "grade none otherwise. Be conservative — when in doubt, flag the higher grade. "
    "Reply ONLY with strict JSON: "
    '{"grade":"A|B|none","event_type":"...","confidence":0..1}'
)


def _llm_classify(db: Session, req: SafetyClassifyRequest) -> tuple[str, str, float] | None:
    """Returns (grade, event_type, confidence). None on failure → caller treats as miss."""
    messages = []
    for turn in (req.recent_dialogue or [])[-4:]:
        messages.append({"role": turn.role, "content": turn.text})
    messages.append({"role": "user", "content": req.text})
    try:
        resp = llm_gateway.invoke(
            db,
            LLMInvokeRequest(
                model=settings.llm_model_classifier,
                messages=messages,
                system=_LLM_SYSTEM,
                max_tokens=200,
                temperature=0.0,
                stream=False,
                patient_id=req.patient_id,
                purpose="safety_classification",
                caller_component="safety_classifier",
            ),
        )
    except Exception:
        return None
    try:
        m = re.search(r"\{.*\}", resp.content, re.S)
        data = json.loads(m.group(0)) if m else json.loads(resp.content)
    except Exception:
        return None
    grade = str(data.get("grade", "none"))
    event_type = str(data.get("event_type", "none"))
    conf = float(data.get("confidence", 0.0))
    if grade not in ("A", "B", "none"):
        return None
    if grade != "none" and event_type not in (
        "suicide_risk",
        "acute_intoxication",
        "relapse",
        "medication_stop",
        "paws",
    ):
        return None
    return grade, event_type, conf


def _recommended_action(grade: str, event_type: str) -> str:
    if grade == "A":
        return "llm_lock_p4"
    if event_type == "relapse":
        return "switch_resu"
    if event_type == "medication_stop":
        return "switch_soma"
    if event_type == "paws":
        return "paws_resource"
    return "none"


def classify(db: Session, req: SafetyClassifyRequest) -> SafetyClassifyResponse:
    rule_hit = _rule_classify(req.text)
    llm_hit = _llm_classify(db, req)

    if rule_hit and llm_hit:
        # Take the higher-severity result
        r_grade, r_event, _ = rule_hit
        l_grade, l_event, l_conf = llm_hit
        if r_grade == "A" or l_grade == "A":
            grade, event_type = ("A", r_event if r_grade == "A" else l_event)
        elif r_grade == "B" or l_grade == "B":
            grade, event_type = ("B", r_event if r_grade == "B" else l_event)
        else:
            grade, event_type = "none", "none"
        matched_by = "both"
        confidence = max(0.85, l_conf)
    elif rule_hit:
        grade, event_type, _ = rule_hit
        matched_by = "rule_keyword"
        confidence = 0.8
    elif llm_hit:
        grade, event_type, llm_conf = llm_hit
        matched_by = "llm_classifier"
        confidence = llm_conf
    else:
        grade, event_type, matched_by, confidence = "none", "none", "none", 0.05

    se_id: str | None = None
    recommended = _recommended_action(grade, event_type) if grade != "none" else "none"
    classified = grade != "none"

    if classified:
        evt = SafetyEvent(
            safety_event_id=safety_event_id(),
            patient_id=req.patient_id,
            grade=grade,
            event_type=event_type,
            source=req.source,
            recommended_action=recommended,
            matched_by=matched_by,
            confidence=confidence,
            raw_text=req.text[:4000],
        )
        db.add(evt)

        if grade == "A":
            patient = db.get(Patient, req.patient_id)
            if patient is not None and not patient.llm_locked:
                patient.llm_locked = True
                patient.llm_locked_at = datetime.now(timezone.utc)
                patient.llm_lock_reason = event_type

        db.commit()
        db.refresh(evt)
        se_id = evt.safety_event_id

    return SafetyClassifyResponse(
        classified=classified,
        grade=grade,  # type: ignore[arg-type]
        event_type=event_type,  # type: ignore[arg-type]
        confidence=round(confidence, 3),
        matched_by=matched_by,  # type: ignore[arg-type]
        safety_event_id=se_id,
        recommended_action=recommended,  # type: ignore[arg-type]
    )
