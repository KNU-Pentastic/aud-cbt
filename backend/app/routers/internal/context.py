from fastapi import APIRouter

from app.deps import DbSession, InternalKey
from app.exceptions import not_found
from app.schemas.internal import ContextBuildRequest, ContextBuildResponse
from app.services import context_builder

router = APIRouter(prefix="/internal/context", tags=["Internal - LLM"])


@router.post("/build", response_model=ContextBuildResponse)
def build(body: ContextBuildRequest, db: DbSession, _: InternalKey) -> ContextBuildResponse:
    try:
        return context_builder.build(db, body)
    except ValueError as exc:
        raise not_found(str(exc), code="PATIENT_NOT_FOUND") from exc
