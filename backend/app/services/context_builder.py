"""Context builder — assembles Week-N system prompt + patient context blocks.

v3.0 keeps prompts minimal so we can iterate during the contest window. Each Week
template lives in this module; later they can move to /prompts/ versioned files.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.daily_checkin import DailyCheckin
from app.models.discharge_profile import DischargeProfile
from app.models.patient import Patient
from app.models.session_summary import SessionSummary
from app.schemas.internal import ContextBuildRequest, ContextBuildResponse


_BASE_PERSONA = (
    "당신은 알코올 사용 장애 환자를 위한 한국어 CBT 코치입니다. "
    "Project MATCH CBT 매뉴얼 12주 구조를 따르며, 환자의 자율성을 존중하고 "
    "비판단적이며 따뜻한 어조로 대화합니다. 의학적 진단·처방·복용량 변경은 "
    "절대 하지 않습니다. 자살·급성중독 신호가 보이면 즉시 119/1393 자원으로 "
    "안내하도록 시스템이 처리하므로, 당신은 일반 대화만 담당합니다."
)


_WEEK_PROMPTS = {
    1: "Week 1 — 도입 & 단주 동기 재확인. 입원 경험을 회고하고 첫 주 적응을 돕습니다.",
    2: "Week 2 — 갈망 인식과 대처 기술 도입.",
    3: "Week 3 — 음주 패턴 분석 (ABC 모델 도입).",
    4: "Week 4 — 사고 관리와 문제 해결.",
    5: "Week 5 — 거절 기술 훈련.",
    6: "Week 6 — 응급 대비 (SID 인식).",
    7: "Week 7 — 동반 정서(우울·불안) 다루기.",
    8: "Week 8 — 관계와 SSO 활용.",
    9: "Week 9 — 일·여가 균형 회복.",
    10: "Week 10 — 재발 방지 계획 수립.",
    11: "Week 11 — 장기 유지 기술 통합.",
    12: "Week 12 — 종결 세션 — 진전 검토와 다음 단계 안내.",
}

_CRAVING_PROMPT = (
    "환자가 지금 갈망을 느껴 대화에 들어왔습니다. "
    "20–30분 안에 갈망 강도를 낮추기 위한 즉각적 대처 기술을 함께 적용하세요. "
    "Urge surfing, distraction, 사회적 지지 활용을 우선 제안합니다."
)

_RESU_PROMPT = (
    "환자가 음주 재발을 보고했습니다. NIAAA CBI 매뉴얼 4.4(RESU) 절차를 따라 "
    "AVE를 차단하고 단주를 재개합니다. 결코 비난하지 않으며 학습 기회로 재구성합니다. "
    "다음 외래에서 의료진과 상의를 권유합니다."
)

_SOMA_PROMPT = (
    "환자가 처방 약물 복용 중단·누락을 보고했습니다. NIAAA CBI 4.5(SOMA) 절차를 "
    "따라 복약 장벽을 탐색하고 의료진 상의를 권유합니다. "
    "복용량·중단 여부에 대한 의학적 결정은 절대 하지 않습니다."
)


def _patient_block(p: Patient, dp: DischargeProfile | None) -> dict[str, Any]:
    return {
        "name": p.name,
        "current_week": p.current_week,
        "discharge_date": p.discharge_date.isoformat(),
        "next_outpatient_date": p.next_outpatient_date.isoformat() if p.next_outpatient_date else None,
        "diagnosis_severity": dp.diagnosis_severity if dp else None,
        "medications": dp.medications if dp else [],
        "comorbidities": dp.comorbidities if dp else [],
        "suicide_ideation_history": dp.suicide_ideation_history if dp else None,
        "normalized_triggers": dp.normalized_triggers if dp else [],
    }


def _recent_checkins_block(db: Session, patient_id: str) -> list[dict[str, Any]]:
    since = (datetime.now(timezone.utc) - timedelta(days=7)).date()
    rows = (
        db.execute(
            select(DailyCheckin)
            .where(DailyCheckin.patient_id == patient_id, DailyCheckin.date >= since)
            .order_by(desc(DailyCheckin.date))
        )
        .scalars()
        .all()
    )
    return [
        {
            "date": c.date.isoformat(),
            "mood": c.mood_nrs,
            "craving": c.craving_nrs,
            "sleep": c.sleep_hours,
        }
        for c in rows
    ]


def _previous_summary_block(db: Session, patient_id: str) -> dict[str, Any] | None:
    row = db.execute(
        select(SessionSummary)
        .where(SessionSummary.patient_id == patient_id)
        .order_by(desc(SessionSummary.week_number))
        .limit(1)
    ).scalar_one_or_none()
    if row is None:
        return None
    return {
        "week_number": row.week_number,
        "completed_objectives": row.completed_objectives,
        "unaddressed_objectives": row.unaddressed_objectives,
        "key_insights": row.key_insights,
        "handoff_notes": row.handoff_notes,
        "assigned_homework": row.assigned_homework,
    }


def build(db: Session, req: ContextBuildRequest) -> ContextBuildResponse:
    patient = db.get(Patient, req.patient_id)
    if patient is None:
        raise ValueError(f"patient {req.patient_id} not found")

    dp = patient.discharge_profile

    if req.context_type == "session":
        week = req.week_number or patient.current_week
        focus = _WEEK_PROMPTS.get(week, _WEEK_PROMPTS[1])
        previous = _previous_summary_block(db, patient.patient_id)
        recent = _recent_checkins_block(db, patient.patient_id)
        patient_block = _patient_block(patient, dp)
        system_prompt = (
            f"{_BASE_PERSONA}\n\n[세션 초점] {focus}\n\n"
            f"[환자] {patient_block}\n\n"
            f"[직전 세션 요약] {previous}\n\n"
            f"[최근 7일 체크인] {recent}\n\n"
            "다섯 단계 흐름(체크인 리뷰 → 과제 리뷰 → 핵심 콘텐츠 → 개인화 → 이번 주 과제)을 "
            "환자 속도에 맞춰 진행하세요."
        )
        blocks = {
            "discharge_profile_summary": patient_block,
            "previous_session_summary": previous,
            "recent_checkins_summary": recent,
            "week_focus": focus,
        }
    elif req.context_type == "craving":
        recent = _recent_checkins_block(db, patient.patient_id)
        system_prompt = (
            f"{_BASE_PERSONA}\n\n[갈망 대화 모드]\n{_CRAVING_PROMPT}\n\n"
            f"[최근 7일 체크인] {recent}"
        )
        blocks = {"recent_checkins_summary": recent}
    elif req.context_type == "resu":
        system_prompt = f"{_BASE_PERSONA}\n\n[재발 대응 분기 RESU]\n{_RESU_PROMPT}"
        blocks = {"patient_id": patient.patient_id}
    elif req.context_type == "soma":
        meds = dp.medications if dp else []
        system_prompt = (
            f"{_BASE_PERSONA}\n\n[복약 지원 분기 SOMA]\n{_SOMA_PROMPT}\n\n"
            f"[처방 약물] {meds}"
        )
        blocks = {"medications": meds}
    else:  # pragma: no cover — pydantic enforces
        raise ValueError(f"unknown context_type {req.context_type}")

    return ContextBuildResponse(
        system_prompt=system_prompt,
        context_blocks=blocks,
        prompt_version="v3.0-dev",
    )
