from fastapi import APIRouter

from app.deps import DbSession, InternalKey
from app.schemas.internal import StageTrackRequest, StageTrackResponse
from app.services import stage_tracker

router = APIRouter(prefix="/internal/stage", tags=["Internal - Session"])


@router.post("/track", response_model=StageTrackResponse)
def track(body: StageTrackRequest, db: DbSession, _: InternalKey) -> StageTrackResponse:
    return stage_tracker.track(db, body)
