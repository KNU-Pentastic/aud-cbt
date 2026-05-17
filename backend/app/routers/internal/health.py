from fastapi import APIRouter

from app.deps import DbSession
from app.schemas.internal import HealthResponse
from app.services import health

router = APIRouter(prefix="/internal/health", tags=["Internal - Misc"])


@router.get("", response_model=HealthResponse)
def get_health(db: DbSession) -> HealthResponse:
    return health.overall(db)
