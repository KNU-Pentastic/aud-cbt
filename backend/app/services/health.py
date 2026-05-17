"""Health check — pings DB and reports cached subsystem status.

For v3.0 demo this is intentionally simple: postgres + anthropic_api status
(based on mock-mode setting) + always-healthy markers for the LLM components
since they run in-process.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.schemas.internal import ComponentHealth, HealthResponse


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _check_postgres(db: Session) -> ComponentHealth:
    start = time.time()
    try:
        db.execute(text("SELECT 1"))
        return ComponentHealth(
            name="postgresql",
            status="healthy",
            response_time_ms=int((time.time() - start) * 1000),
            last_success_at=_now(),
        )
    except Exception as exc:
        return ComponentHealth(
            name="postgresql",
            status="unhealthy",
            response_time_ms=int((time.time() - start) * 1000),
            error_message=str(exc)[:200],
            last_success_at=_now(),
        )


def _check_anthropic() -> ComponentHealth:
    return ComponentHealth(
        name="anthropic_api",
        status="degraded" if settings.llm_mock_enabled else "healthy",
        response_time_ms=0,
        error_message="mock mode" if settings.llm_mock_enabled else None,
        last_success_at=_now(),
    )


def _in_process(name: str) -> ComponentHealth:
    return ComponentHealth(
        name=name,
        status="healthy",
        response_time_ms=0,
        last_success_at=_now(),
    )


def overall(db: Session) -> HealthResponse:
    pg = _check_postgres(db)
    anth = _check_anthropic()
    components = [
        pg,
        anth,
        _in_process("safety_classifier"),
        _in_process("stage_tracker"),
        _in_process("session_summarizer"),
        _in_process("output_filter"),
        _in_process("llm_gateway"),
        _in_process("context_builder"),
    ]
    statuses = {c.status for c in components}
    if "unhealthy" in statuses:
        overall_status = "unhealthy"
    elif "degraded" in statuses:
        overall_status = "degraded"
    else:
        overall_status = "healthy"
    return HealthResponse(overall_status=overall_status, components=components)
