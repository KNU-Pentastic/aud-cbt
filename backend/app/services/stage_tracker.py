"""Stage tracker — CBT 5-step progress per session. Sonnet 4.6."""

from __future__ import annotations

import json
import re

from sqlalchemy.orm import Session

from app.config import settings
from app.schemas.internal import LLMInvokeRequest, StageTrackRequest, StageTrackResponse
from app.services import llm_gateway


_SYS = (
    "You are a CBT session stage tracker. A weekly session has 5 steps: "
    "1=check-in review, 2=last-week homework review, 3=core content, "
    "4=personalization, 5=this week's homework assignment. "
    "Read the recent dialogue and assess which step the session has ACTUALLY "
    "reached — the highest step the conversation has substantively covered — and "
    "whether the session is essentially complete (this week's homework has been "
    "assigned and the conversation reached a natural close). Judge from the "
    "dialogue itself; last_known_step is only the previously recorded value and "
    "may lag the conversation. Never report a step lower than the dialogue shows. "
    'Reply ONLY as strict JSON: {"current_step": 1-5, "session_complete": bool, '
    '"completion": 0..1, "drift": "low|medium|high", "delivered": ["..."]}'
)


def track(db: Session, req: StageTrackRequest) -> StageTrackResponse:
    messages = [
        {
            "role": "user",
            "content": (
                f"Week: {req.week_number}, last_known_step: {req.current_step}\n"
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

    # 모델이 '대화가 실제로 도달한 절대 단계'를 평가한다. 마지막 기록 단계보다 낮게는
    # 내려가지 않도록 단조 증가로 보정한다. (예전엔 current_step 에서 ±1 만 움직이고
    # 그 값에 모델을 고정시켜, 대화가 이미 3~5단계를 지나도 2단계에 묶여 진행도가 안
    # 올라가고 세션이 끝나지 않았다 — BUG.)
    try:
        assessed = int(data.get("current_step", req.current_step))
    except (TypeError, ValueError):
        assessed = req.current_step
    assessed = max(1, min(5, assessed))
    current_step = max(req.current_step, assessed)

    # ready_to_advance 의 의미: 이제 '세션을 마칠 준비가 됐는가'(5단계까지 마치고 마무리됨).
    complete = bool(data.get("session_complete", False))
    ready = complete and current_step >= 5

    completion = float(data.get("completion", 0.2))
    drift = data.get("drift", "low")
    if drift not in ("low", "medium", "high"):
        drift = "low"
    delivered = data.get("delivered") or []
    action = (
        "advance_step"
        if ready
        else ("continue_current" if assessed >= req.current_step else "redirect_to_step_topic")
    )

    return StageTrackResponse(
        current_step=current_step,
        ready_to_advance=ready,
        step_completion_estimate=max(0.0, min(1.0, completion)),
        step_drift_risk=drift,  # type: ignore[arg-type]
        delivered_objectives=[str(x) for x in delivered][:10],
        recommended_next_action=action,  # type: ignore[arg-type]
    )
