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


def test_step_rises_at_most_one_per_round(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """모델이 한 번에 5단계로 점프 평가해도 단계 상승은 라운드당 +1 로 제한된다(1→5 점프 방지)."""
    from app.schemas.internal import LLMInvokeResponse, LLMUsageBlock

    def _fake_invoke(_db: object, _req: object) -> LLMInvokeResponse:
        # 모델이 현재 단계 완료 + 세션 완료를 동시에 줘도, 단계는 한 칸만 오른다.
        return LLMInvokeResponse(
            content='{"step_complete": true, "session_complete": true, "completion": 1.0, "drift": "low"}',
            usage=LLMUsageBlock(input_tokens=1, output_tokens=1),
            stop_reason="end_turn",
            invocation_id="inv_test",
        )

    monkeypatch.setattr(stage_tracker.llm_gateway, "invoke", _fake_invoke)
    resp = stage_tracker.track(
        db,
        StageTrackRequest(
            conversation_id="c", session_id="s", week_number=1,
            current_step=2, dialogue=[],
        ),
    )
    assert resp.current_step == 3  # 2 → 3 (한 칸만, 5 로 점프하지 않음)
    assert resp.ready_to_advance is False  # 5단계가 아니므로 완료 신호가 있어도 종료 아님


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
    assert resp.tracked is True  # 정상 판단 → tracked


def test_stage_track_marks_untracked_on_llm_failure(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """추적 LLM 호출이 실패하면(Anthropic 장애) 단계를 전진시키지 않고 tracked=False 로
    표시한다 — 호출부가 '진짜 미완료'와 '장애로 판단 불가'를 구분할 수 있어야 한다."""

    def _boom(_db: object, _req: object) -> object:
        raise RuntimeError("anthropic down")

    monkeypatch.setattr(stage_tracker.llm_gateway, "invoke", _boom)
    resp = stage_tracker.track(
        db,
        StageTrackRequest(
            conversation_id="c_test",
            session_id="s_test",
            week_number=4,
            current_step=3,
            dialogue=[],
        ),
    )
    assert resp.tracked is False
    assert resp.current_step == 3  # 전진 없음
    assert resp.ready_to_advance is False


# ── (B) off-by-one: 5단계에 막 들어선 턴엔 종료되지 않는다 ────────────────


def test_entering_step5_does_not_end_session(db: Session) -> None:
    """4→5로 막 들어선 턴엔 종료되지 않고 5단계가 진행될 기회를 갖는다."""
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=4)

    progress = conversation_service._advance_session_stage(db, patient, conv)

    assert progress is not None
    assert progress["current_step"] == 5
    assert progress["ready_to_complete"] is False  # 직전 단계가 4라 아직 마칠 준비 아님
    db.refresh(sess)
    db.refresh(conv)
    assert sess.status == "in_progress"
    assert conv.status == "active"
    assert patient.current_week == 4  # 아직 다음 주차로 넘어가지 않음


def test_jump_to_step5_with_complete_does_not_signal_ready(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """한 라운드에 단계가 5로 점프하며 완료 신호가 떠도 곧장 '마칠 준비'로 보지 않는다(조기 신호 방지)."""
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
    assert progress["ready_to_complete"] is False  # 직전 단계가 3이라 '마칠 준비' 신호는 아직 아님
    db.refresh(sess)
    db.refresh(conv)
    assert sess.status == "in_progress"  # 자동 종료하지 않는다
    assert conv.status == "active"
    assert patient.current_week == 4


def test_step5_ready_signals_complete_but_does_not_end(db: Session) -> None:
    """이미 5단계 + ready 면 'ready_to_complete' 신호만 내고 자동 종료하지 않는다.

    종료·요약·주차 진행은 사용자가 종료 버튼으로 /end 를 호출할 때 일어난다(아래 테스트).
    """
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=5)

    progress = conversation_service._advance_session_stage(db, patient, conv)

    assert progress is not None
    assert progress["ready_to_complete"] is True
    db.refresh(sess)
    db.refresh(conv)
    assert sess.status == "in_progress"  # 여전히 진행 중(자동 종료 안 함)
    assert conv.status == "active"
    assert patient.current_week == 4  # 주차도 그대로


def test_manual_end_at_step5_completes_and_advances(db: Session) -> None:
    """사용자가 5단계 도달 후 reason=completed 로 수동 종료하면: 완료 처리 + 요약 + 다음 주차."""
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=5)

    _, _, completed = conversation_service.end_conversation(db, conv, "completed")
    conversation_service.generate_session_summary("c_test", db=db)

    db.refresh(sess)
    db.refresh(conv)
    db.refresh(patient)
    assert completed is True
    assert conv.status == "ended"
    assert sess.status == "completed"
    assert patient.current_week == 5
    assert patient.current_phase == 3

    # 세션 종료 시 요약이 생성돼 다음 세션이 참고할 수 있다(#5 의 데이터 소스).
    summary = db.execute(
        select(SessionSummary).where(SessionSummary.session_id == "s_test")
    ).scalar_one()
    assert summary.completed_objectives  # mock 이 비어있지 않게 채운다
    assert summary.handoff_notes


