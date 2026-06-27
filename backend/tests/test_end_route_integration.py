"""통합: 실제 POST /end 라우트 + FastAPI BackgroundTasks 배선 검증.

end_conversation(종료 + 완료·주차 진행을 동기로 확정) → BackgroundTasks(generate_session_summary,
자체 DB 세션) 전체 경로를 실제 앱(TestClient)으로 통과시킨다. Starlette TestClient 는 응답을
보낸 뒤 백그라운드 태스크를 실행하므로, client.post 가 반환될 즈음엔 요약까지 생성돼 있다.
라우터가 완료 시에만 요약을 백그라운드로 예약하는지, 완료·주차 진행이 응답 전에 동기로
확정돼 재진입이 결정론적인지 — 즉 종료가 '정확한 타이밍에' 확정되는지를 확인한다.

mock LLM(USE_LLM_MOCK)로 검증한다. SQLite 는 StaticPool 로 단일 연결을 공유해, 요청
세션(get_db 오버라이드)과 요약의 자체 세션(SessionLocal 몽키패치)이 같은 DB 를 본다.
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

    # generate_session_summary 가 자체적으로 여는 세션도 같은 DB 로(프로덕션 app.database.SessionLocal 대체).
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


def test_end_route_completes_synchronously_and_advances_week(client: TestClient) -> None:
    """5단계 도달 세션을 /end 로 마치면: 200 즉시 응답 + 종료·완료·주차 진행을 '동기'로 확정.
    완료 직후 current-session 이 새 주차를 보고 active 가 없어, 재진입이 결정론적으로
    올바른 주차 세션에 들어간다(레이스 해소). 요약만 응답 뒤 백그라운드로 생성된다."""
    test_session = client.test_session  # type: ignore[attr-defined]
    _seed(test_session, step=5)

    r = client.post("/v1/me/conversations/c_test/end", json={"reason": "completed"})
    assert r.status_code == 200
    body = r.json()
    assert body["reason"] == "completed"
    assert body["ended_at"]
    assert body["completed"] is True  # 완료가 응답에 동기로 실려 온다

    with test_session() as s:
        assert s.get(Conversation, "c_test").status == "ended"  # 즉시 종료 확정
        assert s.get(CbtSession, "s_test").status == "completed"  # 동기 완료 승격
        assert s.get(Patient, "p_test").current_week == 5  # 동기 주차 진행
        summary = s.execute(
            select(SessionSummary).where(SessionSummary.session_id == "s_test")
        ).scalar_one()
        assert summary.completed_objectives  # 요약은 응답 후 백그라운드로 생성됨

    # 재진입 레이스 해소 증명: 완료 직후 current-session 이 새 주차(5)를 보고 active 가 없다
    # → 후속 POST /sessions 는 '새 주차'로 세션을 만든다(이전 주차 유령 세션이 안 생긴다).
    cs = client.get("/v1/me/conversations/current-session")
    assert cs.status_code == 200
    assert cs.json()["current_week"] == 5
    assert cs.json()["active_conversation_id"] is None
    new = client.post("/v1/me/conversations/sessions")
    assert new.status_code == 201
    assert new.json()["week_number"] == 5  # 새 세션은 진행된 주차로 생성

    # 이미 종료된 (예전) 대화를 다시 마치려 하면 409(클라이언트가 '이미 종료'로 동기화하는 신호).
    r2 = client.post("/v1/me/conversations/c_test/end", json={"reason": "completed"})
    assert r2.status_code == 409
    assert r2.json()["error"]["code"] == "CONVERSATION_ENDED"


def test_end_route_completes_and_advances_regardless_of_step(client: TestClient) -> None:
    """핵심: 단계가 5에 못 닿은(3) 세션도 /end(완료)면 완료·다음 주차로 진행한다 — 사용자가
    끝냈으므로. 단계는 추적기 값(3) 그대로 두고, 주차만 진행한다(인위적 복구 없음)."""
    test_session = client.test_session  # type: ignore[attr-defined]
    _seed(test_session, step=3)

    r = client.post("/v1/me/conversations/c_test/end", json={"reason": "completed"})
    assert r.status_code == 200
    assert r.json()["completed"] is True

    with test_session() as s:
        assert s.get(CbtSession, "s_test").current_step == 3  # 단계는 그대로
        assert s.get(CbtSession, "s_test").status == "completed"
        assert s.get(Patient, "p_test").current_week == 5  # 그래도 다음 주차로 진행
