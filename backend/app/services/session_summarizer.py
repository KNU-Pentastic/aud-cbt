"""Session summarizer — Sonnet 4.6. Produces SessionSummary at session end."""

from __future__ import annotations

import json
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
    try:
        resp = llm_gateway.invoke(
            db,
            LLMInvokeRequest(
                model=settings.llm_model_tracking,
                messages=messages,
                system=_SYS,
                max_tokens=1500,
                temperature=0.3,
                stream=False,
                patient_id=req.patient_id,
                purpose="session_summarization",
                caller_component="session_summarizer",
            ),
        )
        m = re.search(r"\{.*\}", resp.content, re.S)
        data = json.loads(m.group(0)) if m else {}
    except Exception:
        data = {}

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
        assigned_homework=str(data.get("homework", "")),
        emotional_tone=data.get("tone", "neutral") if data.get("tone") in (
            "engaged", "resistant", "low", "volatile", "neutral"
        ) else "neutral",
        next_session_handoff_notes=str(data.get("handoff", "")),
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