def test_manual_end_non_completed_reason_does_not_advance(db: Session) -> None:
    """완료가 아닌 종료(abandoned_by_user/timeout)는 대화만 닫고 주차는 그대로 둔다.
    (클라이언트는 '세션 마치기'에서 항상 reason='completed' 를 보내지만, 다른 사유로
    닫히는 경로는 주차를 진행하지 않아야 한다.)"""
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=3)

    _, _, completed = conversation_service.end_conversation(db, conv, "abandoned_by_user")

    db.refresh(sess)
    db.refresh(conv)
    db.refresh(patient)
    assert completed is False
    assert conv.status == "ended"
    assert sess.status == "ended"  # 완료 아님
    assert patient.current_week == 4  # 다음 주차로 넘어가지 않음

    # 요약도 생성되지 않는다(완료가 아니므로).
    summary = db.execute(
        select(SessionSummary).where(SessionSummary.session_id == "s_test")
    ).scalar_one_or_none()
    assert summary is None


def test_manual_end_completes_and_advances_regardless_of_step(db: Session) -> None:
    """핵심: 사용자가 '세션 마치기'(reason=completed)로 끝내면 단계 추적기가 5에 못 닿아도
    (실모델에선 흔함 — 코치는 마무리했는데 추적기는 3에 머묾) 완료로 보고 다음 주차로
    진행한다. 단계는 인위적으로 끌어올리지 않는다(추적기 값 그대로)."""
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=3)  # 5단계 미도달

    _, _, completed = conversation_service.end_conversation(db, conv, "completed")
    conversation_service.generate_session_summary("c_test", db=db)

    db.refresh(sess)
    db.refresh(conv)
    db.refresh(patient)
    assert completed is True
    assert conv.status == "ended"
    assert sess.status == "completed"  # 사용자가 끝냈으므로 완료
    assert sess.current_step == 3  # 단계는 그대로(인위적 복구 없음)
    assert patient.current_week == 5  # 그래도 다음 주차로 진행

    summary = db.execute(
        select(SessionSummary).where(SessionSummary.session_id == "s_test")
    ).scalar_one()
    assert summary.completed_objectives


# ── 종료(완료·주차 진행)는 동기 확정, 느린 요약만 백그라운드 — 재진입 결정론 + 종료 durability ──


def test_end_advances_week_synchronously_summary_deferred(db: Session) -> None:
    """end_conversation 은 완료 결정·다음 주차 진행을 '동기로' 끝내 반환한다 — 종료 직후
    재진입이 결정론적으로 올바른(진행된) 주차 세션에 들어가게 한다. 단, 항상 느린 요약만
    응답 뒤 백그라운드로 미루므로 이 시점엔 주차는 진행됐어도 요약 row 는 아직 없다."""
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=5)

    _, _, completed = conversation_service.end_conversation(db, conv, "completed")

    db.refresh(sess)
    db.refresh(conv)
    db.refresh(patient)
    assert completed is True
    assert conv.status == "ended"
    assert sess.status == "completed"  # 동기 완료 승격
    assert conv.ended_at is not None
    assert patient.current_week == 5  # 동기 주차 진행(재진입이 새 주차를 본다)
    summary = db.execute(
        select(SessionSummary).where(SessionSummary.session_id == "s_test")
    ).scalar_one_or_none()
    assert summary is None  # 요약만 백그라운드로 미뤄짐


def test_end_termination_survives_phase2_failure(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """PHASE 2(완료/주차 진행)가 실패해도 PHASE 1 의 종료 커밋은 유지된다 — 세션이
    active 로 되살아나지 않는다(배포 프록시 컷·프로세스 종료 안전성 보존)."""
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=5)

    def _boom(_db: object, _conv: object, _sess: object) -> None:
        raise RuntimeError("advance down")

    monkeypatch.setattr(conversation_service, "_advance_week", _boom)

    _, _, completed = conversation_service.end_conversation(db, conv, "completed")

    db.refresh(sess)
    db.refresh(conv)
    db.refresh(patient)
    assert completed is False
    assert conv.status == "ended"  # PHASE 1 종료는 durable
    assert sess.status == "ended"  # completed 승격은 PHASE 2 rollback 으로 취소
    assert patient.current_week == 4  # 주차 미진행


