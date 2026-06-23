"""LLM Gateway — wraps Anthropic API. Falls back to deterministic mock when no key.

All LLM-using components MUST go through this module (per openapi.yaml internal API).
It owns: model selection, retry, per-patient daily token quota, usage logging.
"""

from __future__ import annotations

import asyncio
import logging
import re
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
from app.services import deidentify

log = logging.getLogger(__name__)

_anthropic_client = None
# True once we have logged a loud warning about an unexpected mock fallback,
# so we warn clearly the first time without spamming every request.
_mock_fallback_warned = False

# Models that no longer accept the `temperature` parameter (sending it → 400).
_NO_TEMPERATURE_MODELS = {"claude-opus-4-8"}


def _create_kwargs(req: LLMInvokeRequest) -> dict[str, Any]:
    """Common kwargs for messages.create/stream. Omits params the model rejects.

    외부(Anthropic)로 나가기 직전이므로 발화/시스템 프롬프트의 정형 식별자
    (주민번호·전화·이메일·카드/계좌번호)를 가명처리한다. 국외이전 노출 최소화.
    DB 에 저장된 원문은 그대로 유지되고, 여기서 만든 사본만 마스킹된다.
    """
    kwargs: dict[str, Any] = {
        "model": req.model,
        "max_tokens": req.max_tokens,
        "system": deidentify.mask_text(req.system or ""),
        "messages": deidentify.mask_messages(req.messages),
    }
    if req.model not in _NO_TEMPERATURE_MODELS:
        kwargs["temperature"] = req.temperature if req.temperature is not None else 0.7
    return kwargs


def _get_client():
    global _anthropic_client, _mock_fallback_warned
    if _anthropic_client is None and not settings.llm_mock_enabled:
        try:
            from anthropic import Anthropic

            _anthropic_client = Anthropic(api_key=settings.anthropic_api_key)
        except Exception:
            # USE_LLM_MOCK=false 인데 클라이언트 생성에 실패 → 의도치 않은 mock 폴백.
            # 조용히 넘어가면 "왜 mock 응답이 나오지?"를 진단하기 어려우므로 명확히 알린다.
            if not _mock_fallback_warned:
                log.error(
                    "USE_LLM_MOCK=false 이지만 Anthropic 클라이언트 초기화에 실패했습니다. "
                    "mock 응답으로 폴백합니다. `pip install -r requirements.txt`(anthropic) "
                    "설치 여부와 ANTHROPIC_API_KEY 를 확인하세요.",
                    exc_info=True,
                )
                _mock_fallback_warned = True
            return None
    return _anthropic_client


def effective_mode() -> dict:
    """기동 진단용: 현재 LLM 모드(mock/real)와 대화 모델을 반환한다."""
    if settings.llm_mock_enabled:
        reason = "USE_LLM_MOCK=true" if settings.use_llm_mock else "ANTHROPIC_API_KEY 미설정"
        return {"mode": "mock", "reason": reason, "model": settings.llm_model_dialogue}
    client = _get_client()
    if client is None:
        return {
            "mode": "mock",
            "reason": "Anthropic 클라이언트 초기화 실패 (anthropic 패키지/키 확인)",
            "model": settings.llm_model_dialogue,
        }
    return {"mode": "real", "reason": None, "model": settings.llm_model_dialogue}


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
        # mock 모드: 매 호출 현재 단계를 완료(step_complete)로 보아 한 칸 전진하고,
        # 5단계에서 session_complete 를 내 세션을 마무리한다. (예전엔 ready 가 항상 false 라
        # 세션이 영영 끝나지 않았다 — BUG #6) 새 stage_tracker 스키마에 맞춘다.
        m = re.search(r"current_step:\s*(\d+)", last_user)
        step = int(m.group(1)) if m else 1
        session_complete = "true" if step >= 5 else "false"
        text = (
            '{"step_complete": true, "session_complete": ' + session_complete
            + ', "completion": ' + f"{min(1.0, step / 5):.2f}"
            + ', "drift": "low", "delivered": []}'
        )
    elif req.purpose == "session_summarization":
        # 데모/개발용 요약 — summarizer 가 읽는 키(completed/unaddressed/insights/
        # triggers/homework/tone/handoff/safety_flags)에 맞춘 대표 내용. 이래야 다음
        # 세션의 [직전 세션 요약]·TRACE 의 '직전 세션 참고'가 비어 있지 않게 표출된다.
        text = (
            '{"completed": ["감정 체크인 완료", "지난주 과제 리뷰"], '
            '"unaddressed": ["수면 패턴 점검"], '
            '"insights": ["회식 상황에서 갈망이 높아짐을 인식"], '
            '"triggers": [{"tag": "work_stress", "context": "업무 마감 후 음주 충동"}], '
            '"homework": "이번 주 갈망 일지 3회 작성", "tone": "engaged", '
            '"handoff": "다음 주에는 회식 거절 스크립트를 함께 연습할 것", '
            '"safety_flags": []}'
        )
    elif req.purpose == "output_filtering":
        text = '{"passed": true, "violations": []}'
    elif req.purpose == "trigger_normalization":
        text = '{"normalized_tags": ["work_stress"], "confidence": 0.6}'
    elif req.purpose == "utterance_analysis":
        # 데모/평가용 발화 분석 mock — 입력 키워드로 갈망/감정을 가볍게 추정.
        blob = last_user
        craving = any(k in blob for k in ("마시", "한 잔", "술", "갈망", "drink", "crav"))
        anxious = any(k in blob for k in ("불안", "걱정", "무섭", "초조", "anxious", "worried"))
        emo = "불안" if anxious else ("갈망" if craving else "중립")
        text = (
            '{"primary_emotion": "' + emo + '", "emotions": ["' + emo + '"], '
            '"intent": "mock: 현재 상태 공유", "cognitive_distortions": [], '
            '"craving_intensity": ' + ("6" if craving else "1") + ', '
            '"topics": ["mock"], "relevant_step": 3, '
            '"summary": "mock 분석 — 실제 분석은 ANTHROPIC_API_KEY 설정 시 동작합니다."}'
        )
    elif req.purpose == "module_classification":
        # Light keyword match over the classifier input so the demo is illustrative.
        blob = last_user
        mood = any(k in blob for k in ("우울", "불안", "depress", "anxiet", "mood"))
        social = any(k in blob for k in ("권유", "압력", "회식", "social", "pressure"))
        mods = ["MOOD"] if mood else (["DREF"] if social else ["CRAV"])
        text = (
            '{"selected_modules": ' + str(mods).replace("'", '"') + ', '
            '"rationale": "mock: 트리거 키워드 기반 기본 선택", "confidence": 0.4}'
        )
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
            resp = client.messages.create(**_create_kwargs(req))
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
        with client.messages.stream(**_create_kwargs(req)) as s:
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
