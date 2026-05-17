from fastapi import APIRouter

from app.deps import DbSession, InternalKey
from app.schemas.internal import TriggerNormalizeRequest, TriggerNormalizeResponse
from app.services import trigger_normalizer

router = APIRouter(prefix="/internal/trigger", tags=["Internal - Misc"])


@router.post("/normalize", response_model=TriggerNormalizeResponse)
def normalize(
    body: TriggerNormalizeRequest, db: DbSession, _: InternalKey
) -> TriggerNormalizeResponse:
    return trigger_normalizer.normalize(db, body)
