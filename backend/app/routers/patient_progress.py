"""P5 진도 — GET /me/progress

[JUNIOR DEV TASK]
구현:
  - sobriety_days = (오늘 - patient.discharge_date).days, 음수면 0
  - current_week  = patient.current_week
  - weeks_completed = max(0, current_week - 1)
  - next_session_date = patient_home의 다음 세션일 계산 로직 재사용 (또는 None)

"""
from datetime import datetime, timezone
from fastapi import APIRouter

from app.deps import CurrentPatient
from app.schemas.patient import ProgressResponse

router = APIRouter(tags=["Patient - Progress"])


@router.get("/me/progress", response_model=ProgressResponse)
def get_progress(patient: CurrentPatient) -> ProgressResponse:
    # TODO(junior): docstring대로 계산.
    today = datetime.now(timezone.utc).date()
    days = (today - patient.discharge_date).days
    return ProgressResponse(
        sobriety_days=max(0, days),
        weeks_completed=max(0, patient.current_week - 1),
        current_week=patient.current_week,
        next_session_date=None,
    )
