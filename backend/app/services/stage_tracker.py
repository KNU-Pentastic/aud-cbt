"""Stage tracker — CBT 5-step progress per session. Sonnet 4.6."""

from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from app.config import settings
from app.schemas.internal import LLMInvokeRequest, StageTrackRequest, StageTrackResponse
from app.services import llm_gateway


_SYS = (
    "You are a CBT session stage tracker. Given the current 5-step CBT session "
    "state (1=checkin review, 2=last-week homework review, 3=core content, "
    "4=personalization, 5=this week's homework) and recent dialogue, decide "
    "whether the patient is ready to advance and how far the step has drifted. "
    'Reply only as strict JSON: {"ready_to_advance": bool, "completion": 0..1, '
    '"drift": "low|medium|high", "delivered": ["..."], "action": '
    '"advance_step|redirect_to_step_topic|continue_current"}'
)


def track(db: Session, req: StageTrackRequest) -> StageTrackResponse:
    messages = [
        {
            "role": "user",
            "content": (
                f"Week: {req.week_number}, current_step: {req.current_step}\n"
                f"step_objectives: {req.step_objectives}\n"
                f"recent_dialogue: {req.dialogue[-12:]}"
            ),
        }
    ]
    try:
        resp = llm_gateway.invoke(
            db,
            LLMInvokeRequest(
                model=settings.llm_model_tracking,
                messages=messages,
                system=_SYS,
                max_tokens=400,
                temperature=0.2,
                stream=False,
                patient_id="system",
                purpose="stage_tracking",
                caller_component="stage_tracker",
            ),
        )
        m = re.search(r"\{.*\}", resp.content, re.S)
        data = json.loads(m.group(0)) if m else {}
    except Exception:
        data = {}

    ready = bool(data.get("ready_to_advance", False))
    completion = float(data.get("completion", 0.2))
    drift = data.get("drift", "low")
    if drift not in ("low", "medium", "high"):
        drift = "low"
    delivered = data.get("delivered") or []
    action = data.get("action", "continue_current")
    if action not in ("advance_step", "redirect_to_step_topic", "continue_current"):
        action = "continue_current"

    next_step = req.current_step + 1 if ready and req.current_step < 5 else req.current_step

    return StageTrackResponse(
        current_step=next_step,
        ready_to_advance=ready,
        step_completion_estimate=max(0.0, min(1.0, completion)),
        step_drift_risk=drift,  # type: ignore[arg-type]
        delivered_objectives=[str(x) for x in delivered][:10],
        recommended_next_action=action,  # type: ignore[arg-type]
    )
