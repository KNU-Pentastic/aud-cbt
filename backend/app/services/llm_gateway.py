"""LLM Gateway — wraps Anthropic API. Falls back to deterministic mock when no key.

All LLM-using components MUST go through this module (per openapi.yaml internal API).
It owns: model selection, retry, per-patient daily token quota, usage logging.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.exceptions import too_many, upstream_unavailable
from app.ids import llm_invocation_id
from app.models.llm_usage import LLMUsage
from app.schemas.internal import LLMInvokeRequest, LLMInvokeResponse, LLMUsageBlock, LLMUsageOut

log = logging.getLogger(__name__)

_anthropic_client = None


def _get_client():
    global _anthropic_client
    if _anthropic_client is None and not settings.llm_mock_enabled:
        try:
            from anthropic import Anthropic

            _anthropic_client = Anthropic(api_key=settings.anthropic_api_key)
        except Exception:
            log.exception("Failed to init Anthropic client; falling back to mock.")
            return None
    return _anthropic_client


def _mock_response(req: LLMInvokeRequest) -> tuple[str, int, int]:
    """Deterministic mock for dev/demo without an API key."""
    last_user = next(
        (m.get("content", "") for m in reversed(req.messages) if m.get("role") == "user"),
        "",
    )
    if isinstance(last_user, list):  # support content blocks shape
        last_user = " ".join(b.get("text", "") for b in last_user if isinstance(b, dict))

    if req.purpose == "safety_classification":
        text = '{"grade": "none", "event_type": "none", "confidence": 0.1}'
    elif req.purpose == "stage_tracking":
        text = '{"ready_to_advance": false, "drift": "low"}'
    elif req.purpose == "session_summarization":
        text = '{"key_insights": [], "homework": ""}'
    elif req.purpose == "output_filtering":
        text = '{"passed": true, "violations": []}'
    elif req.purpose == "trigger_normalization":
        text = '{"normalized_tags": ["work_stress"], "confidence": 0.6}'
    else:
        text = (
            f"[mock-{req.model}] 잘 들었어요. 방금 말씀하신 부분 — \"{last_user[:60]}\" — "
            "조금 더 이야기해 줄 수 있을까요? 어떤 상황에서 그런 마음이 들었는지 궁금합니다."
        )

    input_tokens = max(1, sum(len(str(m)) for m in req.messages) // 4)
    output_tokens = max(1, len(text) // 4)
    return text, input_tokens, output_tokens


def _today() -> date:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).date()


def _record_usage(db: Session, patient_id: str, model: str, in_tok: int, out_tok: int) -> None:
    today = _today()
    delta = in_tok + out_tok
    row = db.execute(
        select(LLMUsage).where(LLMUsage.patient_id == patient_id, LLMUsage.date == today)
    ).scalar_one_or_none()
    if row is None:
        db.add(
            LLMUsage(
                patient_id=patient_id,
                date=today,
                used_tokens=delta,
                breakdown_by_model={model: delta},
            )
        )
    else:
        row.used_tokens += delta
        breakdown = dict(row.breakdown_by_model or {})
        breakdown[model] = breakdown.get(model, 0) + delta
        row.breakdown_by_model = breakdown
    db.commit()


def _check_quota(db: Session, patient_id: str) -> int:
    today = _today()
    row = db.execute(
        select(LLMUsage).where(LLMUsage.patient_id == patient_id, LLMUsage.date == today)
    ).scalar_one_or_none()
    used = row.used_tokens if row else 0
    remaining = settings.llm_daily_token_quota - used
    return remaining


def invoke(db: Session, req: LLMInvokeRequest) -> LLMInvokeResponse:
    remaining = _check_quota(db, req.patient_id)
    if remaining <= 0:
        raise too_many("Daily LLM token quota exceeded", code="LLM_TOKEN_QUOTA_EXCEEDED")

    client = _get_client()
    if client is None:
        content, in_tok, out_tok = _mock_response(req)
    else:
        try:
            resp = client.messages.create(
                model=req.model,
                max_tokens=req.max_tokens,
                system=req.system or "",
                messages=req.messages,
                temperature=req.temperature if req.temperature is not None else 0.7,
            )
            # SDK returns a list of TextBlocks
            content = "".join(getattr(b, "text", "") for b in (resp.content or []))
            in_tok = resp.usage.input_tokens
            out_tok = resp.usage.output_tokens
        except Exception as exc:
            log.exception("Anthropic invoke failed")
            raise upstream_unavailable(
                "Anthropic API failure", retry_after=30
            ) from exc

    _record_usage(db, req.patient_id, req.model, in_tok, out_tok)

    return LLMInvokeResponse(
        content=content,
        usage=LLMUsageBlock(input_tokens=in_tok, output_tokens=out_tok),
        stop_reason="end_turn",
        invocation_id=llm_invocation_id(),
    )


async def stream(db: Session, req: LLMInvokeRequest) -> AsyncGenerator[str, None]:
    """Token-by-token stream. Yields raw text fragments; the SSE layer wraps them.

    The DB usage update happens once at the end with totals.
    """
    remaining = _check_quota(db, req.patient_id)
    if remaining <= 0:
        raise too_many("Daily LLM token quota exceeded", code="LLM_TOKEN_QUOTA_EXCEEDED")

    client = _get_client()
    if client is None:
        full, in_tok, out_tok = _mock_response(req)
        # simulate token-by-token
        for token in _tokenize_for_mock(full):
            yield token
            await asyncio.sleep(0.03)
        _record_usage(db, req.patient_id, req.model, in_tok, out_tok)
        return

    try:
        with client.messages.stream(
            model=req.model,
            max_tokens=req.max_tokens,
            system=req.system or "",
            messages=req.messages,
            temperature=req.temperature if req.temperature is not None else 0.7,
        ) as s:
            for chunk in s.text_stream:
                yield chunk
                await asyncio.sleep(0)
            final = s.get_final_message()
        in_tok = final.usage.input_tokens
        out_tok = final.usage.output_tokens
    except Exception as exc:
        log.exception("Anthropic stream failed")
        raise upstream_unavailable("Anthropic streaming failure", retry_after=30) from exc

    _record_usage(db, req.patient_id, req.model, in_tok, out_tok)


def _tokenize_for_mock(text: str) -> list[str]:
    """Roughly word-level chunks for the mock streamer."""
    out: list[str] = []
    buf = ""
    for ch in text:
        buf += ch
        if ch in " ,.!?\n…":
            out.append(buf)
            buf = ""
    if buf:
        out.append(buf)
    return out


def usage_for(db: Session, patient_id: str) -> LLMUsageOut:
    today = _today()
    row = db.execute(
        select(LLMUsage).where(LLMUsage.patient_id == patient_id, LLMUsage.date == today)
    ).scalar_one_or_none()
    used = row.used_tokens if row else 0
    breakdown = dict(row.breakdown_by_model) if row and row.breakdown_by_model else {}
    return LLMUsageOut(
        date=today,
        used_tokens=used,
        daily_quota=settings.llm_daily_token_quota,
        quota_remaining=max(0, settings.llm_daily_token_quota - used),
        breakdown_by_model=breakdown,
    )
