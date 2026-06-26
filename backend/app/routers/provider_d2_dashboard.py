"""D2 단일 통합 엔드포인트 — 환자 상세 대시보드.

func spec §5.2.2 / API §13.2 — v3.0에서 D2의 5개 별도 엔드포인트가 Post-MVP로
이동되었으므로, 모든 정보를 이 응답 하나에 통합한다.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request
from sqlalchemy import desc, func, select

from app.deps import CurrentProvider, DbSession, RequestId
from app.exceptions import forbidden, not_found
from app.services import audit
from app.models.conversation import Conversation
from app.models.daily_checkin import DailyCheckin
from app.models.medication import MedicationLog
from app.models.patient import Patient
from app.models.safety_event import SafetyEvent
from app.models.session import Session as CbtSession
from app.models.session_summary import SessionSummary
from app.schemas.checkin import CheckinOut
from app.schemas.provider import (
    LLMLockStatus,
    PatientDetailDashboard,
    ProgressBlock,
    RecentSafetyEvents,
    RecentSession,
    SessionSummaryBlock,
)
from app.schemas.safety import SafetyEventOut

router = APIRouter(prefix="/provider/patients", tags=["Provider - D2"])


def _sobriety_days(patient: Patient) -> int:
    today = datetime.now(timezone.utc).date()
    return max(0, (today - patient.discharge_date).days)


def _medication_adherence_30d(db: DbSession, patient_id: str) -> float:
    since = datetime.now(timezone.utc).date() - timedelta(days=30)
    rows = (
        db.execute(
            select(MedicationLog.taken).where(
                MedicationLog.patient_id == patient_id, MedicationLog.date >= since
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return 0.0
    return round(sum(1 for t in rows if t) / len(rows), 3)


@router.get("/{patient_id}", response_model=PatientDetailDashboard)
def get_dashboard(
    patient_id: str,
    provider: CurrentProvider,
    db: DbSession,
    request: Request,
    request_id: RequestId,
) -> PatientDetailDashboard:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise not_found("Patient not found")
    if patient.provider_id != provider.provider_id:
        raise forbidden("Not assigned to this patient")

    # 접속기록(안전성 확보조치 기준 §8): 의료진의 환자 개인정보 열람을 남긴다.
    audit.record_patient_access(
        db,
        actor_role="provider",
        actor_id=provider.provider_id,
        action="patient.detail.read",
        patient_id=patient_id,
        request_id=request_id,
        client_ip=request.client.host if request.client else None,
    )

    dp = patient.discharge_profile
    sso = patient.sso
    discharge_block = {
        "name": patient.name,
        "diagnosis_severity": dp.diagnosis_severity if dp else None,
        "admission_days": dp.admission_days if dp else None,
        "medications": dp.medications if dp else [],
        "comorbidities": dp.comorbidities if dp else [],
        "suicide_ideation_history": dp.suicide_ideation_history if dp else None,
        "normalized_triggers": dp.normalized_triggers if dp else [],
        "next_outpatient_date": (
            patient.next_outpatient_date.isoformat() if patient.next_outpatient_date else None
        ),
        "sso": (
            {
                "name": sso.name,
                "relationship": sso.relationship_type,
                "phone": sso.phone,
            }
            if sso
            else None
        ),
    }

    since30 = datetime.now(timezone.utc).date() - timedelta(days=30)
    checkins = (
        db.execute(
            select(DailyCheckin)
            .where(DailyCheckin.patient_id == patient_id, DailyCheckin.date >= since30)
            .order_by(desc(DailyCheckin.date))
        )
        .scalars()
        .all()
    )

    active_conv = (
        db.execute(
            select(Conversation)
            .where(Conversation.patient_id == patient_id, Conversation.status == "active")
            .order_by(desc(Conversation.started_at))
            .limit(1)
        )
        .scalars()
        .first()
    )
    active_session_block = (
        {
            "conversation_id": active_conv.conversation_id,
            "context": active_conv.context,
            "session_id": active_conv.session_id,
            "week_number": active_conv.week_number,
            "started_at": active_conv.started_at.isoformat(),
        }
        if active_conv
        else None
    )

    recent_sessions = (
        db.execute(
            select(CbtSession)
            .where(CbtSession.patient_id == patient_id)
            .order_by(desc(CbtSession.started_at))
            .limit(5)
        )
        .scalars()
        .all()
    )

    def summary_for(session_id: str) -> SessionSummaryBlock | None:
        row = db.execute(
            select(SessionSummary).where(SessionSummary.session_id == session_id)
        ).scalar_one_or_none()
        if row is None:
            return None
        return SessionSummaryBlock(
            session_completed_objectives=list(row.completed_objectives or []),
            session_unaddressed_objectives=list(row.unaddressed_objectives or []),
            patient_key_insights=list(row.key_insights or []),
            identified_triggers=list(row.identified_triggers or []),
            assigned_homework=row.assigned_homework,
            emotional_tone=row.emotional_tone,
            next_session_handoff_notes=row.handoff_notes,
            safety_flags=list(row.safety_flags or []),
            generated_at=row.generated_at,
            model_used=row.model_used,
            generation_time_ms=row.generation_time_ms,
        )

    sessions_block = [
        RecentSession(
            session_id=s.session_id,
            week_number=s.week_number,
            ended_at=s.ended_at,
            summary=summary_for(s.session_id),
        )
        for s in recent_sessions
    ]

    grade_a = (
        db.execute(
            select(SafetyEvent)
            .where(SafetyEvent.patient_id == patient_id, SafetyEvent.grade == "A")
            .order_by(desc(SafetyEvent.detected_at))
            .limit(20)
        )
        .scalars()
        .all()
    )
    grade_b = (
        db.execute(
            select(SafetyEvent)
            .where(SafetyEvent.patient_id == patient_id, SafetyEvent.grade == "B")
            .order_by(desc(SafetyEvent.detected_at))
            .limit(20)
        )
        .scalars()
        .all()
    )

    return PatientDetailDashboard(
        patient_id=patient.patient_id,
        discharge_profile=discharge_block,
        progress=ProgressBlock(
            current_week=patient.current_week,
            sobriety_days=_sobriety_days(patient),
            medication_adherence_rate_30d=_medication_adherence_30d(db, patient_id),
        ),
        recent_checkins_30d=[CheckinOut.model_validate(c) for c in checkins],
        active_session=active_session_block,
        recent_sessions=sessions_block,
        recent_safety_events=RecentSafetyEvents(
            grade_a=[SafetyEventOut.model_validate(e) for e in grade_a],
            grade_b=[SafetyEventOut.model_validate(e) for e in grade_b],
        ),
        llm_lock_status=LLMLockStatus(
            locked=patient.llm_locked,
            locked_at=patient.llm_locked_at,
            reason=patient.llm_lock_reason,
            unlocked_at=patient.llm_unlocked_at,
            unlocked_by=patient.llm_unlocked_by,
            unlock_note=patient.llm_unlock_note,
        ),
    )