def test_summary_failure_keeps_session_completed(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """요약(백그라운드)이 실패해도 세션의 완료·주차 진행은 유지된다 — 요약은 보조 자료라
    별도 경로(generate_session_summary)에서 만들어지고, 실패는 자체 롤백으로 격리된다."""
    patient = _patient(db, week=4)
    sess, conv = _session_with_step(db, patient, step=5)

    # 종료에서 완료·주차 진행은 동기로 확정된다.
    _, _, completed = conversation_service.end_conversation(db, conv, "completed")
    assert completed is True

    # 이후 요약만 실패시킨다.
    def _boom(_db: object, _patient: object, _conv: object, _sess: object) -> None:
        raise RuntimeError("summary down")

    monkeypatch.setattr(conversation_service, "_summarize_session", _boom)
    conversation_service.generate_session_summary("c_test", db=db)  # 내부에서 실패→롤백

    db.refresh(sess)
    db.refresh(conv)
    db.refresh(patient)
    assert conv.status == "ended"
    assert sess.status == "completed"  # 완료 유지
    assert patient.current_week == 5  # 주차 진행 유지
    summary = db.execute(
        select(SessionSummary).where(SessionSummary.session_id == "s_test")
    ).scalar_one_or_none()
    assert summary is None  # 요약 row 없음(실패)


def test_generate_session_summary_opens_own_session(monkeypatch: pytest.MonkeyPatch) -> None:
    """프로덕션 경로: generate_session_summary 가 db 주입 없이 자체 SessionLocal 로 열어
    완료된 세션의 요약을 만든다 — FastAPI BackgroundTasks 가 부르는 그대로. 두 번 불러도
    멱등(session_id UNIQUE — 중복 row/예외 없음).

    StaticPool 로 같은 인메모리 DB 를 공유하는 엔진을 만들고, conversation_service.SessionLocal
    을 그 엔진으로 바꿔(=app.database.SessionLocal 대체) 자체-세션 분기(owns_db=True)를 탄다."""
    from sqlalchemy.pool import StaticPool

    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    for model in (Patient, CbtSession, Conversation, Message, SessionSummary, LLMUsage):
        model.__table__.create(engine, checkfirst=True)
    test_session = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    monkeypatch.setattr(conversation_service, "SessionLocal", test_session)

    with test_session() as seed:
        patient = _patient(seed, week=5)  # 이미 진행된 주차(요약은 conv.week_number 기록)
        sess, _ = _session_with_step(seed, patient, step=5)
        sess.status = "completed"  # generate_session_summary 는 완료된 세션만 요약한다
        seed.commit()

    # db 인자 없음 → owns_db=True → 자체 세션을 연다(BackgroundTasks 경로와 동일).
    conversation_service.generate_session_summary("c_test")
    conversation_service.generate_session_summary("c_test")  # 두 번째 — 멱등

    with test_session() as check:
        rows = check.execute(
            select(SessionSummary).where(SessionSummary.session_id == "s_test")
        ).scalars().all()
        assert len(rows) == 1  # 중복 생성 없음
        assert rows[0].completed_objectives


def test_coach_prompt_includes_current_step(db: Session) -> None:
    """세션 코치 프롬프트에 현재 단계와 그 목표가 주입된다(코치가 단계를 인지하고 진행하도록)."""
    from app.models.daily_checkin import DailyCheckin
    from app.models.discharge_profile import DischargeProfile
    from app.schemas.internal import ContextBuildRequest
    from app.services import context_builder

    engine = db.get_bind()
    for model in (DischargeProfile, DailyCheckin):
        model.__table__.create(engine, checkfirst=True)

    patient = _patient(db, week=1)  # week1 = phase1 → module_classifier(LLM) 미사용
    ctx = context_builder.build(
        db,
        ContextBuildRequest(
            patient_id=patient.patient_id,
            context_type="session",
            week_number=1,
            current_step=3,
        ),
    )
    assert ctx.context_blocks.get("current_step") == 3
    assert "3/5" in ctx.system_prompt  # 현재 단계 표기
    assert "핵심 콘텐츠" in ctx.system_prompt  # 3단계 이름이 코치 프롬프트에 들어감
