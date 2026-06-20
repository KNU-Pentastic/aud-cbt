"""Regression: 안전 잠금 해제 후 같은 대화를 이어갈 때 생기던 3가지 결함.

  (a) 옛 위기 발화가 분류기 '누적 맥락'에 남아 무해한 새 발화를 grade A 로 재잠금.
  (b) 코치 답변이 옛 위기('죽고 싶다')에 계속 고착.
  (c) 위 둘을 막으려 시간 floor 로 잠금 이전 발화를 통째 잘랐더니, 정상 대화까지
      사라져 진료 후 맥락이 끊김.

해결: 위기(grade A) 발화 한 줄만 Message.safety_excluded 로 표시하고, LLM 맥락
(분류기·코치·단계추적)에서 _recent_turns(exclude_safety=True) 로 그 발화만 도려낸다.
위기 외 정상 대화는 원문 그대로 남아 연속성이 유지되고, 화면 표시와 세션 종료
요약(임상 기록)에는 위기 발화도 그대로 남는다.

LLM 게이트웨이는 건드리지 않고 _recent_turns 의 제외 로직만 검증한다.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.models.conversation import Conversation, Message
from app.services.conversation_service import _recent_turns


@pytest.fixture()
def db() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    Message.__table__.create(engine)
    Conversation.__table__.create(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    with factory() as session:
        yield session


def _add(
    db: Session,
    mid: str,
    role: str,
    text: str,
    created_at: datetime,
    safety_excluded: bool = False,
) -> None:
    db.add(
        Message(
            message_id=mid,
            conversation_id="c_test",
            role=role,
            text=text,
            created_at=created_at,
            safety_excluded=safety_excluded,
        )
    )


def _seed(db: Session) -> datetime:
    """정상 → 정상 → 위기(표시됨) → (잠금/진료/해제) → 재개 정상 발화."""
    t0 = datetime(2026, 6, 6, 10, 0, 0, tzinfo=timezone.utc)
    _add(db, "m1", "user", "주말 모임 음주 갈망이 힘들어요", t0)
    _add(db, "m2", "assistant", "함께 살펴봐요", t0 + timedelta(seconds=1))
    _add(db, "m3", "user", "사실 다 의미 없고 죽고 싶어요", t0 + timedelta(minutes=10),
         safety_excluded=True)
    _add(db, "m4", "user", "다시 왔어요, 이어서 할게요", t0 + timedelta(hours=3))
    db.commit()
    return t0


def test_exclude_safety_drops_crisis_keeps_normal(db: Session) -> None:
    """위기 발화만 빠지고, 위기 '이전·이후' 정상 대화는 모두 원문 그대로 남는다.

    분류기·코치·단계추적이 쓰는 호출 형태. (c) '정상 대화가 사라진다' 회귀 방지의 핵심.
    """
    _seed(db)
    turns = _recent_turns(db, "c_test", limit=20, exclude_safety=True)
    texts = [t.text for t in turns]

    # 위기 발화는 제외
    assert all("죽고 싶" not in t and "의미 없" not in t for t in texts)
    # 위기 이전 정상 대화 보존(= 날아가지 않음)
    assert "주말 모임 음주 갈망이 힘들어요" in texts
    assert "함께 살펴봐요" in texts
    # 위기 이후 재개 발화도 보존
    assert "다시 왔어요, 이어서 할게요" in texts
    # 정확히 위기 한 줄만 빠진 3개
    assert texts == [
        "주말 모임 음주 갈망이 힘들어요",
        "함께 살펴봐요",
        "다시 왔어요, 이어서 할게요",
    ]


def test_default_keeps_crisis_for_clinical_record(db: Session) -> None:
    """기본값(exclude_safety=False)은 위기 발화까지 전부 — 세션 종료 요약/임상 기록용."""
    _seed(db)
    turns = _recent_turns(db, "c_test", limit=200)
    texts = [t.text for t in turns]
    assert len(texts) == 4
    assert any("죽고 싶" in t for t in texts)


def test_multiple_crisis_turns_all_excluded(db: Session) -> None:
    """여러 잠금/해제 사이클의 위기 발화가 누적돼도 전부 제외되고 정상 대화는 유지."""
    t0 = datetime(2026, 6, 6, 10, 0, 0, tzinfo=timezone.utc)
    _add(db, "a1", "user", "오늘 좀 우울했어요", t0)
    _add(db, "a2", "user", "죽고 싶어요", t0 + timedelta(minutes=1), safety_excluded=True)
    _add(db, "a3", "user", "진료 받고 왔어요", t0 + timedelta(hours=2))
    _add(db, "a4", "user", "또 사라지고 싶어요", t0 + timedelta(hours=3), safety_excluded=True)
    _add(db, "a5", "user", "다시 이어가볼게요", t0 + timedelta(hours=5))
    db.commit()

    texts = [t.text for t in _recent_turns(db, "c_test", limit=20, exclude_safety=True)]
    assert texts == ["오늘 좀 우울했어요", "진료 받고 왔어요", "다시 이어가볼게요"]
