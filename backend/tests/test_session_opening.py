"""세션 오프닝(코치가 먼저 말 걸기) — conversation_service.stream_session_opening.

세션1을 제외한 주간 세션에서, 환자가 첫 메시지를 보내기 전에 코치가 먼저 말을 건다.
예전엔 클라이언트가 정적 환영 문구를 보여줬는데, 이제 코치가 직전 맥락을 참고해
개인화된 오프닝을 만들어 1단계(체크인 리뷰)를 연다.

mock LLM(ANTHROPIC_API_KEY 없음 = 기본 dev 모드)에서 검증한다.
"""

import json
from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models.conversation import Conversation, Message
from app.models.daily_checkin import DailyCheckin
from app.models.discharge_profile import DischargeProfile
from app.models.llm_usage import LLMUsage
from app.models.patient import Patient
from app.models.session import Session as CbtSession
from app.models.session_summary import SessionSummary
from app.services import conversation_service, llm_gateway


@pytest.fixture(autouse=True)
def force_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    """결정론적 mock 게이트웨이를 강제한다(환경에 실 API 키가 있어도 mock 으로 검증)."""
    monkeypatch.setattr(settings, "use_llm_mock", True)
    monkeypatch.setattr(llm_gateway, "_anthropic_client", None)


@pytest.fixture()
def db() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    # context_builder 가 세션 컨텍스트에서 환자/체크인/직전요약을 읽으므로 함께 만든다.
    for model in (
        Patient,
        DischargeProfile,
        DailyCheckin,
        CbtSession,
        Conversation,
        Message,
        SessionSummary,
        LLMUsage,
    ):
        model.__table__.create(engine, checkfirst=True)
    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    with factory() as session:
        yield session


def _patient(db: Session, week: int = 2) -> Patient:
    p = Patient(
        patient_id="p_test",
        provider_id="pr_test",
        name="홍길동",
        phone="010-0000-0000",
        date_of_birth=date(1990, 1, 1),
        sex="M",
        discharge_date=date(2026, 1, 1),
        current_week=week,
        current_phase=2,
    )
    db.add(p)
    db.commit()
    return p


def _empty_session(db: Session, patient: Patient) -> Conversation:
    """메시지가 아직 없는 활성 세션 대화(오프닝 대상)."""
    sess = CbtSession(
        session_id="s_test",
        patient_id=patient.patient_id,
        week_number=patient.current_week,
        phase=patient.current_phase,
        current_step=1,
        status="in_progress",
    )
    db.add(sess)
    db.flush()
    conv = Conversation(
        conversation_id="c_test",
        patient_id=patient.patient_id,
        context="session",
        session_id=sess.session_id,
        week_number=patient.current_week,
        status="active",
    )
    db.add(conv)
    db.commit()
    return conv


async def _drain(gen) -> list[dict]:
    return [ev async for ev in gen]


def _messages(db: Session, conversation_id: str) -> list[Message]:
    return list(
        db.execute(
            select(Message).where(Message.conversation_id == conversation_id)
        ).scalars()
    )


async def test_opening_streams_and_persists_assistant_message(db: Session) -> None:
    """코치 오프닝이 토큰으로 스트리밍되고, 어시스턴트 턴 하나로 저장된다(사용자 턴 없음)."""
    patient = _patient(db, week=2)
    conv = _empty_session(db, patient)

    events = await _drain(conversation_service.stream_session_opening(db, patient, conv))
    types = [ev["event"] for ev in events]

    assert "start" in types
    assert "token" in types
    assert types[-1] == "done"
    # 마지막 done 은 정상 종료(stop) — 새 오프닝을 실제로 만들었다.
    assert json.loads(events[-1]["data"])["finish_reason"] == "stop"

    msgs = _messages(db, conv.conversation_id)
    assert len(msgs) == 1
    assert msgs[0].role == "assistant"
    assert msgs[0].text.strip()  # 비어 있지 않다


async def test_opening_is_idempotent_when_messages_exist(db: Session) -> None:
    """이미 턴이 있는 대화에서 다시 호출하면 새 오프닝을 만들지 않는다(중복 인사 방지)."""
    patient = _patient(db, week=2)
    conv = _empty_session(db, patient)
    db.add(
        Message(
            message_id="m_existing",
            conversation_id=conv.conversation_id,
            role="assistant",
            text="이미 인사를 건넸어요.",
        )
    )
    db.commit()

    events = await _drain(conversation_service.stream_session_opening(db, patient, conv))

    assert [ev["event"] for ev in events] == ["done"]
    assert json.loads(events[0]["data"])["finish_reason"] == "already_opened"
    # 메시지 수가 그대로다 — 새 어시스턴트 턴이 추가되지 않았다.
    assert len(_messages(db, conv.conversation_id)) == 1


async def test_opening_skips_persist_when_raced_before_commit(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """스트리밍 도중 다른 동시 호출이 오프닝을 저장하면, 커밋 직전 재확인으로 중복을 막는다."""
    patient = _patient(db, week=2)
    conv = _empty_session(db, patient)

    real_check = conversation_service.output_filter.check

    def racing_check(_db: object, req: object):  # type: ignore[no-untyped-def]
        # 출력 가드 직후(커밋 직전) 다른 호출이 먼저 오프닝을 저장한 상황을 흉내낸다.
        db.add(
            Message(
                message_id="m_raced",
                conversation_id=conv.conversation_id,
                role="assistant",
                text="다른 동시 호출이 먼저 인사를 건넸어요.",
            )
        )
        db.commit()
        return real_check(_db, req)  # type: ignore[arg-type]

    monkeypatch.setattr(conversation_service.output_filter, "check", racing_check)

    events = await _drain(conversation_service.stream_session_opening(db, patient, conv))

    assert json.loads(events[-1]["data"])["finish_reason"] == "already_opened"
    msgs = _messages(db, conv.conversation_id)
    # 경쟁 메시지 1개만 남고, 이 호출은 중복 인사를 추가하지 않았다.
    assert len(msgs) == 1
    assert msgs[0].message_id == "m_raced"


async def test_opening_noop_for_non_session(db: Session) -> None:
    """세션 대화가 아니면(갈망 등) 오프닝을 만들지 않는다 — 정적 인사 유지."""
    patient = _patient(db, week=2)
    conv = Conversation(
        conversation_id="c_crav",
        patient_id=patient.patient_id,
        context="craving",
        status="active",
    )
    db.add(conv)
    db.commit()

    events = await _drain(conversation_service.stream_session_opening(db, patient, conv))

    assert [ev["event"] for ev in events] == ["done"]
    assert json.loads(events[0]["data"])["finish_reason"] == "not_session"
    assert _messages(db, conv.conversation_id) == []
