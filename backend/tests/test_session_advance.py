"""Regression: 세션 진행/종료 모듈(stage_tracker + _advance_session_stage) 결함 (#6).

  (A) mock 모드에서 stage_tracking 이 ready_to_advance=false 로 박혀 있어 단계가
      전진하지 않고 세션이 영영 끝나지 않던 문제.
  (B) 종료 판단이 진행 '후' 단계(resp.current_step)를 봐서, 4→5로 막 들어선 턴에
      곧장 종료돼 5단계(이번 주 과제)가 한 번도 진행되지 않던 off-by-one.

mock LLM(ANTHROPIC_API_KEY 없음 = 기본 dev 모드)에서 검증한다.
"""

from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models.conversation import Conversation, Message
from app.models.llm_usage import LLMUsage
from app.models.patient import Patient
from app.models.session import Session as CbtSession
from app.models.session_summary import SessionSummary
from app.schemas.internal import StageTrackRequest, StageTrackResponse
from app.services import conversation_service, llm_gateway, stage_tracker


@pytest.fixture(autouse=True)
def force_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    """결정론적 mock 게이트웨이를 강제한다(환경에 실 API 키가 있어도 mock 으로 검증)."""
    monkeypatch.setattr(settings, "use_llm_mock", True)
    monkeypatch.setattr(llm_gateway, "_anthropic_client", None)


@pytest.fixture()
def db() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    for model in (Patient, CbtSession, Conversation, Message, SessionSummary, LLMUsage):
        model.__table__.create(engine, checkfirst=True)
    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    with factory() as session:
        yield session


def _patient(db: Session, week: int = 4) -> Patient:
    p = Patient(
        patient_id="p_test",
        provider_id="pr_test",
        name="홍길동",
        phone="010-0000-0000",
        date_of_birth=date(1990, 1, 1),
        sex="M",
        discharge_date=date(2026, 1, 1),
        current_week=week,
        current_phase=3,
    )
    db.add(p)
    db.commit()
    return p


def _session_with_step(
    db: Session, patient: Patient, step: int
) -> tuple[CbtSession, Conversation]:
    sess = CbtSession(
        session_id="s_test",
        patient_id=patient.patient_id,
        week_number=patient.current_week,
        phase=patient.current_phase,
        current_step=step,
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
    db.add(Message(message_id="m1", conversation_id="c_test", role="user", text="이번 주도 잘 지냈어요"))
    db.add(Message(message_id="m2", conversation_id="c_test", role="assistant", text="좋아요, 함께 살펴봐요"))
    db.commit()
    return sess, conv


# ── (A) mock 단계 추적이 실제로 전진하는지 ──────────────────────────────


def test_stage_mock_advances_one_step(db: Session) -> None:
    """mock 단계 추적이 단계를 전진시킨다(예전엔 ready_to_advance=false 로 2단계에 묶임)."""
    resp = stage_tracker.track(
        db,
        StageTrackRequest(
            conversation_id="c_test",
            session_id="s_test",
            week_number=4,
            current_step=2,
            dialogue=[{"role": "user", "text": "안녕하세요"}],
        ),
    )
    assert resp.current_step == 3  # 2 → 3
    # 5단계 미도달 → 세션 완결 아님(ready_to_advance 는 '마칠 준비'를 뜻한다).
    assert resp.ready_to_advance is False


def test_stage_mock_caps_at_five(db: Session) -> None:
    """5단계에 도달하면 더 오르지 않고(상한) 세션 완결 신호를 낸다."""
    resp = stage_tracker.track(
        db,
        StageTrackRequest(
            conversation_id="c_test",
            session_id="s_test",
            week_number=4,
            current_step=5,
            dialogue=[],
        ),
    )
    assert resp.current_step == 5
    assert resp.ready_to_advance is True


# ── (B) off-by-one: 5단계에 막 들어선 턴엔 종료되지 않는다 ────────────────


def test_entering_step5_does_not_end_session(db: Session) -> None:
    """4→5로 막 들어선 턴엔 종료되지 않고 5단계가 진행될 기회를 갖는다."""
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=4)

    progress = conversation_service._advance_session_stage(db, patient, conv)

    assert progress is not None
    assert progress["current_step"] == 5
    assert progress["session_advanced"] is False
    db.refresh(sess)
    db.refresh(conv)
    assert sess.status == "in_progress"
    assert conv.status == "active"
    assert patient.current_week == 4  # 아직 다음 주차로 넘어가지 않음


def test_jump_to_step5_with_complete_does_not_end_immediately(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """한 라운드에 단계가 5로 점프하며 완료 신호가 떠도 그 즉시 종료하지 않는다(조기 종료 방지)."""
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=3)  # 직전 단계 3

    def _fake_track(_db: object, _req: object) -> StageTrackResponse:
        # tracker 가 한 방에 '5단계 + 완료'를 반환하는 상황을 강제(실모델 과대평가 재현).
        return StageTrackResponse(
            current_step=5,
            ready_to_advance=True,
            step_completion_estimate=1.0,
            step_drift_risk="low",
            delivered_objectives=[],
            recommended_next_action="advance_step",
        )

    monkeypatch.setattr(conversation_service.stage_tracker, "track", _fake_track)
    progress = conversation_service._advance_session_stage(db, patient, conv)

    assert progress is not None
    assert progress["current_step"] == 5  # 진행도는 5로 반영(점프 허용)
    assert progress["session_advanced"] is False  # 그러나 즉시 종료되지 않음(직전 단계가 3이라서)
    db.refresh(sess)
    db.refresh(conv)
    assert sess.status == "in_progress"
    assert patient.current_week == 4


def test_step5_ready_ends_and_advances(db: Session) -> None:
    """이미 5단계인 상태에서 ready 면 종료 + 요약 생성 + 다음 주차 진행."""
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=5)

    progress = conversation_service._advance_session_stage(db, patient, conv)

    assert progress is not None
    assert progress["session_advanced"] is True
    assert progress["next_week"] == 5
    db.refresh(sess)
    db.refresh(conv)
    assert sess.status == "completed"
    assert conv.status == "ended"
    assert patient.current_week == 5
    assert patient.current_phase == 3

    # 세션 종료 시 요약이 생성돼 다음 세션이 참고할 수 있다(#5 의 데이터 소스).
    summary = db.execute(
        select(SessionSummary).where(SessionSummary.session_id == "s_test")
    ).scalar_one()
    assert summary.completed_objectives  # mock 이 비어있지 않게 채운다
    assert summary.handoff_notes
