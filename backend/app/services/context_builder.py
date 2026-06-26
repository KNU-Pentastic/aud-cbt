"""Context builder — assembles the patient-coach system prompt from CBI assets.

Model (확정 2026-05-24, docs/CBI_시스템프롬프트_적용방안.md):
  - 12-week timeline is kept. Week → Phase is deterministic:
        W1 = Phase 1 (동기), W2–3 = Phase 2 (기능분석),
        W4–11 = Phase 3 (모듈), W12 = Phase 4 (종결).
  - Phase 3 content is NOT a fixed week→module grid. A classifier
    (services/module_classifier) picks 1~2 modules from the patient's data and we
    inject the matching curated blocks. This satisfies NIAAA CBI §5 (individualized
    modules) and §2.6 (≤2 at once) without a state machine or module queue.
  - COMMON header + phase/module blocks come from curated assets in
    app/prompts/cbi/v3/ (services/prompt_assets). Pull-out branches (resu/soma) and
    on-demand craving use their own asset blocks.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.daily_checkin import DailyCheckin
from app.models.discharge_profile import DischargeProfile
from app.models.patient import Patient
from app.models.session_summary import SessionSummary
from app.schemas.internal import (
    ContextBuildRequest,
    ContextBuildResponse,
    ModuleClassifyRequest,
)
from app import cbt_stages
from app.services import module_classifier, prompt_assets

# 한국어 코치 페르소나 + 안전 분담. COMMON(MI 원칙)·Phase 블록은 자산에서 덧붙인다.
_BASE_PERSONA = (
    "당신은 알코올 사용 장애 환자를 위한 한국어 CBT 코치입니다. "
    "NIAAA CBI(결합 행동 개입) 매뉴얼 구조를 따르며, 환자의 자율성을 존중하고 "
    "비판단적이며 따뜻한 어조로 대화합니다. 의학적 진단·처방·복용량 변경은 "
    "절대 하지 않습니다. 자살·급성중독 신호가 보이면 즉시 119/109 자원으로 "
    "안내하도록 시스템이 처리하므로, 당신은 일반 대화만 담당합니다."
)

_COMMON_TARGET = "system_prompt_common_header"


def _phase_for_week(week: int) -> int:
    """Deterministic 12-week → CBI Phase mapping."""
    if week <= 1:
        return 1
    if week <= 3:
        return 2
    if week <= 11:
        return 3
    return 4


def _phase_target(phase: int) -> str:
    return {
        1: "phase_1_system_prompt",
        2: "phase_2_system_prompt",
        4: "phase_4_system_prompt",
    }.get(phase, "phase_1_system_prompt")


def _patient_block(p: Patient, dp: DischargeProfile | None) -> dict[str, Any]:
    return {
        "name": p.name,
        "current_week": p.current_week,
        "discharge_date": p.discharge_date.isoformat(),
        "next_outpatient_date": p.next_outpatient_date.isoformat() if p.next_outpatient_date else None,
        "diagnosis_severity": dp.diagnosis_severity if dp else None,
        "medications": dp.medications if dp else [],
        "comorbidities": dp.comorbidities if dp else [],
        "suicide_ideation_history": dp.suicide_ideation_history if dp else None,
        "normalized_triggers": dp.normalized_triggers if dp else [],
    }


def _recent_checkins_block(db: Session, patient_id: str) -> list[dict[str, Any]]:
    since = (datetime.now(timezone.utc) - timedelta(days=7)).date()
    rows = (
        db.execute(
            select(DailyCheckin)
            .where(DailyCheckin.patient_id == patient_id, DailyCheckin.date >= since)
            .order_by(desc(DailyCheckin.date))
        )
        .scalars()
        .all()
    )
    return [
        {"date": c.date.isoformat(), "mood": c.mood_nrs, "craving": c.craving_nrs, "sleep": c.sleep_hours}
        for c in rows
    ]


def _previous_summary_block(db: Session, patient_id: str) -> dict[str, Any] | None:
    row = db.execute(
        select(SessionSummary)
        .where(SessionSummary.patient_id == patient_id)
        .order_by(desc(SessionSummary.week_number))
        .limit(1)
    ).scalar_one_or_none()
    if row is None:
        return None
    return {
        "week_number": row.week_number,
        "completed_objectives": row.completed_objectives,
        "unaddressed_objectives": row.unaddressed_objectives,
        "key_insights": row.key_insights,
        "handoff_notes": row.handoff_notes,
        "assigned_homework": row.assigned_homework,
    }


def _join(parts: list[str]) -> str:
    return "\n\n".join(p for p in parts if p and p.strip())


def _prompt_blocks_meta(targets: list[str]) -> list[dict[str, str]]:
    """주입된 curated 자산 중 실제 내용이 있는 것만 [{target, title, body}] 로 돌려준다.

    '이 답변에서 LLM 이 무슨 가이드라인을 참고했는지'를 정량 평가용으로 노출하기 위한
    메타데이터. body 는 시스템 프롬프트에 실제로 박힌 블록 본문(render_block 결과)과
    동일하다 — 평가자가 '정확히 이 가이드라인을 봤다'를 확인할 수 있게 한다.
    환자 PII(이름·체크인 등)는 블록 본문이 아니라 별도 영역에 들어가므로 여기엔 없다.
    """
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for t in targets:
        if not t or t in seen:
            continue
        asset = prompt_assets.load_asset(t)
        if not asset or not (asset.get("principles_ko") or asset.get("rules_ko")):
            continue
        seen.add(t)
        out.append(
            {
                "target": t,
                "title": asset.get("title_ko", t),
                "body": prompt_assets.render_block(t),
            }
        )
    return out


def _select_modules(db: Session, patient: Patient, dp: DischargeProfile | None, week: int) -> tuple[list[str], dict]:
    """Run the Phase 3 module classifier; returns (module_codes, debug_block)."""
    req = ModuleClassifyRequest(
        patient_id=patient.patient_id,
        week_number=week,
        normalized_triggers=(dp.normalized_triggers if dp else []) or [],
        comorbidities=(dp.comorbidities if dp else []) or [],
        recent_checkins=_recent_checkins_block(db, patient.patient_id),
        previous_modules=[],
    )
    result = module_classifier.classify(db, req)
    debug = {
        "selected_modules": result.selected_modules,
        "rationale": result.rationale,
        "confidence": result.confidence,
    }
    return list(result.selected_modules), debug


def build(db: Session, req: ContextBuildRequest) -> ContextBuildResponse:
    patient = db.get(Patient, req.patient_id)
    if patient is None:
        raise ValueError(f"patient {req.patient_id} not found")

    dp = patient.discharge_profile
    common = prompt_assets.render_block(_COMMON_TARGET)

    if req.context_type == "session":
        week = req.week_number or patient.current_week
        phase = _phase_for_week(week)
        step = cbt_stages.clamp_step(req.current_step)
        patient_block = _patient_block(patient, dp)
        previous = _previous_summary_block(db, patient.patient_id)
        recent = _recent_checkins_block(db, patient.patient_id)
        blocks: dict[str, Any] = {
            "phase": phase,
            "week_number": week,
            "current_step": step,
            "discharge_profile_summary": patient_block,
            "previous_session_summary": previous,
            "recent_checkins_summary": recent,
        }

        if phase == 3:
            codes, module_debug = _select_modules(db, patient, dp, week)
            module_targets = [prompt_assets.module_routing_target(c) for c in codes]
            module_blocks = [prompt_assets.render_block(t) for t in module_targets]
            module_names = ", ".join(
                next((m["name_ko"] for m in prompt_assets.load_modules() if m["code"] == c), c) for c in codes
            )
            focus = f"[이번 세션 초점] Phase 3 — {module_names or '갈망 대처'}"
            content = _join(module_blocks)
            blocks["selected_modules"] = module_debug
            prompt_targets = [_COMMON_TARGET, *module_targets]
        else:
            focus = f"[이번 세션 초점] Phase {phase}"
            content = prompt_assets.render_block(_phase_target(phase))
            prompt_targets = [_COMMON_TARGET, _phase_target(phase)]
        blocks["prompt_blocks"] = _prompt_blocks_meta(prompt_targets)

        system_prompt = _join(
            [
                _BASE_PERSONA,
                common,
                focus,
                content,
                f"[환자] {patient_block}",
                f"[직전 세션 요약] {previous}",
                f"[최근 7일 체크인] {recent}",
                (
                    f"[세션 단계] 이 세션은 5단계로 진행됩니다: {cbt_stages.overview()}.\n"
                    f"지금은 {cbt_stages.step_line(step)} 단계입니다. 이 단계의 목표에 집중해 충분히 "
                    f"대화하고, 환자가 준비되면 다음 단계로 자연스럽게 넘어가세요. 한 번에 여러 "
                    f"단계를 건너뛰지 말고, 5단계(이번 주 과제)를 함께 정하기 전에는 세션을 "
                    f"마무리하지 마세요."
                ),
            ]
        )

    elif req.context_type == "craving":
        recent = _recent_checkins_block(db, patient.patient_id)
        # On-demand craving help reuses the CRAV (갈망 대처) coping block.
        system_prompt = _join(
            [
                _BASE_PERSONA,
                common,
                "[갈망 대화 모드] 환자가 지금 갈망을 느껴 들어왔습니다. 20–30분 안에 "
                "갈망 강도를 낮추는 즉각적 대처를 함께 적용하세요.",
                prompt_assets.render_block("phase_3_crav_system_prompt"),
                f"[최근 7일 체크인] {recent}",
            ]
        )
        blocks = {
            "recent_checkins_summary": recent,
            "prompt_blocks": _prompt_blocks_meta([_COMMON_TARGET, "phase_3_crav_system_prompt"]),
        }

    elif req.context_type == "resu":
        system_prompt = _join(
            [_BASE_PERSONA, common, prompt_assets.render_block("pullout_resu_prompt")]
        )
        blocks = {
            "patient_id": patient.patient_id,
            "prompt_blocks": _prompt_blocks_meta([_COMMON_TARGET, "pullout_resu_prompt"]),
        }

    elif req.context_type == "soma":
        meds = dp.medications if dp else []
        system_prompt = _join(
            [
                _BASE_PERSONA,
                common,
                prompt_assets.render_block("pullout_soma_prompt"),
                f"[처방 약물] {meds}",
            ]
        )
        blocks = {
            "medications": meds,
            "prompt_blocks": _prompt_blocks_meta([_COMMON_TARGET, "pullout_soma_prompt"]),
        }

    else:  # pragma: no cover — pydantic enforces
        raise ValueError(f"unknown context_type {req.context_type}")

    return ContextBuildResponse(
        system_prompt=system_prompt,
        context_blocks=blocks,
        prompt_version=prompt_assets.PROMPT_VERSION,
    )
