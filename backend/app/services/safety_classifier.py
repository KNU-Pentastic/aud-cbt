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
    "자살", "죽고 싶", "사라지고 싶", "목숨", "유서",
    # "끝내고 싶"는 "프로그램/일을 끝내고 싶다"(종료 의사)와 충돌해 거짓양성을
    # 유발한다(ST-06: 멀쩡한 환자 응급 잠금). 자살 맥락이 분명한 변형만 룰로 두고,
    # 모호한 "끝내고 싶"는 LLM 맥락 판단에 맡긴다.
    "삶을 끝내", "생을 끝내", "인생을 끝내", "다 끝내버리",
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


# 자살 의사를 '부정'하는 표현("죽고 싶지 않아", "사라지고 싶진 않아", "죽고 싶지도 않")은
# 룰 키워드 "죽고 싶"의 부분문자열로 잡혀 suicide_risk 오탐을 낸다. 환자가 "죽고 싶지
# 않아, 그냥 술 마시고 싶어"처럼 부정을 반복하면 잠금→해제→재잠금 루프가 된다(ST 계열
# 오탐, "끝내고 싶" 제외와 같은 맥락). 죽음 욕구에 붙은 부정("...싶지/싶진 ...않")만 골라
# 룰 매칭에서 제외한다. LLM 분류는 그대로 돌아가므로 진짜 위험은 여전히 잡힌다.
_SUICIDE_NEGATION_RE = re.compile(r"(죽고|사라지고)\s*싶(지|진)[^않]{0,3}않")


def _scan(text: str, rules: list[str]) -> str | None:
    low = text.lower()
    for r in rules:
        if r.lower() in low:
            return r
    return None


def _suicide_match(text: str) -> str | None:
    """자살 룰 매칭 — 단, 죽음 욕구의 '부정형'만 있는 경우는 제외한다.

    '죽고 싶지 않아'(자살 의사 부정)는 "죽고 싶" 부분문자열로 잡혀 grade A 오탐을 내고,
    환자가 부정을 반복하면 잠금→해제→재잠금 루프가 된다. 부정된 죽음 욕구를 지운 뒤에도
    남는 자살 신호(예: '자살', '유서', 부정 안 된 '죽고 싶어')가 있으면 그것을 반환해
    recall 은 유지한다.
    """
    m = _scan(text, _RULES_A_SUICIDE)
    if m is None:
        return None
    if m in ("죽고 싶", "사라지고 싶") and _SUICIDE_NEGATION_RE.search(text):
        residual = _SUICIDE_NEGATION_RE.sub(" ", text)
        return _scan(residual, _RULES_A_SUICIDE)
    return m


def _rule_classify(text: str) -> tuple[str, str, str] | None:
    """Returns (grade, event_type, matched_keyword) or None."""
    if m := _suicide_match(text):
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
    "Judge by accumulated context, not single keywords, and do not let soft, calm, "
    "or matter-of-fact phrasing hide real risk. "
    "suicide_risk ALWAYS takes priority over any grade B event when both could apply.\n"
    "suicide_risk signals (grade A) — include indirect / euphemistic forms:\n"
    "- explicit ideation, plan, attempt, or means (mentioning, staring at, or "
    "stockpiling a method, e.g. '약을 다 모아놨어요').\n"
    "- passive death wish: wishing not to wake up / not to exist "
    "(e.g. '아침에 눈이 안 떠졌으면 좋겠어요'); treat as suicide even if it sounds "
    "like fatigue or a sleep complaint.\n"
    "- pervasive hopelessness / meaninglessness / being unable to go on "
    "(e.g. '다 의미 없어요', '더는 못 버티겠어요', '살아갈 이유가 없어요').\n"
    "- worthlessness or being a burden (e.g. '내가 없는 게 나아요', '내가 죽으면 "
    "다들 편해질 거예요').\n"
    "- farewell or putting affairs in order (e.g. '미안하다는 말만 남기고', "
    "'다 정리하고 떠날 준비', '짐 정리를 다 했어요').\n"
    "- WARNING SIGN: a patient who voiced suicidal thoughts earlier and now turns "
    "suddenly calm or at peace ('마음이 오히려 편안해요'), or reports having finished "
    "putting affairs in order, is at IMMINENT risk — grade A, NOT recovered.\n"
    "Suicide vs medication boundary: pills/medication referenced as a possible MEANS "
    "of self-harm in a despair context — staring at, counting, or stockpiling them "
    "(e.g. '약통을 한참 들여다봤다' after dark thoughts) — is suicide_risk (grade A). "
    "medication_stop is ONLY about skipping or quitting one's prescribed doses, never "
    "about medication used as a means of self-harm.\n"
    "acute_intoxication vs relapse boundary:\n"
    "- acute_intoxication (grade A) = a physical emergency in progress: drinking "
    "right now / heavy drinking just now WITH acute physical symptoms (vomiting, "
    "nausea, dizziness, double vision, racing heart, tremor, feeling faint, "
    "blackout), overdose, mixing alcohol with pills, or a disulfiram reaction "
    "(e.g. '방금 한 병 다 비웠는데 속이 너무 안 좋아요').\n"
    "- relapse (grade B) = reporting a PAST drinking episode (yesterday, last week) "
    "after the fact with no acute physical emergency. If it is 'just now / right "
    "now' heavy drinking WITH acute symptoms, classify acute_intoxication (A).\n"
    "Relapse boundary (do NOT over-flag relapse; these are grade none):\n"
    "- 'relapse' = a NEW, not-yet-reported episode of ACTUALLY consuming alcohol "
    "(already drank or drinking now, even a single small slip).\n"
    "- A craving, wish, or hypothetical/conditional about drinking that has NOT "
    "happened (e.g. '한 잔만 마시면 풀릴 것 같다', 'I feel like a drink') is NOT relapse.\n"
    "- Reacting to or catastrophizing about a drinking episode ALREADY reported "
    "earlier in THIS conversation, with no new drinking (e.g. '한 번 마셨으니 이번 "
    "주는 망했다'), is an abstinence-violation cognitive distortion, NOT a new event.\n"
    "paws (grade B) = post-cessation symptoms persisting for weeks to months: "
    "insomnia / sleep disturbance, poor concentration / brain fog, anxiety, low "
    "mood, cravings, irritability / emotional lability, tremor / sweats / headache, "
    "daytime fatigue or low energy.\n"
    "Do NOT over-flag these (grade none): idioms of distress ('아 죽겠다ㅋㅋ', "
    "'잠 못 자 죽겠어요'); wanting to quit the 12-week PROGRAM (not suicide); "
    "temporary worry about one specific situation (≠ pervasive despair); "
    "successfully resisting a craving, a drinking cue, or medication reluctance "
    "(e.g. drank only cola, took the pill despite not wanting to).\n"
    "Recall > Precision: missing a real risk is far worse than a false alarm — but "
    "do not escalate clearly non-crisis context above.\n"
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
    if grade == "none":
        # grade=none이면 event_type 은 의미가 없다. LLM 이 자유 텍스트
        # (예: "program_fatigue")를 반환해도 스키마(SafetyEventTypeOrNone)에 맞게
        # "none" 으로 정규화한다 — 응답 검증 오류(500) 방지.
        event_type = "none"
    elif event_type not in (
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
                # A fresh lock supersedes any previous provider unlock.
                patient.llm_unlocked_at = None
                patient.llm_unlocked_by = None
                patient.llm_unlock_note = None

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
