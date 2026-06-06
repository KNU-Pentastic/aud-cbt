"""Regression: 자살 의사 '부정형'이 suicide_risk 로 오탐돼 잠금/재잠금되던 결함.

환자가 "죽고 싶지 않아, 그냥 술 마시고 싶어"라고 자살을 명시적으로 부정하는데도
룰 키워드 "죽고 싶"의 부분문자열 매칭으로 grade A suicide_risk 가 떠 잠겼고, 해제 후
같은 말을 반복하면 재잠금되는 루프가 있었다. 부정형을 룰에서 제외하되, 부정 안 된
진짜 자살 신호는 그대로 잡아야(recall 유지) 한다.

LLM 을 타지 않는 _rule_classify / _suicide_match 만 검증한다.
"""

from app.services.safety_classifier import _rule_classify, _suicide_match


# --- 부정형은 자살로 보지 않는다 (오탐/재잠금 차단) ---

def test_negated_suicide_not_flagged():
    for t in [
        "죽고 싶진 않아 지금은 그냥 술마시고 싶어 사실 이미 한두 잔 마셨어",
        "죽고 싶진 않고 술을 마시고 싶어 내가 어떻게 해야 돼?",
        "죽고 싶지 않아",
        "죽고 싶지도 않아요",
        "사라지고 싶지는 않아",
    ]:
        assert _suicide_match(t) is None, f"부정형이 자살로 잡힘: {t!r}"
        hit = _rule_classify(t)
        # 자살(grade A suicide_risk)로는 분류되면 안 된다.
        assert not (hit and hit[1] == "suicide_risk"), f"부정형이 suicide_risk: {t!r} -> {hit}"


# --- 진짜 자살 신호는 그대로 잡힌다 (recall 유지) ---

def test_genuine_suicide_still_flagged():
    for t in [
        "죽고 싶어",
        "그냥 죽고 싶다는 생각뿐이야",
        "죽고 싶지만 무서워",          # 부정이 아니라 양가감정 — 잡아야 함
        "자살하고 싶어",
        "유서를 써놨어",
        "사라지고 싶어",
    ]:
        assert _suicide_match(t) is not None, f"진짜 자살 신호를 놓침: {t!r}"
        assert _rule_classify(t) == ("A", "suicide_risk", _suicide_match(t)), t


def test_negated_then_genuine_still_flagged():
    """부정과 진짜 신호가 함께 있으면, 부정을 지운 뒤 남는 신호로 자살을 잡는다."""
    t = "죽고 싶지 않지만 그냥 사라지고 싶어"
    assert _suicide_match(t) == "사라지고 싶"
    assert _rule_classify(t) == ("A", "suicide_risk", "사라지고 싶")


def test_negated_suicide_does_not_block_other_rules():
    """부정형 자살이 빠져도 다른 룰(예: 음주) 분류는 정상 동작한다."""
    # 자살은 부정, 음주 관련은 별개로 평가됨(여기선 룰 자살만 None 확인이 핵심)
    t = "죽고 싶지 않아 그냥 오늘 마셨어"
    hit = _rule_classify(t)
    assert hit is None or hit[1] != "suicide_risk"
