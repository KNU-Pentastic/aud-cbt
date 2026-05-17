from fastapi import APIRouter

from app.deps import DbSession, InternalKey
from app.schemas.internal import OutputFilterRequest, OutputFilterResponse
from app.services import output_filter

router = APIRouter(prefix="/internal/output", tags=["Internal - Output"])


@router.post("/filter", response_model=OutputFilterResponse)
def filter_output(
    body: OutputFilterRequest, db: DbSession, _: InternalKey
) -> OutputFilterResponse:
    return output_filter.check(db, body)
