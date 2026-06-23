"""LLM 오케스트레이션 8개 서브 에이전트 라이브 관찰 도구.

각 서브 에이전트가 "잘 동작"하는지 실제 입출력을 보고 확인하기 위한 개발용 CLI.
인프로세스로 동작하므로(HTTP/인증 불필요) 서버를 띄울 필요가 없고, mock/real 여부와
모델은 `.env`(USE_LLM_MOCK / ANTHROPIC_API_KEY / LLM_MODEL_*)를 그대로 따른다. 단,
라이브 관찰을 위해 실행 동안 LLM_TRACE 는 강제로 켠다.

사전 준비 (backend/ 에서, .env 로드된 상태):
    alembic upgrade head
    python -m scripts.seed_demo

사용:
    # 8개 에이전트를 개별 입력으로 한 번에 점검 (결정적, 빠름)
    python -m scripts.trace_agents probe [--json]

    # 실제 세션 대화를 흘려보내며 매 턴 에이전트 입출력을 관찰
    python -m scripts.trace_agents chat --week 4 --scenario default
    python -m scripts.trace_agents chat            # 인터랙티브 입력
    python -m scripts.trace_agents chat -m "안녕하세요" -m "어제 한 잔 했어요"

probe 는 위기 발화로 환자를 잠그고(safety) 요약 행을 쓰므로(summarizer), 끝나면 데모
환자 잠금을 해제하고 임시 세션을 정리한다 — 재실행해도 안전하다.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time

from app.config import settings
from app.database import SessionLocal
from app.ids import session_id as new_session_id
from app.models.patient import Patient
from app.models.provider import Provider
from app.models.session import Session as CbtSession
from app.models.session_summary import SessionSummary as SessionSummaryModel
from app.schemas.internal import (
    ContextBuildRequest,
    LLMInvokeRequest,
    ModuleClassifyRequest,
    OutputFilterRequest,
    SafetyClassifyRequest,
    SessionSummarizeRequest,
    StageTrackRequest,
    TriggerNormalizeRequest,
    UtteranceAnalysisRequest,
)
from app.services import (
    context_builder,
    conversation_service,
    llm_gateway,
    module_classifier,
    output_filter,
    safety_classifier,
    session_summarizer,
    stage_tracker,
    trigger_normalizer,
    utterance_analyzer,
)
from scripts.seed_demo import DEMO_PROVIDER_EMAIL

# ----- 출력 헬퍼 (색상 / 인코딩) -----

_USE_COLOR = True
_JSON = False
_COLORS = {
    "red": "31", "green": "32", "yellow": "33", "blue": "34",
    "magenta": "35", "cyan": "36", "gray": "90", "bold": "1",
}


def c(s: str, *names: str) -> str:
    if not _USE_COLOR or not names:
        return s
    codes = ";".join(_COLORS[n] for n in names)
    return f"\033[{codes}m{s}\033[0m"


def q(s: str | None, n: int = 80) -> str:
    s = (s or "").replace("\n", " ").strip()
    return '"' + (s[:n] + "…" if len(s) > n else s) + '"'


def banner(num: str, name: str, model: str, desc: str = "") -> None:
    print()
    print(c(f"═══ {num} {name} ", "bold", "cyan") + c(f"[{model}]", "gray"))
    if desc:
        print(c(f"    {desc}", "gray"))


def dump_json(obj) -> None:
    if not _JSON:
        return
    data = obj.model_dump(mode="json") if hasattr(obj, "model_dump") else obj
    print(c(json.dumps(data, ensure_ascii=False, indent=2), "gray"))


def _timed(thunk):
    """thunk 를 실행하고 (결과, 경과ms, 예외) 를 돌려준다."""
    t0 = time.perf_counter()
    try:
        out = thunk()
        return out, int((time.perf_counter() - t0) * 1000), None
    except Exception as e:  # noqa: BLE001 — 관찰 도구: 모든 실패를 보고만 한다
        return None, int((time.perf_counter() - t0) * 1000), e


def _ok(db, label: str, ms: int, err: Exception | None) -> bool:
    """err 가 있으면 출력 + 세션 롤백 후 False, 아니면 True."""
    if err is not None:
        print(c(f"  [{label}] ERROR ({ms}ms): {type(err).__name__}: {err}", "red"))
        db.rollback()
        return False
    return True


def _grade_color(grade: str | None) -> str:
    return {"A": "red", "B": "yellow"}.get(grade or "", "green")


# ----- 공통: 환자 로드 / 잠금 해제 -----


def load_patient(db, patient_id: str | None) -> Patient:
    if patient_id:
        p = db.get(Patient, patient_id)
        if p is None:
            raise SystemExit(f"환자 {patient_id} 를 찾을 수 없습니다.")
        return p
    prov = db.query(Provider).filter_by(email=DEMO_PROVIDER_EMAIL).one_or_none()
    if prov is not None:
        p = (
            db.query(Patient)
            .filter_by(provider_id=prov.provider_id)
            .order_by(Patient.created_at.desc())
            .first()
        )
        if p is not None:
            return p
    p = db.query(Patient).order_by(Patient.created_at.desc()).first()
    if p is None:
        raise SystemExit(
            "시드된 환자가 없습니다. 먼저 `python -m scripts.seed_demo` 를 실행하세요."
        )
    return p


def _unlock(db, patient: Patient) -> None:
    if patient.llm_locked:
        patient.llm_locked = False
        patient.llm_locked_at = None
        patient.llm_lock_reason = None
        db.commit()


# ===== probe 모드 =====


def probe_safety(db, pid: str) -> None:
    banner("①", "safety_classifier", settings.llm_model_classifier,
           "위험 등급 A/B 판정 (규칙 + LLM 하이브리드)")
    cases = [
        ("무해", "요즘 그냥 좀 무기력하고 의욕이 없어요"),
        ("위기", "다 끝내고 싶어요. 죽고 싶어요"),
        ("재발", "어제 한 잔 했어요"),
        ("복약중단", "요즘 약을 안 먹고 있어요"),
    ]
    for label, text in cases:
        out, ms, err = _timed(lambda text=text: safety_classifier.classify(
            db, SafetyClassifyRequest(
                patient_id=pid, text=text, source="conversation_message",
                conversation_context="session", recent_dialogue=[],
            )))
        if not _ok(db, label, ms, err):
            continue
        print(f"  [{label}] {q(text)}  {c(f'({ms}ms)', 'gray')}")
        print(
            "     → grade=" + c(out.grade, _grade_color(out.grade))
            + f" event={out.event_type} conf={out.confidence}"
            + f" matched_by={out.matched_by} action={out.recommended_action}"
        )
        dump_json(out)


def probe_context(db, patient: Patient) -> None:
    banner("②", "context_builder (+③ module_classifier)", "-",
           "시스템 프롬프트 조립 / Phase 3 모듈 선택")
    pid = patient.patient_id
    for ctype, week, note in [
        ("session", 2, "Phase 2"),
        ("session", 5, "Phase 3 — 모듈 경로"),
        ("craving", None, "갈망 대화 모드"),
    ]:
        out, ms, err = _timed(lambda ctype=ctype, week=week: context_builder.build(
            db, ContextBuildRequest(patient_id=pid, context_type=ctype, week_number=week)))
        if not _ok(db, f"{ctype} w{week}", ms, err):
            continue
        blocks = out.context_blocks
        titles = [b.get("title") for b in blocks.get("prompt_blocks", [])]
        print(f"  [{ctype} w{week or '-'}] {note}  {c(f'({ms}ms)', 'gray')}")
        print(f"     phase={blocks.get('phase')} version={out.prompt_version}"
              f" system_prompt_chars={len(out.system_prompt)}")
        sm = blocks.get("selected_modules")
        if sm and sm.get("selected_modules"):
            print(c("     ③ module: ", "bold", "cyan")
                  + f"{sm.get('selected_modules')} conf={sm.get('confidence')}"
                  + f" — {q(sm.get('rationale'), 60)}")
        print(f"     blocks: {titles}")
        dump_json(out)


def probe_module(db, pid: str) -> None:
    banner("③", "module_classifier", settings.llm_model_classifier,
           "Phase 3 모듈 1~2개 선택 (기능분석 기반)")
    out, ms, err = _timed(lambda: module_classifier.classify(db, ModuleClassifyRequest(
        patient_id=pid, week_number=5,
        normalized_triggers=["work_stress", "social_pressure"],
        comorbidities=["depression", "insomnia"],
        recent_checkins=[], previous_modules=[],
    )))
    if not _ok(db, "module", ms, err):
        return
    print(f"  triggers=[work_stress, social_pressure] comorbid=[depression, insomnia]"
          f"  {c(f'({ms}ms)', 'gray')}")
    print(f"     → modules={out.selected_modules} conf={out.confidence}")
    print(f"       rationale: {q(out.rationale, 90)}")
    dump_json(out)


def probe_dialogue(db, pid: str) -> None:
    banner("④", "dialogue (orchestrator)", settings.llm_model_dialogue,
           "코치 응답 생성 (단발 호출로 점검)")
    out, ms, err = _timed(lambda: llm_gateway.invoke(db, LLMInvokeRequest(
        model=settings.llm_model_dialogue,
        messages=[{"role": "user", "content": "안녕하세요, 오늘 좀 힘들었어요."}],
        system="당신은 알코올 사용장애 회복을 돕는 따뜻한 CBT 코치입니다. 2~3문장으로 공감하며 답하세요.",
        max_tokens=256, temperature=0.7, stream=False,
        patient_id=pid, purpose="patient_dialogue", caller_component="orchestrator",
    )))
    if not _ok(db, "dialogue", ms, err):
        return
    print(f"  in: \"안녕하세요, 오늘 좀 힘들었어요.\"  {c(f'({ms}ms)', 'gray')}")
    print(f"     → {q(out.content, 120)}")
    print(f"       usage in/out={out.usage.input_tokens}/{out.usage.output_tokens}"
          f" stop={out.stop_reason}")


def probe_output(db, pid: str) -> None:
    banner("⑤", "output_filter", settings.llm_model_classifier,
           "출력 가드 (의료용어 / AVE / MI 위반)")
    cases = [
        ("정상", "잘 견디셨어요. 오늘 느낀 감정을 한 가지만 더 말씀해 주실래요?"),
        ("의료용어", "당신은 알코올 의존증 진단을 받았으니 날트렉손 50mg 을 복용하세요."),
    ]
    for label, text in cases:
        out, ms, err = _timed(lambda text=text: output_filter.check(
            db, OutputFilterRequest(text=text, conversation_context="session")))
        if not _ok(db, label, ms, err):
            continue
        print(f"  [{label}] {q(text)}  {c(f'({ms}ms)', 'gray')}")
        print(f"     → passed={out.passed} action={out.recommended_action}"
              f" violations={len(out.violations)}")
        for v in out.violations:
            print(c(f"       ⚠ {v.filter}/{v.severity}: ", "yellow")
                  + f"{q(v.matched_text, 30)} — {q(v.reasoning, 60)}")
        dump_json(out)


def probe_utterance(db, pid: str) -> None:
    banner("⑥", "utterance_analyzer", settings.llm_model_classifier,
           "감정 / 의도 / 인지왜곡 / 갈망 분석 (평가 전용)")
    text = "회식 끝나고 집에 오는데 너무 마시고 싶었어요. 참긴 했는데 내가 너무 한심하게 느껴져요."
    out, ms, err = _timed(lambda: utterance_analyzer.analyze(db, UtteranceAnalysisRequest(
        patient_id=pid, text=text, conversation_context="session", recent_dialogue=[],
    )))
    if not _ok(db, "utterance", ms, err):
        return
    print(f"  in: {q(text)}  {c(f'({ms}ms)', 'gray')}")
    print(f"     → emotion={out.primary_emotion} ({', '.join(out.emotions)})"
          f" intent={out.intent}")
    print(f"       craving={out.craving_intensity}/10 distortions={out.cognitive_distortions}"
          f" step={out.relevant_step}")
    print(f"       summary: {q(out.summary, 90)}")
    dump_json(out)


def probe_stage(db, pid: str) -> None:
    banner("⑦", "stage_tracker", settings.llm_model_tracking,
           "CBT 5단계 진행 / 이탈 추적")
    dialogue = [
        {"role": "assistant", "text": "지난 한 주 어떻게 지내셨어요?"},
        {"role": "user", "text": "그럭저럭 지냈어요. 과제도 했고요."},
        {"role": "assistant", "text": "좋아요, 과제 내용을 같이 살펴볼까요?"},
        {"role": "user", "text": "네, 음주 충동이 올 때 산책을 해봤어요."},
    ]
    out, ms, err = _timed(lambda: stage_tracker.track(db, StageTrackRequest(
        conversation_id="probe", session_id="probe", week_number=5,
        current_step=2, step_objectives=[], dialogue=dialogue,
    )))
    if not _ok(db, "stage", ms, err):
        return
    print(f"  in: current_step=2, 4-turn dialogue  {c(f'({ms}ms)', 'gray')}")
    print(f"     → current_step={out.current_step} ready={out.ready_to_advance}"
          f" completion={out.step_completion_estimate} drift={out.step_drift_risk}")
    print(f"       action={out.recommended_next_action} delivered={out.delivered_objectives}")
    dump_json(out)


def probe_summarizer(db, patient: Patient) -> None:
    banner("⑧", "session_summarizer", settings.llm_model_tracking,
           "세션 종료 요약 (영속화 FK 때문에 임시 세션 생성→정리)")
    # session_summaries.session_id 는 sessions FK + unique 이므로 유효한 임시 세션이 필요.
    sess = CbtSession(
        session_id=new_session_id(), patient_id=patient.patient_id,
        week_number=patient.current_week or 2, phase=patient.current_phase or 1,
        status="in_progress",
    )
    db.add(sess)
    db.commit()
    dialogue = [
        {"role": "assistant", "text": "이번 주 음주 충동은 어땠어요?"},
        {"role": "user", "text": "회식 때 힘들었는데 산책으로 넘겼어요. 약은 잘 먹었고요."},
        {"role": "assistant", "text": "잘 하셨어요. 다음 주 목표를 정해볼까요?"},
        {"role": "user", "text": "회식 자리를 미리 피하는 계획을 세워볼게요."},
    ]
    out, ms, err = _timed(lambda: session_summarizer.summarize(db, SessionSummarizeRequest(
        session_id=sess.session_id, patient_id=patient.patient_id,
        week_number=sess.week_number, full_dialogue=dialogue, session_objectives=[],
        previous_summary=None, patient_context={"current_week": patient.current_week},
    )))
    if _ok(db, "summary", ms, err):
        print(f"  in: 4-turn 세션 대화  {c(f'({ms}ms)', 'gray')}")
        print(f"     → tone={out.emotional_tone} model={out.model_used}"
              f" gen_ms={out.generation_time_ms}")
        print(f"       insights={out.patient_key_insights}")
        print(f"       triggers={[t.tag for t in out.identified_triggers]}"
              f" homework={q(out.assigned_homework, 50)}")
        print(f"       handoff: {q(out.next_session_handoff_notes, 80)}")
        dump_json(out)
    # 정리: 요약 행 + 임시 세션 삭제
    try:
        summ = db.query(SessionSummaryModel).filter_by(session_id=sess.session_id).one_or_none()
        if summ is not None:
            db.delete(summ)
        db.delete(sess)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


def probe_trigger(db, patient: Patient) -> None:
    banner("(+)", "trigger_normalizer", settings.llm_model_classifier,
           "자유 텍스트 트리거 → 통제 어휘 태그 (인테이크 전용, 대화엔 안 나옴)")
    dp = patient.discharge_profile
    raw = (dp.primary_triggers_raw if dp and getattr(dp, "primary_triggers_raw", None)
           else "회식 자리에서 동료들 권유, 야근 후 혼술")
    out, ms, err = _timed(lambda: trigger_normalizer.normalize(
        db, TriggerNormalizeRequest(raw_text=raw)))
    if not _ok(db, "trigger", ms, err):
        return
    print(f"  in: {q(raw)}  {c(f'({ms}ms)', 'gray')}")
    print(f"     → tags={out.normalized_tags} conf={out.confidence}")
    print(f"       reasoning: {q(out.reasoning, 80)}")
    dump_json(out)


def run_probe(db, patient: Patient) -> None:
    pid = patient.patient_id
    try:
        probe_safety(db, pid)
        probe_context(db, patient)
        probe_module(db, pid)
        probe_dialogue(db, pid)
        probe_output(db, pid)
        probe_utterance(db, pid)
        probe_stage(db, pid)
        probe_summarizer(db, patient)
        probe_trigger(db, patient)
    finally:
        _unlock(db, patient)
        print(c("\n[cleanup] 데모 환자 LLM 잠금 해제 완료.", "gray"))


# ===== chat 모드 =====

DEFAULT_SCENARIO = [
    # 정상 세션 턴: ① none ②③(주차 4+면 모듈) ④ ⑤ ⑥ ⑦
    "안녕하세요. 요즘 좀 무기력하고 의욕이 없네요.",
    "회식에서 다들 권했는데 너무 마시고 싶었어요. 그래도 콜라만 마시고 왔어요.",
    # 재발(grade B) → ① B + context_switched(session→resu)
    "어제 한 잔 했어요.",
    # 위기(grade A) → ① A + 잠금 + done(safety_locked)
    "다 끝내고 싶어요. 죽고 싶어요.",
]


async def _chat_turn(db, patient: Patient, conv, text: str):
    print(c("\n" + "─" * 72, "gray"))
    print(c("you> ", "bold", "green") + text)

    tokens: list[str] = []
    flushed = {"v": False}

    def flush_reply() -> None:
        if tokens and not flushed["v"]:
            print(c("④ dialogue ", "bold", "cyan") + c(f"[{settings.llm_model_dialogue}]", "gray"))
            print("    " + "".join(tokens).strip().replace("\n", "\n    "))
            flushed["v"] = True

    async for ev in conversation_service.stream_user_message(db, patient, conv, text):
        et = ev["event"]
        d = json.loads(ev["data"])
        if et == "safety_classified":
            g = d.get("grade")
            print(c("① safety: ", "bold", _grade_color(g))
                  + f"grade={g} event={d.get('event_type')}")
        elif et == "context_switched":
            print(c("   ↳ context_switched: ", "magenta")
                  + f"{d.get('from')} → {d.get('to')}")
        elif et == "context_used":
            print(c("② context: ", "bold", "cyan")
                  + f"type={d.get('context_type')} phase={d.get('phase')}"
                  + f" chars={d.get('system_prompt_chars')} v={d.get('prompt_version')}")
            print(f"    blocks: {[b.get('title') for b in d.get('prompt_blocks', [])]}")
            sm = d.get("selected_modules")
            if sm and sm.get("selected_modules"):
                print(c("③ module: ", "bold", "cyan")
                      + f"{sm.get('selected_modules')} conf={sm.get('confidence')}"
                      + f" — {q(sm.get('rationale'), 60)}")
        elif et == "token":
            tokens.append(d.get("text", ""))
        elif et == "output_filter":
            flush_reply()
            print(c("⑤ output_filter: ", "bold", "cyan")
                  + f"passed={d.get('passed')} action={d.get('recommended_action')}"
                  + f" fallback={d.get('replaced_with_fallback')}")
            for v in d.get("violations", []):
                print(c(f"    ⚠ {v.get('filter')}/{v.get('severity')}: ", "yellow")
                      + f"{q(v.get('matched_text'), 30)} — {q(v.get('reasoning'), 50)}")
        elif et == "utterance_analysis":
            flush_reply()
            a = d.get("analysis", {})
            s = d.get("safety", {})
            print(c("⑥ utterance: ", "bold", "cyan")
                  + f"emotion={a.get('primary_emotion')} intent={a.get('intent')}"
                  + f" craving={a.get('craving_intensity')}/10 step={a.get('relevant_step')}")
            if a.get("cognitive_distortions"):
                print(f"    인지왜곡: {a.get('cognitive_distortions')}")
            if a.get("summary"):
                print(f"    요약: {q(a.get('summary'), 80)}")
            print(c("① safety(detail): ", "gray")
                  + f"grade={s.get('grade')} event={s.get('event_type')}"
                  + f" conf={s.get('confidence')} matched_by={s.get('matched_by')}")
        elif et == "stage_progress":
            flush_reply()
            print(c("⑦ stage: ", "bold", "cyan")
                  + f"week {d.get('week_number')} phase {d.get('phase')}"
                  + f" step {d.get('current_step')}/{d.get('total_steps')}"
                  + f" ready={d.get('ready_to_advance')} completion={d.get('step_completion')}"
                  + f" drift={d.get('drift')} ready_to_complete={d.get('ready_to_complete')}")
        # ⑧ session_summary 는 더 이상 스트림 이벤트가 아니다(세션 요약은 종료 시 REST
        #    /end 경로에서 생성된다). 스트림에서는 나오지 않으므로 별도 분기를 두지 않는다.
        elif et == "session_ready":
            print(c(
                f"   ★ session_ready (마칠 준비, 자동 종료 아님) → week {d.get('week_number')}"
                f" step {d.get('current_step')}", "green"))
        elif et == "error":
            print(c(f"   ✖ error: {d.get('code')} {d.get('message')}", "red"))
        elif et == "done":
            flush_reply()
            print(c(f"done: finish_reason={d.get('finish_reason')}", "gray"))

    if conv.status != "active":
        print(c("[info] 세션이 종료되어 새 세션을 시작합니다.", "gray"))
        conv = conversation_service.start_session(db, patient)
    return conv


async def run_chat(db, patient: Patient, args) -> None:
    pid = patient.patient_id
    _unlock(db, patient)  # 이전 위기 데모 흔적 제거

    week_overridden = args.week is not None
    if week_overridden:
        patient.current_week = args.week
        patient.current_phase = conversation_service._phase_for_week(args.week)
        db.commit()

    conv = conversation_service.active_conversation(db, pid, "session")
    if conv is None or args.fresh or week_overridden:
        if conv is not None:
            conversation_service.end_conversation(db, conv, "ended")
        conv = conversation_service.start_session(db, patient)

    print(c(f"\n[chat] patient={pid} week={patient.current_week}"
            f" phase={patient.current_phase} conv={conv.conversation_id}", "gray"))

    messages = list(args.message) if args.message else (
        DEFAULT_SCENARIO if args.scenario == "default" else [])

    try:
        if messages:
            for text in messages:
                conv = await _chat_turn(db, patient, conv, text)
        else:
            print(c("대화를 입력하세요. 빈 줄 또는 'exit' 로 종료.", "gray"))
            while True:
                try:
                    text = input(c("\nyou> ", "bold", "green")).strip()
                except (EOFError, KeyboardInterrupt):
                    break
                if not text or text.lower() == "exit":
                    break
                conv = await _chat_turn(db, patient, conv, text)
    finally:
        _unlock(db, patient)
        print(c("\n[cleanup] 데모 환자 LLM 잠금 해제 완료.", "gray"))


# ===== main =====


def _print_banner() -> None:
    mode = llm_gateway.effective_mode()
    reason = mode.get("reason") or "real"
    print(c("LLM 오케스트레이션 서브 에이전트 라이브 관찰", "bold"))
    print(c(f"  mode={mode.get('mode')} ({reason})  trace={settings.llm_trace}", "gray"))
    print(c(f"  models: dialogue={settings.llm_model_dialogue}"
            f" tracking={settings.llm_model_tracking}"
            f" classifier={settings.llm_model_classifier}", "gray"))


def main() -> None:
    global _USE_COLOR, _JSON
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # 한국어 Windows 콘솔(cp949) 인코딩 오류 방지
    except Exception:  # noqa: BLE001
        pass

    parser = argparse.ArgumentParser(
        prog="trace_agents",
        description="LLM 오케스트레이션 8개 서브 에이전트 라이브 관찰 도구",
    )
    parser.add_argument("--patient-id", default=None, help="대상 환자 ID (기본: 데모 환자)")
    parser.add_argument("--no-color", action="store_true", help="색상 끄기")
    parser.add_argument("--json", action="store_true", help="각 결과의 전체 model_dump 출력")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("probe", help="8개 에이전트를 개별 입력으로 한 번에 점검")

    chat = sub.add_parser("chat", help="실제 세션 대화를 흘려보내며 매 턴 관찰")
    chat.add_argument("--week", type=int, default=None,
                      help="환자 주차를 임시 설정 (4~11 이면 Phase 3 모듈 관찰)")
    chat.add_argument("--scenario", choices=["default", "none"], default="default",
                      help="내장 시나리오(default) 또는 직접 입력(none)")
    chat.add_argument("-m", "--message", action="append", default=[],
                      help="보낼 메시지 (반복 지정 가능). 지정 시 시나리오 무시")
    chat.add_argument("--fresh", action="store_true", help="기존 active 세션 무시하고 새 세션 시작")

    args = parser.parse_args()
    _USE_COLOR = (not args.no_color) and sys.stdout.isatty() and os.environ.get("NO_COLOR") is None
    _JSON = args.json

    settings.llm_trace = True  # 라이브 관찰을 위해 이 실행 동안 강제 on
    _print_banner()

    db = SessionLocal()
    try:
        patient = load_patient(db, args.patient_id)
        if args.command == "probe":
            run_probe(db, patient)
        elif args.command == "chat":
            asyncio.run(run_chat(db, patient, args))
    finally:
        db.close()


if __name__ == "__main__":
    main()
