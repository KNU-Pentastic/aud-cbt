from fastapi import APIRouter

from app.deps import DbSession, InternalKey
from app.schemas.internal import SafetyClassifyRequest, SafetyClassifyResponse
from app.services import safety_classifier

router = APIRouter(prefix="/internal/safety", tags=["Internal - Safety"])


@router.post("/classify", response_model=SafetyClassifyResponse)
def classify(
    body: SafetyClassifyRequest, db: DbSession, _: InternalKey
) -> SafetyClassifyResponse:
    return safety_classifier.classify(db, body)
