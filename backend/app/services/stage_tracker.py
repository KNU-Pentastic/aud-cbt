"""Stage tracker — CBT 5-step progress per session. Sonnet 4.6.

역할: 코치(대화 LLM)는 cbt_stages 의 단계 정의를 받아 '현재 단계'를 진행하고, 이 추적기는
같은 정의를 기준으로 '현재 단계가 완료됐는지(다음 단계로 갈 준비)'와 '세션 전체가 끝났는지
(5단계까지 마침)'만 판단한다. 단계는 한 번에 한 칸씩만 오른다 — 추적기가 대화를 사후에 보고
절대 단계를 추정해 1→5 로 점프하던(그래서 2~4단계를 건너뛰고 조기 종료되던) 문제를 없앤다.
"""

from __future__ import annotations

import json
import logging
import re

from sqlalchemy.orm import Session

from app import cbt_stages
from app.config import settings
from app.schemas.internal import LLMInvokeRequest, StageTrackRequest, StageTrackResponse
from app.services import llm_gateway

log = logging.getLogger(__name__)


_SYS = (
    "You are a CBT session stage tracker. A weekly session runs through 5 steps IN ORDER: "
    "1=check-in review, 2=last-week homework review, 3=core content, "
    "4=personalization, 5=this week's homework assignment. "
    "You are given the CURRENT step (with its goal) and the recent dialogue. "
    "Judge ONLY the current step — do not look ahead. Decide two booleans: "
    "(1) step_complete — has the CURRENT step's goal been sufficiently covered in the "
    "dialogue so it is natural to move on to the next step? "
    "(2) session_complete — true ONLY when the current step is 5 AND this week's homework "
    "has actually been agreed with the patient AND the conversation has reached a close. "
    'Reply ONLY as strict JSON: {"step_complete": bool, "session_complete": bool, '
    '"completion": 0..1, "drift": "low|medium|high", "delivered": ["..."]}'
)


def track(db: Session, req: StageTrackRequest) -> StageTrackResponse:
    cur = cbt_stages.clamp_step(req.current_step)
    messages = [
        {
            "role": "user",
            "content": (
                f"Week: {req.week_number}\n"
                f"current_step: {cur} ({cbt_stages.step_line(cur)})\n"
                f"recent_dialogue: {req.dialogue[-12:]}"
            ),
        }
    ]
    # tracked = 이번 추적이 실제 판단을 얻었는지. LLM 장애·파싱 실패로 판단을 얻지 못하면
    # False 로 표시해(단계 전진 없음), 호출부가 '진짜 미완료'와 '장애로 판단 불가'를 구분하게 한다.
    tracked = True
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
        if m:
            data = json.loads(m.group(0))
        else:
            data = {}
            tracked = False
            log.warning(
                "stage_tracker: 응답에서 JSON 판단을 찾지 못했습니다 — 단계 전진 없이 진행합니다."
            )
    except Exception:
        # Anthropic 장애 등으로 추적 LLM 호출이 실패. 예전엔 조용히 삼켜 '미완료'와
        # 구분되지 않아, 장애 중 current_step 이 얼어붙는데도 원인이 보이지 않았다.
        data = {}
        tracked = False
        log.warning(
            "stage_tracker: 추적 LLM 호출 실패 — '판단 없음'으로 처리합니다(단계 전진 없음). "
            "Anthropic 장애가 지속되면 current_step 이 실제 진행보다 뒤처질 수 있습니다.",
            exc_info=True,
        )

    # 추적기는 '현재 단계 완료 여부'만 판단한다. 완료면 다음 단계로 한 칸 전진(절대 건너뛰지 않음).
    step_complete = bool(data.get("step_complete", False))
    next_step = min(cur + 1, cbt_stages.TOTAL_STEPS) if step_complete else cur

    # ready_to_advance = '세션을 마칠 준비'(5단계까지 마침). session_complete 는 모델이 5단계에서만
    # 주도록 지시했지만, 안전하게 next_step 도 5 이상인지 함께 확인한다.
    session_complete = bool(data.get("session_complete", False))
    ready = session_complete and next_step >= cbt_stages.TOTAL_STEPS

    completion = float(data.get("completion", 0.2))
    drift = data.get("drift", "low")
    if drift not in ("low", "medium", "high"):
        drift = "low"
    delivered = data.get("delivered") or []
    if ready:
        action = "advance_step"
    elif step_complete:
        action = "advance_step"
    elif drift == "high":
        action = "redirect_to_step_topic"
    else:
        action = "continue_current"

    return StageTrackResponse(
        current_step=next_step,
        ready_to_advance=ready,
        step_completion_estimate=max(0.0, min(1.0, completion)),
        step_drift_risk=drift,  # type: ignore[arg-type]
        delivered_objectives=[str(x) for x in delivered][:10],
        recommended_next_action=action,  # type: ignore[arg-type]
        tracked=tracked,
    )
