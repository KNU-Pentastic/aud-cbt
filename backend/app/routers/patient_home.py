"""P1 홈 화면 — GET /me/patient

[JUNIOR DEV TASK]
이 파일은 입문자가 구현합니다. 같은 폴더의 patient_checkin.py를 참고하세요.

구현해야 할 것:
  - patient(인증) 기반으로 단일 통합 응답 PatientHomeResponse 반환
  - sobriety_days = (오늘 - patient.discharge_date).days, 0 미만이면 0
  - current_week = patient.current_week
  - days_to_next_session = 환자가 선택한 session_day_of_week(0=월) 기준,
    오늘로부터 며칠 후가 다음 세션인지 (오늘이면 0)
  - today_tasks.checkin_pending = 오늘 DailyCheckin 이 없으면 True
  - today_tasks.session_today = days_to_next_session == 0
  - next_outpatient_date = patient.next_outpatient_date
  - llm_locked = patient.llm_locked

힌트:
  from datetime import datetime, timezone
  from sqlalchemy import select
  from app.models.daily_checkin import DailyCheckin
"""

from datetime import datetime, timezone
from sqlalchemy import select
from app.models.daily_checkin import DailyCheckin
from fastapi import APIRouter

from app.deps import CurrentPatient, DbSession
from app.schemas.patient import PatientHomeResponse, TodayTasks

router = APIRouter(tags=["Patient - Home"])


@router.get("/me/patient", response_model=PatientHomeResponse)
def get_home(patient: CurrentPatient, db: DbSession) -> PatientHomeResponse:
    # TODO(junior): 위 docstring대로 채우기.
    today = datetime.now(timezone.utc).date()
    days_to_next_session = (patient.session_day_of_week - today.weekday()) % 7
    exists = db.execute(
        select(DailyCheckin).where(
            DailyCheckin.patient_id == patient.patient_id,
            DailyCheckin.date == today,
        )
    ).scalar_one_or_none() is not None
    checkin_pending = not exists
    return PatientHomeResponse(
        patient_id=patient.patient_id,
        name=patient.name,
        sobriety_days=max(0, (today - patient.discharge_date).days),
        current_week=patient.current_week,
        days_to_next_session=days_to_next_session,
        today_tasks=TodayTasks(checkin_pending=checkin_pending, session_today=days_to_next_session == 0),
        next_outpatient_date=patient.next_outpatient_date,
        llm_locked=patient.llm_locked,
    )
