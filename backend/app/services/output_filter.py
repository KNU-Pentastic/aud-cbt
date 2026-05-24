"""Output filter — 2 checks: medical terminology, AVE (Abstinence Violation Effect).

Hybrid rule + Haiku LLM. On violation, returns recommended_action so the orchestrator
can regenerate (≤2 retries) or fall back to a safe stock message.
"""

from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from app.config import settings
from app.schemas.internal import LLMInvokeRequest, OutputFilterRequest, OutputFilterResponse, Violation
from app.services import llm_gateway, prompt_assets


_MEDICAL_PATTERNS = [
    (re.compile(r"진단(됩니|드립|을 내|을 받)"), "diagnostic claim"),
    (re.compile(r"처방(합니|해드|을 드|드립)"), "prescription claim"),
    (re.compile(r"(증량|감량|복용량을? (늘|줄))"), "dose adjustment"),
    (re.compile(r"약을? (끊|중단)(하세|해도)"), "stop-meds advice"),
]

_AVE_PATTERNS = [
    (re.compile(r"한 ?잔(은|쯤)? ?(괜찮|괜찮|문제 ?없)"), "minimization"),
    (re.compile(r"(망쳤|다 끝)"), "abstinence-violation framing"),
    (re.compile(r"술 ?한 ?잔(은|쯤)?(이라도)? ?(괜찮|괜찮)"), "minimization"),
]


def _rule_scan(text: str) -> list[Violation]:
    out: list[Violation] = []
    for pat, reason in _MEDICAL_PATTERNS:
        if m := pat.search(text):
            out.append(
                Violation(
                    filter="medical_terminology",
                    severity="high",
                    matched_text=m.group(0),
                    reasoning=reason,
                )
            )
    for pat, reason in _AVE_PATTERNS:
        if m := pat.search(text):
            out.append(
                Violation(
                    filter="ave_violation",
                    severity="high",
                    matched_text=m.group(0),
                    reasoning=reason,
                )
            )
    return out


def _mi_style_rules() -> str:
    """OUTPUT_GUARD (CBI) MI-style checks, loaded from the curated asset."""
    asset = prompt_assets.load_asset("output_guard")
    rules = (asset or {}).get("rules_ko", [])
    return "\n".join(f"  - {r}" for r in rules)


_LLM_SYSTEM = (
    "You audit assistant replies in an alcohol-use-disorder CBT app. "
    "Flag three issue types: (1) medical_terminology — diagnoses, prescriptions, "
    "dose changes, or telling patient to stop meds; (2) ave_violation — minimizing "
    "a slip, encouraging 'just one drink', or framing a slip as total failure; "
    "(3) mi_style — motivational-interviewing style breaches per these rules "
    f"(Korean):\n{_mi_style_rules()}\n"
    "Treat medical_terminology and ave_violation as high severity; mi_style as low/medium. "
    "Reply ONLY as strict JSON: "
    '{"violations":[{"filter":"medical_terminology|ave_violation|mi_style",'
    '"severity":"low|medium|high","matched_text":"...","reasoning":"..."}]}'
)


def _llm_scan(db: Session, text: str) -> list[Violation]:
    try:
        resp = llm_gateway.invoke(
            db,
            LLMInvokeRequest(
                model=settings.llm_model_classifier,
                messages=[{"role": "user", "content": text}],
                system=_LLM_SYSTEM,
                max_tokens=400,
                temperature=0.0,
                stream=False,
                patient_id="system",
                purpose="output_filtering",
                caller_component="output_filter",
            ),
        )
        m = re.search(r"\{.*\}", resp.content, re.S)
        data = json.loads(m.group(0)) if m else {}
    except Exception:
        return []
    out: list[Violation] = []
    for v in data.get("violations", []):
        try:
            out.append(
                Violation(
                    filter=v["filter"],
                    severity=v.get("severity", "medium"),
                    matched_text=str(v.get("matched_text", ""))[:200],
                    reasoning=str(v.get("reasoning", "")),
                )
            )
        except Exception:
            continue
    return out


def check(db: Session, req: OutputFilterRequest) -> OutputFilterResponse:
    violations = _rule_scan(req.text) + _llm_scan(db, req.text)
    passed = not violations
    if passed:
        action = "allow"
    else:
        high = any(v.severity == "high" for v in violations)
        action = "fallback" if high else "regenerate"
    return OutputFilterResponse(passed=passed, violations=violations, recommended_action=action)
