"""Stage tracker — CBT 5-step progress per session. Sonnet 4.6.

역할: 코치(대화 LLM)는 cbt_stages 의 단계 정의를 받아 '현재 단계'를 진행하고, 이 추적기는
같은 정의를 기준으로 대화를 보고 '지금까지 도달한 단계'를 절대값(reached_step, 1~5)으로
판단한다. 그리고 '세션 전체가 끝났는지(5단계까지 마치고 마무리됐는지)'를 판단한다.

단계는 단조 비감소다 — 기록된 단계(요청의 current_step) 아래로는 절대 내려가지 않도록
floor 로 강제한다(한 번 도달한 단계는 되돌아가지 않는다). 대신 대화가 실제로 여러 단계를
진행했으면 그만큼 한 번에 반영한다(점프 허용). 예전엔 라운드당 +1 로만 올라 진행도가 대화를
못 따라가고 초반 단계에 묶였는데, 이제 대화가 도달한 단계를 그대로 보여 준다. 조기 종료는
별개 문제로, 종료 자체를 사용자가 결정하므로(자동 종료 없음) 단계 점프가 종료를 앞당기지 않는다.
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
    "You are given the step the session is CURRENTLY recorded at (a FLOOR — the session has "
    "already reached at least this step) and the recent dialogue. "
    "Judge, from the dialogue, the FURTHEST step the conversation has actually worked through "
    "so far, and report it as an absolute step number 1..5 in 'reached_step'. "
    "reached_step MUST be >= the recorded current step (the session never moves backward). "
    "Do NOT inflate — only count a step as reached if its goal has been substantively "
    "addressed in the dialogue; if unsure, stay at the recorded step. "
    "Also decide session_complete — true ONLY when step 5 has been reached AND this week's "
    "homework has actually been agreed with the patient AND the conversation has reached a close. "
    "'completion' is how complete the reached step itself is (0..1). "
    'Reply ONLY as strict JSON: {"reached_step": 1-5, "session_complete": bool, '
    '"completion": 0..1, "delivered": ["..."]}'
)


def track(db: Session, req: StageTrackRequest) -> StageTrackResponse:
    cur = cbt_stages.clamp_step(req.current_step)
    # 호출부가 이미 최근 N턴(현재 limit=40)으로 잘라 넘기므로 여기서 추가로 자르지 않는다.
    # 예전엔 [-12:] 로 다시 잘라, 초반 단계(체크인·과제 리뷰)가 완료됐다는 근거가 윈도우
    # 밖으로 밀려나 추적기가 그 도달을 보지 못하고 단계가 묶이던 문제가 있었다.
    messages = [
        {
            "role": "user",
            "content": (
                f"Week: {req.week_number}\n"
                f"steps: {cbt_stages.overview()}\n"
                f"current_step (floor): {cur} ({cbt_stages.step_line(cur)})\n"
                f"recent_dialogue: {req.dialogue}"
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

    # 추적기는 '대화가 지금까지 도달한 절대 단계'를 판단한다. 그 값을 기록된 단계(cur)
    # 아래로는 내려가지 않게 floor 로 강제한다(단조 비감소) — 판단 실패/누락 시엔 reached=cur
    # 로 보아 그대로 유지한다(전진 없음). 모델이 여러 단계를 한 번에 진행했다고 보면 점프를 허용한다.
    try:
        reached = cbt_stages.clamp_step(int(data.get("reached_step", cur)))
    except (TypeError, ValueError):
        reached = cur
    next_step = max(cur, reached)

    # ready_to_advance = '세션을 마칠 준비'(5단계까지 마침). session_complete 는 모델이 5단계에
    # 도달했을 때만 주도록 지시했지만, 안전하게 next_step 도 5 이상인지 함께 확인한다.
    session_complete = bool(data.get("session_complete", False))
    ready = session_complete and next_step >= cbt_stages.TOTAL_STEPS

    # completion·delivered 도 모델이 보낸 원시 JSON 값이라 형식이 어긋날 수 있다. reached_step
    # 과 같은 식으로 방어해, 한 필드가 깨졌다고 track() 이 예외로 빠져 '판단 불가'(stage freeze)로
    # 떨어지지 않게 한다 — 잘못된 값은 기본값으로 대체하고 판단(current_step)은 그대로 살린다.
    try:
        completion = float(data.get("completion", 0.2))
    except (TypeError, ValueError):
        completion = 0.2
    raw_delivered = data.get("delivered")
    delivered = raw_delivered if isinstance(raw_delivered, list) else []
    action = "advance_step" if (ready or next_step > cur) else "continue_current"

    return StageTrackResponse(
        current_step=next_step,
        ready_to_advance=ready,
        step_completion_estimate=max(0.0, min(1.0, completion)),
        delivered_objectives=[str(x) for x in delivered][:10],
        recommended_next_action=action,  # type: ignore[arg-type]
        tracked=tracked,
    )
