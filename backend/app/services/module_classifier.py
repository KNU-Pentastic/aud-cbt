"""Phase 3 module classifier — picks 1~2 CBI modules for a patient (Haiku).

Why this exists: NIAAA CBI §5 makes Phase 3 individualized — the patient's functional
analysis (triggers, mood, comorbidity, support) decides which skill modules to run, and
no more than two at once (§2.6). Instead of a fixed week→module grid, this classifier
reads the patient's data and selects the relevant module(s). context_builder then injects
the matching curated prompt block(s).

Selection is cached in-process per (patient_id, week) so we don't pay an LLM call on every
message build. Persisting the choice (Session.selected_modules) is a possible follow-up for
provider visibility; not required for MVP.
"""

from __future__ import annotations

import json
import re
import time

from sqlalchemy.orm import Session

from app.config import settings
from app.schemas.internal import (
    LLMInvokeRequest,
    ModuleClassifyRequest,
    ModuleClassifyResponse,
)
from app.services import llm_gateway, prompt_assets

_VALID_CODES = {"CRAV", "DREF", "MOOD", "ASSN", "COMM", "JOBF", "SARC", "SSSO", "MUTU"}
_MAX_MODULES = 2

# (patient_id, week_number) -> (expires_at, response)
_cache: dict[tuple[str, int], tuple[float, ModuleClassifyResponse]] = {}
_CACHE_TTL_SECONDS = 3600


def _cache_get(patient_id: str, week: int) -> ModuleClassifyResponse | None:
    hit = _cache.get((patient_id, week))
    if hit and hit[0] > time.time():
        return hit[1]
    return None


def _cache_put(patient_id: str, week: int, resp: ModuleClassifyResponse) -> None:
    _cache[(patient_id, week)] = (time.time() + _CACHE_TTL_SECONDS, resp)


def _system_prompt() -> str:
    modules = prompt_assets.load_modules()
    catalogue = "\n".join(
        f"- {m['code']}: {m['name_ko']} — {m['signal_ko']}" for m in modules
    )
    return (
        "You assign CBI Phase 3 skill modules to an alcohol-use-disorder patient. "
        "Given the patient's functional-analysis signals (triggers, mood, comorbidity, "
        "support gaps), pick the 1 or 2 MOST relevant modules. Never pick more than 2. "
        "Prefer modules not yet covered when relevance is similar. Choose from these "
        f"codes only:\n{catalogue}\n"
        'Reply ONLY as strict JSON: {"selected_modules":["CODE"],'
        '"rationale":"<짧은 한국어 근거>","confidence":0..1}'
    )


def _heuristic(req: ModuleClassifyRequest) -> ModuleClassifyResponse:
    """Deterministic fallback when the LLM is unavailable or returns nothing usable."""
    triggers = " ".join(req.normalized_triggers).lower()
    comorb = " ".join(req.comorbidities).lower()
    picks: list[str] = []
    if any(k in comorb for k in ("depress", "anxiet", "우울", "불안")) or any(
        k in triggers for k in ("mood", "negative", "우울", "불안", "스트레스", "stress")
    ):
        picks.append("MOOD")
    if any(k in triggers for k in ("social", "pressure", "권유", "회식", "모임")):
        picks.append("DREF")
    if any(k in triggers for k in ("craving", "urge", "갈망", "충동")):
        picks.append("CRAV")
    if not picks:
        picks = ["CRAV"]  # craving coping is the safe Phase 3 default
    # drop already-covered when we still have alternatives
    fresh = [p for p in picks if p not in req.previous_modules]
    picks = (fresh or picks)[:_MAX_MODULES]
    return ModuleClassifyResponse(
        selected_modules=picks,  # type: ignore[arg-type]
        rationale="규칙 기반 기본 선택(트리거·동반질환).",
        confidence=0.3,
    )


def classify(db: Session, req: ModuleClassifyRequest) -> ModuleClassifyResponse:
    cached = _cache_get(req.patient_id, req.week_number)
    if cached is not None:
        return cached

    user = json.dumps(
        {
            "normalized_triggers": req.normalized_triggers,
            "comorbidities": req.comorbidities,
            "recent_checkins": req.recent_checkins[-7:],
            "previously_covered_modules": req.previous_modules,
        },
        ensure_ascii=False,
    )

    resp: ModuleClassifyResponse | None = None
    try:
        out = llm_gateway.invoke(
            db,
            LLMInvokeRequest(
                model=settings.llm_model_classifier,
                messages=[{"role": "user", "content": user}],
                system=_system_prompt(),
                max_tokens=200,
                temperature=0.0,
                stream=False,
                patient_id=req.patient_id,
                purpose="module_classification",
                caller_component="module_classifier",
            ),
        )
        m = re.search(r"\{.*\}", out.content, re.S)
        data = json.loads(m.group(0)) if m else {}
        codes = [c for c in data.get("selected_modules", []) if c in _VALID_CODES][:_MAX_MODULES]
        if codes:
            resp = ModuleClassifyResponse(
                selected_modules=codes,  # type: ignore[arg-type]
                rationale=str(data.get("rationale", ""))[:300],
                confidence=float(data.get("confidence", 0.5)),
            )
    except Exception:
        resp = None

    if resp is None:
        resp = _heuristic(req)

    _cache_put(req.patient_id, req.week_number, resp)
    return resp
