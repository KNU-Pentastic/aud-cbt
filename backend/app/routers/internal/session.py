from fastapi import APIRouter, Response, status

from app.deps import DbSession, InternalKey
from app.ids import new_id
from app.schemas.internal import (
    SessionSummarizeAsyncAck,
    SessionSummarizeRequest,
    SessionSummary,
)
from app.services import session_summarizer

router = APIRouter(prefix="/internal/session", tags=["Internal - Session"])


@router.post("/summarize")
def summarize(body: SessionSummarizeRequest, db: DbSession, _: InternalKey):
    if body.async_:
        # v3.0 demo: enqueue is a no-op; return ack so callers can integrate now.
        return Response(
            content=SessionSummarizeAsyncAck(
                job_id=new_id("job", 10), status="queued"
            ).model_dump_json(),
            media_type="application/json",
            status_code=status.HTTP_202_ACCEPTED,
        )
    summary: SessionSummary = session_summarizer.summarize(db, body)
    return summary
