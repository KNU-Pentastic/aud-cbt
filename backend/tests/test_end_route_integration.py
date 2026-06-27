"""통합: 실제 POST /end 라우트 + FastAPI BackgroundTasks 배선 검증.

end_conversation(즉시 종료 커밋) → BackgroundTasks(finalize_completion, 자체 DB 세션)
전체 경로를 실제 앱(TestClient)으로 통과시킨다. Starlette TestClient 는 응답을 보낸 뒤
백그라운드 태스크를 실행하므로, client.post 가 반환될 즈음엔 마무리(요약·주차 진행)까지
반영돼 있다. 라우터가 finalize 를 백그라운드로 예약하는지, finalize 가 자체 세션으로
완료 처리를 마치는지 — 즉 종료가 '정확한 타이밍에' 확정되는지를 확인한다.

mock LLM(USE_LLM_MOCK)로 검증한다. SQLite 는 StaticPool 로 단일 연결을 공유해, 요청
세션(get_db 오버라이드)과 finalize 의 자체 세션(SessionLocal 몽키패치)이 같은 DB 를 본다.
"""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.main as app_main
from app import database as app_database
from app.config import settings
from app.deps import current_patient
from app.models.conversation import Conversation, Message
from app.models.llm_usage import LLMUsage
from app.models.patient import Patient
from app.models.session import Session as CbtSession
from app.models.session_summary import SessionSummary
from app.services import conversation_service, llm_gateway


@pytest.fixture(autouse=True)
def _force_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "use_llm_mock", True)
    monkeypatch.setattr(llm_gateway, "_anthropic_client", None)


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    for model in (Patient, CbtSession, Conversation, Message, SessionSummary, LLMUsage):
        model.__table__.create(engine, checkfirst=True)
    test_session = sessionmaker(bind=engine, expire_on_commit=False, future=True)

    # finalize_completion 이 자체적으로 여는 세션도 같은 DB 로(프로덕션 app.database.SessionLocal 대체).
    monkeypatch.setattr(conversation_service, "SessionLocal", test_session)

    def _override_get_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    def _override_patient() -> Patient:
        with test_session() as s:
            return s.get(Patient, "p_test")

    app_main.app.dependency_overrides[app_database.get_db] = _override_get_db
    app_main.app.dependency_overrides[current_patient] = _override_patient
    try:
        with TestClient(app_main.app) as c:
            c.test_session = test_session  # type: ignore[attr-defined]
            yield c
    finally:
        app_main.app.dependency_overrides.clear()


def _seed(test_session: sessionmaker, *, step: int) -> None:
    with test_session() as s:
        s.add(
            Patient(
                patient_id="p_test",
                provider_id="pr_test",
                name="홍길동",
                phone="010-0000-0000",
                date_of_birth=date(1990, 1, 1),
                sex="M",
                discharge_date=date(2026, 1, 1),
                current_week=4,
                current_phase=3,
            )
        )
        s.flush()
        s.add(
            CbtSession(
                session_id="s_test",
                patient_id="p_test",
                week_number=4,
                phase=3,
                current_step=step,
                status="in_progress",
            )
        )
        s.flush()
        s.add(
            Conversation(
                conversation_id="c_test",
                patient_id="p_test",
                context="session",
                session_id="s_test",
                week_number=4,
                status="active",
            )
        )
        s.add(Message(message_id="m1", conversation_id="c_test", role="user", text="이번 주 잘 지냈어요"))
        s.add(Message(message_id="m2", conversation_id="c_test", role="assistant", text="좋아요 함께 봐요"))
        s.commit()


def test_end_route_terminates_immediately_and_completes_at_step5(client: TestClient) -> None:
    """5단계 도달 세션을 /end 로 마치면: 200 즉시 응답 + 종료 확정 + (백그라운드) 완료·주차 진행."""
    test_session = client.test_session  # type: ignore[attr-defined]
    _seed(test_session, step=5)

    r = client.post("/v1/me/conversations/c_test/end", json={"reason": "completed"})
    assert r.status_code == 200
    body = r.json()
    assert body["reason"] == "completed"
    assert body["ended_at"]

    with test_session() as s:
        assert s.get(Conversation, "c_test").status == "ended"  # 즉시 종료 확정
        assert s.get(CbtSession, "s_test").status == "completed"  # 백그라운드 마무리에서 완료 승격
        assert s.get(Patient, "p_test").current_week == 5  # 다음 주차 진행
        summary = s.execute(
            select(SessionSummary).where(SessionSummary.session_id == "s_test")
        ).scalar_one()
        assert summary.completed_objectives  # 요약 생성됨

    # 이미 종료된 대화를 다시 마치려 하면 409(클라이언트가 '이미 종료'로 동기화하는 신호).
    r2 = client.post("/v1/me/conversations/c_test/end", json={"reason": "completed"})
    assert r2.status_code == 409
    assert r2.json()["error"]["code"] == "CONVERSATION_ENDED"


def test_end_route_recovers_frozen_step_via_background(client: TestClient) -> None:
    """단계가 얼어붙은(3) 채로 /end 하면, 백그라운드 복구가 5단계로 끌어올려 완료 처리한다.

    (mock 추적기는 매 호출 현재 단계를 완료로 보고 +1, 5단계에서 완결 신호 → 3→4→5 복구)."""
    test_session = client.test_session  # type: ignore[attr-defined]
    _seed(test_session, step=3)

    r = client.post("/v1/me/conversations/c_test/end", json={"reason": "completed"})
    assert r.status_code == 200

    with test_session() as s:
        assert s.get(CbtSession, "s_test").current_step == 5  # 복구로 끌어올림
        assert s.get(CbtSession, "s_test").status == "completed"
        assert s.get(Patient, "p_test").current_week == 5
