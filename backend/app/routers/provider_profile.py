"""의료진 본인 프로필 — GET /me/provider

[JUNIOR DEV TASK]
구현:
  - active_patient_count = provider.provider_id 로 patients 테이블에서 program_status='active' count
"""

from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import CurrentProvider, DbSession
from app.models.patient import Patient
from app.schemas.provider import ProviderProfile

router = APIRouter(tags=["Provider - Profile"])


@router.get("/me/provider", response_model=ProviderProfile)
def get_provider(provider: CurrentProvider, db: DbSession) -> ProviderProfile:
    count = int(
        db.execute(
            select(func.count(Patient.patient_id)).where(
                Patient.provider_id == provider.provider_id,
                Patient.program_status == "active",
            )
        ).scalar()
        or 0
    )
    return ProviderProfile(
        provider_id=provider.provider_id,
        name=provider.name,
        email=provider.email,  # type: ignore[arg-type]
        affiliation=provider.affiliation,
        active_patient_count=count,
        notification_preferences=provider.notification_preferences or {},
    )
