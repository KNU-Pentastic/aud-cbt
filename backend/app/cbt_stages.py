"""CBT 주간 세션의 5단계 정의 — 코치(대화 LLM)와 stage_tracker 가 공유한다.

코치는 '지금 몇 단계이고 그 단계의 목표가 무엇인지'를 알아야 그 단계를 실제로 진행한다.
stage_tracker 는 같은 정의를 기준으로 '현재 단계가 완료됐는지'를 판단한다. 두 LLM 이
같은 단계 정의를 공유해야 진행이 일관된다(예전엔 코치가 단계를 몰라 제멋대로 마무리하고,
추적기는 그 결과를 사후 관찰만 해 단계가 1→5 로 점프했다).
"""

from __future__ import annotations

CBT_STEPS: dict[int, dict[str, str]] = {
    1: {"name": "체크인 리뷰", "goal": "지난 한 주의 상태(기분·갈망·수면·음주)를 함께 확인한다"},
    2: {"name": "지난주 과제 리뷰", "goal": "지난주에 함께 정한 과제를 해봤는지 점검하고 경험을 나눈다"},
    3: {"name": "핵심 콘텐츠", "goal": "이번 세션의 핵심 주제(이번 Phase/모듈의 내용)를 다룬다"},
    4: {"name": "개인화", "goal": "핵심 내용을 환자의 실제 상황·트리거에 맞게 구체화한다"},
    5: {"name": "이번 주 과제", "goal": "다음 한 주 동안 실천할 구체적인 과제를 함께 정한다"},
}

TOTAL_STEPS = len(CBT_STEPS)


def clamp_step(step: int | None) -> int:
    """1~5 범위로 보정. None/범위 밖이면 가까운 경계로."""
    if step is None:
        return 1
    return max(1, min(TOTAL_STEPS, step))


def step_name(step: int) -> str:
    """단계 이름('핵심 콘텐츠' 등). 화면 단계 라벨이 백엔드 정의와 어긋나지 않도록 단일 출처로 쓴다."""
    return CBT_STEPS[clamp_step(step)]["name"]


def step_line(step: int) -> str:
    """'3/5 핵심 콘텐츠 — ...' 형태의 한 줄 설명."""
    s = clamp_step(step)
    info = CBT_STEPS[s]
    return f"{s}/{TOTAL_STEPS} {info['name']} — {info['goal']}"


def overview() -> str:
    """'1.체크인 리뷰 → 2.지난주 과제 리뷰 → ...' 전체 흐름 한 줄."""
    return " → ".join(f"{k}.{v['name']}" for k, v in CBT_STEPS.items())
