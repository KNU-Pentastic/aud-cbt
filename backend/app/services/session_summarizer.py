"""Session summarizer — Sonnet 4.6. Produces SessionSummary at session end."""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.ids import session_summary_id
from app.models.session_summary import SessionSummary as SessionSummaryModel
from app.schemas.internal import (
    LLMInvokeRequest,
    SessionSummarizeRequest,
    SessionSummary as SessionSummaryDTO,
    TriggerEntry,
)
from app.services import llm_gateway

log = logging.getLogger(__name__)

# DB 컬럼 길이 가드 (session_summaries) — 모델이 너무 길게 써도 INSERT 가 깨지지 않게.
_HANDOFF_MAX = 4000
_HOMEWORK_MAX = 2000


def _extract_json(content: str) -> dict | None:
    """모델 응답에서 JSON 객체를 견고하게 추출한다.

    ```json ... ``` 코드펜스나 앞뒤 설명 텍스트가 섞여도 동작하도록, 첫 '{' 부터
    중괄호 깊이를 세어 균형 잡힌 가장 바깥 객체를 우선 시도하고, 실패하면 greedy
    매칭(첫 '{' ~ 마지막 '}')으로 한 번 더 시도한다. 유효한 dict 를 못 찾으면 None.
    (예전엔 greedy 매칭 한 번만 시도해, 간헐적으로 파싱이 실패하면 그대로 '빈 요약'이
     저장돼 직전 세션 참고 내용이 비어 보였다 — BUG.)
    """
    if not content:
        return None
    candidates: list[str] = []
    start = content.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(content)):
            ch = content[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(content[start : i + 1])
                    break
    m = re.search(r"\{.*\}", content, re.S)
    if m:
        candidates.append(m.group(0))
    for cand in candidates:
        try:
            parsed = json.loads(cand)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


_SYS = (
    "You are a clinical session summarizer for an alcohol-use-disorder CBT app. "
    "Read the full dialogue of one Week's session and write a structured handoff "
    "for the next Week's LLM. Be specific, faithful, and concise. "
    "Reply ONLY as strict JSON with this exact shape: "
    '{"completed":["..."],"unaddressed":["..."],"insights":["..."],'
    '"triggers":[{"tag":"...","context":"..."}],"homework":"...",'
    '"tone":"engaged|resistant|low|volatile|neutral","handoff":"...",'
    '"safety_flags":[{"grade":"A|B","event_type":"..."}]}'
)


def summarize(db: Session, req: SessionSummarizeRequest) -> SessionSummaryDTO:
    start = time.time()
    messages = [
        {
            "role": "user",
            "content": (
                f"Week: {req.week_number}\n"
                f"Objectives: {req.session_objectives}\n"
                f"Previous summary: {req.previous_summary}\n"
                f"Patient context: {req.patient_context}\n"
                f"Dialogue: {req.full_dialogue}"
            ),
        }
    ]
    # LLM 호출 + JSON 파싱. 간헐적 파싱 실패(설명문 혼입·일시적 오류)에 대비해 1회 재시도한다.
    # 끝내 실패하면 '빈 요약'을 조용히 저장하지 않도록 경고 로그를 남긴다.
    data: dict = {}
    for attempt in range(2):
        try:
            resp = llm_gateway.invoke(
                db,
                LLMInvokeRequest(
                    model=settings.llm_model_tracking,
                    messages=messages,
                    system=_SYS,
                    max_tokens=2500,
                    temperature=0.3,
                    stream=False,
                    patient_id=req.patient_id,
                    purpose="session_summarization",
                    caller_component="session_summarizer",
                ),
            )
        except Exception:
            log.warning("session summarize: LLM 호출 실패 (시도 %d/2)", attempt + 1, exc_info=True)
            continue
        parsed = _extract_json(resp.content)
        if parsed is not None:
            data = parsed
            break
        log.warning(
            "session summarize: JSON 파싱 실패 (시도 %d/2). content[:300]=%r",
            attempt + 1,
            resp.content[:300],
        )

    triggers = [
        TriggerEntry(tag=str(t.get("tag", "")), context=str(t.get("context", "")))
        for t in data.get("triggers", [])
        if isinstance(t, dict) and t.get("tag")
    ]
    safety_flags = [
        {"grade": f.get("grade"), "event_type": f.get("event_type")}
        for f in data.get("safety_flags", [])
        if isinstance(f, dict)
    ]

    dto = SessionSummaryDTO(
        session_completed_objectives=[str(x) for x in data.get("completed", [])],
        session_unaddressed_objectives=[str(x) for x in data.get("unaddressed", [])],
        patient_key_insights=[str(x) for x in data.get("insights", [])],
        identified_triggers=triggers,
        assigned_homework=str(data.get("homework", ""))[:_HOMEWORK_MAX],
        emotional_tone=data.get("tone", "neutral") if data.get("tone") in (
            "engaged", "resistant", "low", "volatile", "neutral"
        ) else "neutral",
        next_session_handoff_notes=str(data.get("handoff", ""))[:_HANDOFF_MAX],
        safety_flags=[
            {"grade": s["grade"], "event_type": s["event_type"]}
            for s in safety_flags
            if s.get("grade") in ("A", "B") and s.get("event_type")
        ],  # type: ignore[arg-type]
        generated_at=datetime.now(timezone.utc),
        model_used=settings.llm_model_tracking,
        generation_time_ms=int((time.time() - start) * 1000),
    )

    db.add(
        SessionSummaryModel(
            session_summary_id=session_summary_id(),
            session_id=req.session_id,
            patient_id=req.patient_id,
            week_number=req.week_number,
            completed_objectives=dto.session_completed_objectives,
            unaddressed_objectives=dto.session_unaddressed_objectives,
            key_insights=dto.patient_key_insights,
            identified_triggers=[t.model_dump() for t in dto.identified_triggers],
            assigned_homework=dto.assigned_homework,
            emotional_tone=dto.emotional_tone,
            handoff_notes=dto.next_session_handoff_notes,
            safety_flags=[f.model_dump() for f in dto.safety_flags],
            model_used=dto.model_used,
            generation_time_ms=dto.generation_time_ms,
            generated_at=dto.generated_at,
        )
    )
    db.commit()
    return dto
