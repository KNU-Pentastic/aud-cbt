"""Conversation orchestrator — produces SSE events for /me/conversations/{id}/messages.

Event protocol (matches openapi.yaml + API doc §5.3):
  start              { message_id, conversation_id }
  token              { text }
  safety_classified  { grade, event_type }
  context_switched   { from, to }
  session_ready      { week_number, current_step }   # LLM 이 이번 주 내용을 끝까지
                     # 진행해 '마칠 준비'가 됐다는 신호(자동 종료 아님 — 사용자가
                     # 종료 버튼으로 마침). 항상 전송(LLM_TRACE 와 무관).
  done               { message_id, finish_reason }
  error              { code, message }

Trace events (LLM_TRACE=on 일 때만 — 정량 평가/라이브 관찰용; 운영 빌드에선 끈다):
  context_used       { context_type, phase, week_number, prompt_version,
                       prompt_blocks[], selected_modules, system_prompt_chars,
                       system_prompt }                       # ② context_builder / ③ module
  output_filter      { passed, recommended_action, violations[],
                       replaced_with_fallback }              # ⑤ output_filter
  utterance_analysis { text, analysis{...}, safety{...} }    # ⑥ utterance (+ ① safety)
  stage_progress     { week_number, phase, current_step, step_name, ready_to_advance,
                       step_completion, ready_to_complete }  # ⑦ stage

⑧ session_summarizer 는 더 이상 SSE 이벤트로 노출하지 않는다. 세션 요약은 사용자가
종료 버튼으로 /me/conversations/{id}/end (reason=completed) 를 호출할 때 end_conversation
안에서 생성·저장되며(스트림이 아닌 REST 경로), 의료진 대시보드에서 조회한다.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import cbt_stages
from app.config import settings
from app.database import SessionLocal
from app.exceptions import APIError
from app.ids import conversation_id as new_conv_id
from app.ids import message_id as new_message_id
from app.ids import session_id as new_session_id
from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.session import Session as CbtSession
from app.models.session_summary import SessionSummary as SessionSummaryModel
from app.schemas.internal import (
    ContextBuildRequest,
    DialogueTurn,
    LLMInvokeRequest,
    OutputFilterRequest,
    SafetyClassifyRequest,
    SessionSummary,
    SessionSummarizeRequest,
    StageTrackRequest,
    UtteranceAnalysisRequest,
)
from app.services import (
    context_builder,
    llm_gateway,
    output_filter,
    safety_classifier,
    session_summarizer,
    stage_tracker,
    utterance_analyzer,
)

log = logging.getLogger(__name__)


# -------- DB helpers --------


def active_conversation(
    db: Session, patient_id: str, context: str | None = None
) -> Conversation | None:
    """가장 최근 active 대화. context 지정 시 해당 종류만 조회한다.

    context 를 구분하지 않으면 갈망(craving) 대화가 메인 세션을 가려, 세션 진입 시
    엉뚱한 대화가 로드되어 이전 세션 대화가 사라지는 것처럼 보인다(BUG C). 그래서
    세션/갈망을 각각 독립적으로 조회할 수 있게 한다.
    """
    stmt = select(Conversation).where(
        Conversation.patient_id == patient_id, Conversation.status == "active"
    )
    if context is not None:
        stmt = stmt.where(Conversation.context == context)
    return (
        db.execute(stmt.order_by(Conversation.started_at.desc()).limit(1)).scalars().first()
    )


def start_session(db: Session, patient: Patient) -> Conversation:
    sess = CbtSession(
        session_id=new_session_id(),
        patient_id=patient.patient_id,
        week_number=patient.current_week,
        phase=patient.current_phase,
        status="in_progress",
    )
    # conversations.session_id FK가 sessions를 참조하므로, sessions 행을 먼저
    # flush해 같은 트랜잭션 안에 만들어둔 뒤 conversation을 추가한다.
    # (둘 사이에 ORM relationship이 없어 add_all 순서로는 INSERT 순서가 보장되지 않음)
    db.add(sess)
    db.flush()
    conv = Conversation(
        conversation_id=new_conv_id(),
        patient_id=patient.patient_id,
        context="session",
        session_id=sess.session_id,
        week_number=patient.current_week,
        status="active",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def start_craving(db: Session, patient: Patient) -> Conversation:
    conv = Conversation(
        conversation_id=new_conv_id(),
        patient_id=patient.patient_id,
        context="craving",
        status="active",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def end_conversation(
    db: Session, conv: Conversation, reason: str
) -> tuple[datetime, datetime | None, bool]:
    """대화·세션을 종료로 확정한다. 종료 시점·완료 여부는 LLM 이 아니라 사용자가 정한다.

    핵심 규칙: 사용자가 '세션 마치기'(reason='completed')로 끝내면, 단계 추적기가 몇 단계로
    봤는지와 '무관하게' 이 세션을 완료로 보고 곧바로 다음 주차로 진행한다. 종료 시점은
    사용자가 정하므로(대화를 마무리했다고 보고 직접 버튼을 누름), 진행을 추적기 단계에
    묶지 않는다 — 추적기는 라운드당 +1 만 오르고 실모델에선 보수적이라 5단계에 잘 못 닿아,
    묶으면 '끝냈는데 다음 주차로 안 넘어가는' 함정이 된다(직전 버그의 직접 원인).

    두 단계로 커밋한다:
      PHASE 1 — conv/sess 를 'ended' 로 즉시 커밋(항상 durable). 이후가 잘려도 세션이
        active 로 되살아나지 않는다(배포 프록시 컷·프로세스 종료 안전성).
      PHASE 2 — reason='completed' 면 sess 를 'completed' 로 올리고 다음 주차로 진행한 뒤
        커밋한다(_advance_week). 종료 직후 재진입이 결정론적으로 진행된 주차에 들어가도록
        응답 전에 동기로 끝낸다. (사소한 실패는 잡고 넘어가 PHASE 1 종료는 유지한다.)

    항상 느린 '세션 요약'만 응답 뒤 백그라운드에서 만든다(generate_session_summary) —
    요약은 다음 세션 참고용 보조 자료라 다음 세션 선택을 게이팅하지 않는다. 반환의
    3번째(completed)로 라우터가 요약 스케줄을 결정한다.
    """
    now = datetime.now(timezone.utc)
    next_available_at: datetime | None = None
    sess = db.get(CbtSession, conv.session_id) if conv.session_id else None

    # PHASE 1 — 종료 즉시 확정·커밋(durable).
    conv.status = "ended"
    conv.ended_at = now
    conv.end_reason = reason
    if sess is not None:
        sess.status = "ended"
        sess.ended_at = now
        sess.end_reason = reason
    db.commit()

    # PHASE 2 — 사용자 종료(reason='completed')면 완료로 보고 다음 주차 진행(추적기 단계와 무관).
    completed = False
    if reason == "completed" and sess is not None:
        try:
            sess.status = "completed"
            _advance_week(db, conv, sess)
            db.commit()
            completed = True
        except Exception:
            log.exception("week advance failed for %s", conv.conversation_id)
            db.rollback()  # PHASE 1 의 종료 커밋은 유지(여기 변경분만 되돌림)
    return now, next_available_at, completed


def generate_session_summary(conversation_id: str, db: Session | None = None) -> None:
    """완료된 세션의 요약을 생성·저장한다 — 응답 뒤 FastAPI BackgroundTasks 로 실행한다.

    요약은 항상 느린(약 2500토큰 Sonnet) 작업이지만 다음 세션 선택을 게이팅하지 않으므로,
    종료·주차 진행이 동기로 끝난 뒤 비동기로 만든다. 자체 DB 세션을 연다(기본값) — 응답이
    나간 뒤 실행되어 요청 세션이 이미 닫혀 있기 때문. 테스트에선 db 를 주입해 동기 실행한다.

    멱등: session_summaries.session_id 는 UNIQUE 제약이라, 재시도/중복 스케줄로 두 번
    불려도 이미 요약이 있으면 그냥 반환한다(IntegrityError 방지). 실패해도 세션의
    완료·주차 진행은 이미 커밋돼 있어 영향 없다(요약은 보조 자료).
    """
    owns_db = db is None
    if db is None:
        db = SessionLocal()
    try:
        conv = db.get(Conversation, conversation_id)
        if conv is None or not conv.session_id:
            return
        sess = db.get(CbtSession, conv.session_id)
        if sess is None or sess.status != "completed":
            return  # 완료된 세션만 요약한다
        exists = db.execute(
            select(SessionSummaryModel.session_summary_id)
            .where(SessionSummaryModel.session_id == sess.session_id)
            .limit(1)
        ).first()
        if exists is not None:
            return  # 이미 요약이 있다(멱등)
        patient = db.get(Patient, conv.patient_id)
        if patient is None:
            return
        try:
            _summarize_session(db, patient, conv, sess)
        except Exception:
            log.exception("session summarize failed for %s", conversation_id)
            db.rollback()
    finally:
        if owns_db:
            db.close()


# -------- SSE helpers --------


def _sse(event: str, data: dict) -> dict:
    """sse_starlette 가 인코딩할 SSE 이벤트를 dict 로 돌려준다.

    주의: 직접 포맷한 문자열("event: x\\ndata: {...}\\n\\n")을 yield 하면
    sse_starlette 가 그 문자열 '전체'를 다시 data 필드로 감싸
    `data: event: x` / `data: data: {...}` 처럼 한 번 더 래핑한다. 그 결과
    클라이언트는 event 라인이 없고 data 가 JSON 이 아닌 프레임을 받아 파싱에
    실패하고, 토큰이 화면에 실시간으로 표시되지 않는다(대화방을 나갔다 들어와야
    DB 에서 다시 불러와 보임). {event, data} dict 를 yield 하면 sse_starlette 가
    올바른 SSE 프레임을 생성한다.
    """
    return {"event": event, "data": json.dumps(data, ensure_ascii=False)}


def _stream_error_payload(exc: Exception) -> dict:
    """스트림 도중 발생한 예외를 SSE error 이벤트 payload 로 변환한다.

    llm_gateway 가 던진 APIError(쿼터 초과 LLM_TOKEN_QUOTA_EXCEEDED, 업스트림 장애
    LLM_UPSTREAM_UNAVAILABLE 등)는 구체 코드/메시지를 그대로 보존해, 프런트가
    '오늘 사용량 소진' 같은 정확한 안내를 띄울 수 있게 한다. 그 외 예외는 일반
    LLM_STREAM_FAILED 로 묶는다(내부 상세 비노출).
    """
    if isinstance(exc, APIError) and isinstance(exc.detail, dict):
        return {
            "code": exc.detail.get("code", "LLM_STREAM_FAILED"),
            "message": exc.detail.get("message", "internal error"),
        }
    return {"code": "LLM_STREAM_FAILED", "message": str(exc)[:200]}


def _recent_turns(
    db: Session,
    conversation_id: str,
    limit: int = 6,
    exclude_safety: bool = False,
) -> list[DialogueTurn]:
    """최근 대화 턴을 시간순으로 돌려준다.

    exclude_safety=True 면 안전 위기(grade A)로 표시된(safety_excluded) 발화를 빼고
    돌려준다. 의료진이 잠금을 푼 뒤 환자가 같은 대화를 이어갈 때, 위기 발화 한 줄만
    LLM 맥락(분류기·코치·단계추적)에서 도려내기 위함이다. 이렇게 하면:
      (a) 분류기가 옛 위기 발화를 '누적 맥락'으로 다시 보고 재잠금하지 않고,
      (b) 코치 답변이 그 위기('죽고 싶다')에 고착되지 않으며,
      (c) 위기 외의 정상 대화는 원문 그대로 남아 진료 후에도 맥락이 끊기지 않는다.
    기본값(False)은 전체를 돌려준다 — 세션 종료 요약은 위기를 임상 기록으로 남겨야
    하므로 제외하지 않는다.
    """
    stmt = select(Message).where(Message.conversation_id == conversation_id)
    if exclude_safety:
        stmt = stmt.where(Message.safety_excluded.is_(False))
    rows = (
        db.execute(stmt.order_by(Message.created_at.desc()).limit(limit))
        .scalars()
        .all()
    )
    rows.reverse()
    return [DialogueTurn(role=m.role, text=m.text) for m in rows]  # type: ignore[arg-type]


_FALLBACK_REPLY = (
    "잠깐 호흡을 가다듬어 볼까요. 지금 떠오르는 생각을 한 줄만 적어주시면, "
    "그것부터 천천히 함께 살펴볼게요."
)

# 코치가 먼저 거는 세션 오프닝이 비거나(빈 응답) 출력 가드에 걸렸을 때의 폴백.
# 예전 클라이언트 정적 환영 문구와 결이 같되, '다시 만나서'로 2회차 이후 맥락에 맞춘다.
_OPENING_FALLBACK = (
    "안녕하세요. 다시 만나서 반가워요. 지난 한 주는 어떻게 지내셨는지 궁금해요. "
    "편하게 떠오르는 대로 이야기 나눠 볼까요?"
)

# 세션 오프닝 전용 시스템 프롬프트 지시. 환자 발화가 아직 없으므로(코치가 첫 턴)
# 직전 세션 요약·최근 체크인을 안부로 연결해 1단계(체크인 리뷰)를 부드럽게 연다.
_OPENING_DIRECTIVE = (
    "[세션 시작 — 코치가 먼저 말 걸기]\n"
    "지금 이번 주간 세션이 막 시작되었고, 환자는 아직 아무 말도 하지 않았습니다. "
    "당신(코치)이 먼저 환자에게 말을 거세요. [직전 세션 요약]과 [최근 7일 체크인]이 "
    "있다면 그 내용을 자연스럽게 안부로 연결하고(예: 지난주에 함께 정한 과제나 그때 "
    "나눈 이야기), 1단계(체크인 리뷰)를 부드럽게 시작하세요. 환자 이름이 있으면 한 번 "
    "정도 따뜻하게 불러 주세요. 전체 2~4문장으로 짧게, 대답하기 쉬운 질문 하나로 "
    "끝맺으세요. 메타 발화나 시스템 언급 없이, 환자에게 직접 건네는 말투로만 쓰세요."
)


def _phase_for_week(week: int) -> int:
    """12주 → CBI Phase 결정 매핑 (context_builder 와 동일 규칙)."""
    if week <= 1:
        return 1
    if week <= 3:
        return 2
    if week <= 11:
        return 3
    return 4


def _summarize_session(
    db: Session, patient: Patient, conv: Conversation, sess: CbtSession
) -> SessionSummary | None:
    """세션 종료 시 요약 생성·저장 (실패해도 종료/주차 진행을 막지 않는다).

    generate_session_summary(완료된 세션, 백그라운드) 에서 호출된다. 생성된 SessionSummary 는
    DB 에 저장돼 다음 세션과 의료진 대시보드가 참고하며, 반환 DTO 는 현재 호출부에서
    쓰지 않는다(예전엔 자동 종료 스트림에서 session_summary 이벤트로 라이브 노출했으나
    종료가 REST 경로로 바뀌며 그 용도는 사라졌다). 예외는 호출부에서 잡는다.
    """
    turns = _recent_turns(db, conv.conversation_id, limit=200)
    full = [{"role": t.role, "text": t.text} for t in turns]
    prev = context_builder._previous_summary_block(db, patient.patient_id)
    return session_summarizer.summarize(
        db,
        SessionSummarizeRequest(
            session_id=sess.session_id,
            patient_id=patient.patient_id,
            week_number=conv.week_number or patient.current_week,
            full_dialogue=full,
            session_objectives=[],
            previous_summary=prev,
            patient_context={"current_week": patient.current_week},
        ),
    )


def _advance_week(db: Session, conv: Conversation, sess: CbtSession) -> None:
    """세션을 '완료'로 마칠 때 다음 주차로 진행한다(요약은 별도 백그라운드에서 생성).

    완료/주차 진행은 '사용자가 다음에 들어갈 세션'을 결정하므로 종료 응답 전에 동기로
    끝내야 한다(end_conversation 이 호출). 12주가 끝이면 더 진행하지 않는다.
    호출부가 트랜잭션을 commit 한다.
    """
    patient = db.get(Patient, conv.patient_id)
    if patient is None:
        return
    if patient.current_week < 12:
        patient.current_week += 1
        patient.current_phase = _phase_for_week(patient.current_week)


def _advance_session_stage(
    db: Session, patient: Patient, conv: Conversation
) -> dict | None:
    """세션 대화의 5단계 진행을 stage_tracker 로 갱신하고 진행도 dict 를 돌려준다.

    예전엔 LLM 이 5단계 완료를 판단하면 여기서 곧장 대화를 종료하고 다음 주차로
    넘겼다(자동 종료). 그러나 대화가 끝나지 않았는데도 조기 종료되는 일이 잦아,
    이제는 종료를 사용자가 결정한다 — 여기서는 자동 종료하지 않고 '마칠 준비가
    됐는지(ready_to_complete)'만 계산해 돌려준다. 실제 종료·요약·주차 진행은
    사용자가 종료 버튼을 눌러 /end(reason=completed) 를 호출할 때 일어난다.
    반환 dict 는 stage_progress SSE 이벤트로 노출되어 '지금 몇 주차·몇 단계인지'를
    표시한다. 세션 대화가 아니거나 진행 가능한 세션이 없으면 None.
    """
    if not conv.session_id:
        return None
    sess = db.get(CbtSession, conv.session_id)
    if sess is None or sess.status != "in_progress":
        return None

    # 단계 진행 판단에서도 위기 발화는 뺀다(exclude_safety). 위기 발화가 단계 판단 맥락에
    # 섞여 진행 추정을 왜곡하는 것을 막는다. 위기 외 정상 대화는 그대로 보므로 진행 맥락이
    # 끊기지 않고, current_step 은 sess 에 보존돼(단조 비감소) 단계가 되돌아가지 않는다.
    dialogue = [
        {"role": t.role, "text": t.text}
        for t in _recent_turns(db, conv.conversation_id, limit=40, exclude_safety=True)
    ]
    prev_step = sess.current_step
    resp = stage_tracker.track(
        db,
        StageTrackRequest(
            conversation_id=conv.conversation_id,
            session_id=sess.session_id,
            week_number=conv.week_number or patient.current_week,
            current_step=sess.current_step,
            step_objectives=[],
            dialogue=dialogue,
        ),
    )
    week = conv.week_number or patient.current_week
    # stage_tracker 가 대화를 보고 판단한 '지금까지 도달한 절대 단계'. 추적기 안에서 이미
    # floor(기록된 단계 미만으로 안 내려감) 처리하지만, 영속 경계에서도 한 번 더 max 로
    # 단조 비감소를 강제한다(추적기를 교체/우회해도 단계가 되돌아가지 않게). 이전엔 라운드당
    # +1 로만 올라 진행도가 대화를 못 따라가고 초반 단계에 멈췄다 — 이제 도달 단계를 그대로 반영한다.
    sess.current_step = max(prev_step, resp.current_step)
    db.commit()

    # '마칠 준비' = 직전 라운드에 이미 5단계였고, 이번 평가에서 마칠 준비가 됐다고
    # (ready_to_advance) 판단된 경우. prev_step>=5 를 요구해, 모델이 한 라운드에 3→5 로
    # 점프하며 동시에 완료 신호를 줄 때 4·5단계를 충분히 거치지 않고 곧장 '완료'로 보이는
    # 것을 막는다(조기 신호 방지). 자동 종료는 하지 않고, 이 신호로 클라이언트가 '마무리해도
    # 좋아요' 힌트와 종료 버튼을 부각해 사용자가 직접 마치도록 안내한다.
    ready_to_complete = prev_step >= cbt_stages.TOTAL_STEPS and resp.ready_to_advance

    return {
        "week_number": week,
        "total_weeks": 12,
        "phase": _phase_for_week(week),
        "current_step": sess.current_step,
        # 단계 이름은 cbt_stages 단일 출처에서 실어 보내, 화면 라벨이 백엔드 정의와 어긋나지 않게 한다.
        "step_name": cbt_stages.step_name(sess.current_step),
        "total_steps": cbt_stages.TOTAL_STEPS,
        "ready_to_advance": resp.ready_to_advance,
        "step_completion": round(resp.step_completion_estimate, 2),
        # LLM 이 이번 주 내용을 끝까지 진행해 '마칠 준비'가 됐는지(자동 종료 아님).
        "ready_to_complete": ready_to_complete,
    }


# -------- Orchestrated stream --------


async def stream_user_message(
    db: Session,
    patient: Patient,
    conv: Conversation,
    user_text: str,
) -> AsyncGenerator[dict, None]:
    # 1) Persist user turn
    user_msg = Message(
        message_id=new_message_id(),
        conversation_id=conv.conversation_id,
        role="user",
        text=user_text,
    )
    db.add(user_msg)
    db.commit()

    # 2) Safety classify
    #    맥락(recent_dialogue)에서 위기로 표시된 옛 발화는 뺀다(exclude_safety). 의료진이
    #    잠금을 푼 뒤 같은 대화를 이어가도, 분류기가 그 위기 발화를 '누적 맥락'으로 다시
    #    보고 무해한 새 발화를 grade A 로 재잠금하지 않게 한다. 방금 저장한 현재 발화는
    #    아직 표시 전이라 그대로 분류되며(위기면 아래에서 표시), 위기 외 정상 대화는
    #    원문 그대로 남아 맥락이 끊기지 않는다.
    classify_req = SafetyClassifyRequest(
        patient_id=patient.patient_id,
        text=user_text,
        source="conversation_message",
        conversation_context=conv.context,  # type: ignore[arg-type]
        recent_dialogue=_recent_turns(db, conv.conversation_id, exclude_safety=True),
    )
    classification = safety_classifier.classify(db, classify_req)

    if classification.grade == "A":
        # 이 발화가 위기다 — 표시해 둔다. 이후 같은 대화의 LLM 맥락(분류기·코치·단계추적)
        # 에서 이 한 줄만 도려내, 잠금 해제 후 재잠금/고착 없이 정상 대화를 이어가게 한다.
        # (화면·세션 종료 요약에는 그대로 남아 임상 기록은 보존된다.)
        user_msg.safety_excluded = True
        db.commit()
        yield _sse(
            "safety_classified",
            {"grade": "A", "event_type": classification.event_type},
        )
        yield _sse("done", {"finish_reason": "safety_locked"})
        return

    # 3) Possibly switch context (grade B)
    if classification.grade == "B" and classification.recommended_action in (
        "switch_resu",
        "switch_soma",
    ):
        new_ctx = "resu" if classification.recommended_action == "switch_resu" else "soma"
        if conv.context != new_ctx:
            old_ctx = conv.context
            conv.context = new_ctx
            db.commit()
            yield _sse(
                "safety_classified",
                {"grade": "B", "event_type": classification.event_type},
            )
            yield _sse("context_switched", {"from": old_ctx, "to": new_ctx})
    elif classification.grade == "B":
        yield _sse(
            "safety_classified",
            {"grade": "B", "event_type": classification.event_type},
        )

    # 4) Build context
    #    세션 대화면 현재 단계(sess.current_step)를 코치 프롬프트에 주입해, 코치가 그 단계를
    #    실제로 진행하도록 한다(단계를 모른 채 초반에 과제·마무리로 건너뛰는 것을 막는다).
    cur_step: int | None = None
    if conv.context == "session" and conv.session_id:
        _sess = db.get(CbtSession, conv.session_id)
        cur_step = _sess.current_step if _sess else None
    try:
        ctx = context_builder.build(
            db,
            ContextBuildRequest(
                patient_id=patient.patient_id,
                context_type=conv.context,  # type: ignore[arg-type]
                week_number=conv.week_number,
                current_step=cur_step,
            ),
        )
    except Exception:
        log.exception("context_build failed")
        yield _sse("error", {"code": "CONTEXT_BUILD_FAILED", "message": "internal error"})
        yield _sse("done", {"finish_reason": "error"})
        return

    # 4b) prompt-trace: 이 답변에서 LLM 이 정확히 어떤 가이드라인을 참고했는지 노출한다.
    #     블록 식별자·제목·본문 + 조립된 전체 시스템 프롬프트(환자 컨텍스트 포함).
    #     정량 평가용(LLM_TRACE=on) — 운영 배포 빌드에서는 LLM_TRACE=false 로 끈다.
    if settings.llm_trace:
        cb = ctx.context_blocks
        yield _sse(
            "context_used",
            {
                "context_type": conv.context,
                "phase": cb.get("phase"),
                "week_number": cb.get("week_number") or conv.week_number,
                "prompt_version": ctx.prompt_version,
                "prompt_blocks": cb.get("prompt_blocks", []),
                "selected_modules": cb.get("selected_modules"),
                # 이 세션이 직전 세션 대화를 어떻게 참고하는지 표출(#5): context_builder 가
                # 이미 만들어 둔 직전 세션 요약 블록을 트레이스에 실어 보낸다. 세션 외
                # 컨텍스트(craving/resu/soma)에선 키가 없어 null 로 전달된다.
                "previous_session_summary": cb.get("previous_session_summary"),
                "system_prompt_chars": len(ctx.system_prompt),
                "system_prompt": ctx.system_prompt,
            },
        )

    # 5) Compose messages from recent dialogue + new user turn
    #    exclude_safety=True: 위기로 표시된 발화만 빼고 코치에게 전달한다. 위기 외 정상
    #    대화는 원문 그대로 남아 진료 후에도 맥락이 끊기지 않고, 코치 답변이 옛 위기에
    #    고착되지 않는다.
    history = _recent_turns(db, conv.conversation_id, limit=20, exclude_safety=True)
    messages = [{"role": h.role, "content": h.text} for h in history]

    assistant_msg_id = new_message_id()
    yield _sse(
        "start",
        {"message_id": assistant_msg_id, "conversation_id": conv.conversation_id},
    )

    # 6) Stream from LLM gateway
    buffered: list[str] = []
    try:
        async for token in llm_gateway.stream(
            db,
            LLMInvokeRequest(
                model=settings.llm_model_dialogue,
                messages=messages,
                system=ctx.system_prompt,
                max_tokens=1024,
                temperature=0.7,
                stream=True,
                patient_id=patient.patient_id,
                purpose="patient_dialogue",
                caller_component="orchestrator",
            ),
        ):
            buffered.append(token)
            yield _sse("token", {"text": token})
    except Exception as exc:
        log.exception("LLM stream failed")
        yield _sse("error", _stream_error_payload(exc))
        yield _sse("done", {"finish_reason": "error"})
        return

    full = "".join(buffered).strip() or _FALLBACK_REPLY

    # 7) Output filter — on hard fail, replace with safe fallback message
    try:
        verdict = output_filter.check(
            db,
            OutputFilterRequest(text=full, conversation_context=conv.context),  # type: ignore[arg-type]
        )
        replaced = not verdict.passed and verdict.recommended_action == "fallback"
        if replaced:
            full = _FALLBACK_REPLY
        # 출력 가드(⑤ output_filter): 통과 여부·위반 항목·폴백 대체 여부를 트레이스로 노출.
        if settings.llm_trace:
            yield _sse(
                "output_filter",
                {
                    "passed": verdict.passed,
                    "recommended_action": verdict.recommended_action,
                    "violations": [v.model_dump() for v in verdict.violations],
                    "replaced_with_fallback": replaced,
                },
            )
    except Exception:
        log.exception("output_filter failed")

    # 8) Persist assistant turn
    db.add(
        Message(
            message_id=assistant_msg_id,
            conversation_id=conv.conversation_id,
            role="assistant",
            text=full,
        )
    )
    patient.last_active_at = datetime.now(timezone.utc)
    db.commit()

    # 8b) 발화 분석(정량 평가용): 방금 환자 발화를 감정·의도·인지왜곡·갈망강도·관련
    #     CBT 단계로 구조화 분석하고, 이미 step 2 에서 돌린 안전 분류 결과와 함께 노출한다.
    #     답변 스트림 이후에 실행해 첫 토큰 지연을 막는다. LLM_TRACE=on 일 때만.
    if settings.llm_trace:
        try:
            analysis = utterance_analyzer.analyze(
                db,
                UtteranceAnalysisRequest(
                    patient_id=patient.patient_id,
                    text=user_text,
                    conversation_context=conv.context,  # type: ignore[arg-type]
                    recent_dialogue=history[:-1],  # 직전 맥락(현재 발화 제외)
                ),
            )
            yield _sse(
                "utterance_analysis",
                {
                    "text": user_text[:500],
                    "analysis": analysis.model_dump(),
                    "safety": {
                        "grade": classification.grade,
                        "event_type": classification.event_type,
                        "confidence": classification.confidence,
                        "matched_by": classification.matched_by,
                        "recommended_action": classification.recommended_action,
                    },
                },
            )
        except Exception:
            log.exception("utterance analysis failed")

    # 9) 세션 대화면 5단계 진행을 추적한다 — 더 이상 자동 종료하지 않는다(사용자가
    #    종료 버튼으로 마친다). 진행도(stage_progress)를 라이브 응답에 실어, 지금 몇
    #    주차·몇 단계인지 노출한다.
    progress: dict | None = None
    if conv.context == "session":
        try:
            progress = _advance_session_stage(db, patient, conv)
        except Exception:
            log.exception("stage tracking failed")

    if progress is not None and settings.llm_trace:
        yield _sse("stage_progress", progress)

    # 세션을 끝까지 진행해 '마칠 준비'가 됐으면 신호만 보낸다(자동 종료 아님). 이
    # 이벤트는 LLM_TRACE 와 무관하게 항상 보낸다 — 운영 빌드에서도 사용자에게 '이제
    # 마무리해도 좋아요'를 알려, 더 묻고 싶은 게 있으면 계속 대화하고 없으면 직접
    # 종료 버튼으로 마치도록 안내해야 하기 때문이다.
    if progress is not None and progress["ready_to_complete"]:
        yield _sse(
            "session_ready",
            {
                "week_number": progress["week_number"],
                "current_step": progress["current_step"],
            },
        )

    yield _sse("done", {"message_id": assistant_msg_id, "finish_reason": "stop"})


async def stream_session_opening(
    db: Session,
    patient: Patient,
    conv: Conversation,
) -> AsyncGenerator[dict, None]:
    """세션 대화에서 '코치가 먼저 거는 오프닝'을 생성·스트리밍한다.

    예전엔 환자가 첫 메시지를 보내야 LLM 이 응답했고, 그 전엔 클라이언트가 정적 환영
    문구를 보여줬다. 이제 (세션1을 제외한) 주간 세션에서는 코치가 먼저 말을 건다 —
    직전 세션 요약·최근 체크인을 참고해 개인화된 인사로 1단계(체크인 리뷰)를 연다.
    '세션1만 정적 인사'라는 규칙은 클라이언트가 정하고(week>=2 일 때만 이 엔드포인트를
    호출), 서버는 호출되면 오프닝을 만든다.

    환자 발화가 없으므로 안전 분류·발화 분석·단계 추적은 하지 않는다(단계는 1단계 그대로).
    멱등성: 이미 메시지가 있는 대화에서 호출되면(재진입·중복) 새 턴을 만들지 않는다.
    """
    # 멱등성: 이미 턴이 있으면 오프닝을 또 만들지 않는다(중복 인사 방지).
    has_message = db.execute(
        select(Message.message_id)
        .where(Message.conversation_id == conv.conversation_id)
        .limit(1)
    ).first()
    if has_message is not None:
        yield _sse("done", {"finish_reason": "already_opened"})
        return

    # 세션 대화에서만 코치가 먼저 연다(갈망 등은 정적 인사 유지).
    if conv.context != "session" or not conv.session_id:
        yield _sse("done", {"finish_reason": "not_session"})
        return

    sess = db.get(CbtSession, conv.session_id)
    cur_step = sess.current_step if sess else 1

    try:
        ctx = context_builder.build(
            db,
            ContextBuildRequest(
                patient_id=patient.patient_id,
                context_type="session",
                week_number=conv.week_number,
                current_step=cur_step,
            ),
        )
    except Exception:
        log.exception("opening context_build failed")
        yield _sse("error", {"code": "CONTEXT_BUILD_FAILED", "message": "internal error"})
        yield _sse("done", {"finish_reason": "error"})
        return

    # 오프닝이 참고한 프롬프트도 일반 답변과 동일하게 트레이스로 노출(LLM_TRACE=on).
    if settings.llm_trace:
        cb = ctx.context_blocks
        yield _sse(
            "context_used",
            {
                "context_type": conv.context,
                "phase": cb.get("phase"),
                "week_number": cb.get("week_number") or conv.week_number,
                "prompt_version": ctx.prompt_version,
                "prompt_blocks": cb.get("prompt_blocks", []),
                "selected_modules": cb.get("selected_modules"),
                "previous_session_summary": cb.get("previous_session_summary"),
                "system_prompt_chars": len(ctx.system_prompt),
                "system_prompt": ctx.system_prompt,
            },
        )

    assistant_msg_id = new_message_id()
    yield _sse(
        "start",
        {"message_id": assistant_msg_id, "conversation_id": conv.conversation_id},
    )

    # 코치가 먼저 말하도록 시스템 프롬프트에 오프닝 지시를 덧붙인다. 환자 발화가 없어
    # messages 배열이 비면 Anthropic 호출이 성립하지 않으므로, 저장하지 않는 합성
    # 트리거 한 줄만 넣어 첫 턴을 코치가 열게 한다(이 줄은 화면·DB 에 남지 않는다).
    system = ctx.system_prompt + "\n\n" + _OPENING_DIRECTIVE
    messages = [{"role": "user", "content": "(세션을 시작합니다)"}]

    buffered: list[str] = []
    try:
        async for token in llm_gateway.stream(
            db,
            LLMInvokeRequest(
                model=settings.llm_model_dialogue,
                messages=messages,
                system=system,
                max_tokens=512,
                temperature=0.7,
                stream=True,
                patient_id=patient.patient_id,
                purpose="patient_dialogue",
                caller_component="orchestrator",
            ),
        ):
            buffered.append(token)
            yield _sse("token", {"text": token})
    except Exception as exc:
        log.exception("opening LLM stream failed")
        yield _sse("error", _stream_error_payload(exc))
        yield _sse("done", {"finish_reason": "error"})
        return

    full = "".join(buffered).strip() or _OPENING_FALLBACK

    try:
        verdict = output_filter.check(
            db,
            OutputFilterRequest(text=full, conversation_context="session"),
        )
        if not verdict.passed and verdict.recommended_action == "fallback":
            full = _OPENING_FALLBACK
    except Exception:
        log.exception("opening output_filter failed")

    # 커밋 직전 재확인: 스트리밍이 진행되는 수 초 사이에 다른 동시 호출(다기기·재연결)이
    # 이미 오프닝을 저장했을 수 있다. 그랬다면 중복 인사를 만들지 않고 멈춘다. 시작 시
    # 1차 확인 + 여기 2차 확인으로 중복 창을 마이크로초 수준으로 좁힌다(완전 차단은
    # (conversation_id, role) 유니크 제약이 필요하나, 단일 세션·단일 기기 사용 전제에선
    # 이 재확인으로 충분하다).
    raced = db.execute(
        select(Message.message_id)
        .where(Message.conversation_id == conv.conversation_id)
        .limit(1)
    ).first()
    if raced is not None:
        yield _sse("done", {"finish_reason": "already_opened"})
        return

    db.add(
        Message(
            message_id=assistant_msg_id,
            conversation_id=conv.conversation_id,
            role="assistant",
            text=full,
        )
    )
    patient.last_active_at = datetime.now(timezone.utc)
    db.commit()

    yield _sse("done", {"message_id": assistant_msg_id, "finish_reason": "stop"})


async def safety_locked_stream(reason: str) -> AsyncGenerator[dict, None]:
    yield _sse("safety_classified", {"grade": "A", "event_type": reason})
    yield _sse("done", {"finish_reason": "safety_locked"})
    await asyncio.sleep(0)
