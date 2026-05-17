from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.deps import DbSession, InternalKey
from app.schemas.internal import LLMInvokeRequest, LLMInvokeResponse, LLMUsageOut
from app.services import llm_gateway

router = APIRouter(prefix="/internal/llm", tags=["Internal - LLM"])


@router.post("/invoke")
async def invoke(body: LLMInvokeRequest, db: DbSession, _: InternalKey):
    if body.stream:
        async def gen():
            async for tok in llm_gateway.stream(db, body):
                yield {"event": "token", "data": tok}
            yield {"event": "done", "data": "{}"}

        return EventSourceResponse(gen(), ping=15)
    return llm_gateway.invoke(db, body)


@router.get("/usage/{patient_id}", response_model=LLMUsageOut)
def usage(patient_id: str, db: DbSession, _: InternalKey) -> LLMUsageOut:
    return llm_gateway.usage_for(db, patient_id)
