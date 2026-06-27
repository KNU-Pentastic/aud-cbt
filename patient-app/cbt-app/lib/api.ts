import { fetch as expoFetch } from 'expo/fetch';
import { API_BASE } from './config';
import { getToken, notifyUnauthorized } from './authToken';

/** 백엔드 표준 에러 봉투: { error: { code, message, details, request_id } } */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 인증 헤더(Authorization: Bearer ...) 부착 여부. 기본 true */
  auth?: boolean;
  /**
   * 요청 타임아웃(ms). 초과하면 abort 하고 NETWORK_ERROR 를 던진다. 기본 15초.
   * (예전엔 타임아웃이 없어, 서버가 응답을 늦게 주거나 프록시가 늦게 끊을 때까지
   *  무한 대기했다 — /end 같은 호출이 멈춘 듯 보이고 실패를 늦게야 알았다.)
   */
  timeoutMs?: number;
};

function parseError(status: number, raw: string): ApiError {
  try {
    const json = JSON.parse(raw);
    const err = json?.error;
    if (err?.message) {
      return new ApiError(status, err.message, err.code ?? 'ERROR');
    }
  } catch {
    /* JSON 아님 — 아래 기본 메시지 사용 */
  }
  return new ApiError(status, raw || '요청에 실패했어요.', 'ERROR');
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 15000 } = opts;
  const token = getToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // abort(타임아웃) 포함 — 연결 실패로 안내한다.
    throw new ApiError(0, '서버에 연결할 수 없어요. 네트워크를 확인해주세요.', 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) {
    return null as T;
  }

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 && auth) {
      // 만료/무효 토큰 → 인증 게이트에 알려 로그인 화면으로 복귀시킨다
      notifyUnauthorized();
    }
    throw parseError(res.status, text);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  del: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// SSE 스트리밍 (POST /me/conversations/{id}/messages)
//
// React Native 의 XMLHttpRequest 는 Expo 환경에서 responseText 를 점진적으로
// 전달하지 못해 토큰이 실시간으로 표시되지 않는다. 대신 스트리밍을 지원하는
// expo/fetch 의 ReadableStream(getReader) 으로 SSE 프레임을 직접 파싱한다.
// ---------------------------------------------------------------------------

/** 이 답변에서 LLM 이 참고한 가이드라인 블록 (식별자 + 제목 + 본문). */
export type PromptBlock = { target: string; title: string; body: string };

/** context_used: 라이브 답변이 어떤 프롬프트를 참고했는지 (LLM_TRACE=on 일 때만 옴). */
export type PromptTrace = {
  context_type: 'session' | 'craving' | 'resu' | 'soma';
  phase: number | null;
  week_number: number | null;
  prompt_version: string;
  prompt_blocks: PromptBlock[];
  selected_modules: { selected_modules: string[]; rationale: string; confidence: number } | null;
  /** 이 세션이 참고한 직전 세션 요약(#5). 세션 컨텍스트에서만, 직전 세션이 있을 때만 채워짐. */
  previous_session_summary?: {
    week_number: number;
    completed_objectives: string[];
    unaddressed_objectives: string[];
    key_insights: string[];
    handoff_notes: string;
    assigned_homework: string;
  } | null;
  system_prompt_chars: number;
  /** LLM 에 실제로 전달된 조립 완료 시스템 프롬프트 전문 (환자 컨텍스트 포함). */
  system_prompt: string;
};

/** utterance_analysis: 방금 환자 발화에 대한 구조화 분석 (LLM_TRACE=on 일 때만 옴). */
export type UtteranceAnalysis = {
  /** 분석 대상이 된 환자 발화 (최대 500자). */
  text: string;
  analysis: {
    primary_emotion: string;
    emotions: string[];
    intent: string;
    cognitive_distortions: string[];
    craving_intensity: number; // 0~10
    topics: string[];
    relevant_step: number | null; // 1~5
    summary: string;
  };
  /** 안전 분류기(매 발화 실행) 결과. */
  safety: {
    grade: 'A' | 'B' | 'none';
    event_type: string;
    confidence: number;
    matched_by: 'rule_keyword' | 'llm_classifier' | 'both' | 'none';
    recommended_action: string;
  };
};

/** stage_progress: 치료의 주차/단계 진행도 (세션 대화에서만, LLM_TRACE=on 일 때만 옴). */
export type StageProgress = {
  week_number: number;
  total_weeks: number;
  phase: number;
  current_step: number;
  total_steps: number;
  ready_to_advance: boolean;
  step_completion: number;
  drift: 'low' | 'medium' | 'high';
  /** LLM 이 이번 주 내용을 끝까지 진행해 '마칠 준비'가 됐는지 (자동 종료 아님). */
  ready_to_complete: boolean;
};

export type SseEvent =
  | { event: 'start'; data: { message_id: string; conversation_id: string } }
  | { event: 'token'; data: { text: string } }
  | { event: 'safety_classified'; data: { grade: 'A' | 'B'; event_type: string } }
  | { event: 'context_switched'; data: { from: string; to: string } }
  | { event: 'context_used'; data: PromptTrace }
  | { event: 'utterance_analysis'; data: UtteranceAnalysis }
  | { event: 'stage_progress'; data: StageProgress }
  | { event: 'session_ready'; data: { week_number?: number; current_step?: number } }
  | { event: 'done'; data: { message_id?: string; finish_reason: string } }
  | { event: 'error'; data: { code: string; message: string } };

type StreamHandlers = {
  onEvent: (ev: SseEvent) => void;
  onError: (err: ApiError) => void;
  onComplete: () => void;
};

/** 한 개의 SSE 프레임("event: x\ndata: {...}")을 파싱한다. 주석(:)·핑은 무시. */
function parseFrame(frame: string): SseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
    // ':' 로 시작하는 주석(핑 등)과 기타 라인은 무시
  }
  if (dataLines.length === 0) return null;
  try {
    const data = JSON.parse(dataLines.join('\n'));
    return { event, data } as SseEvent;
  } catch {
    return null;
  }
}

/**
 * 대화 SSE 엔드포인트를 POST 로 열고 프레임을 파싱해 핸들러로 흘려보낸다.
 * streamMessage(메시지 전송)·streamOpening(코치 오프닝)이 공유하는 코어.
 * @returns 스트림을 취소하는 함수 (abort)
 */
function runSseStream(path: string, body: unknown | undefined, handlers: StreamHandlers): () => void {
  const token = getToken();
  const controller = new AbortController();
  let settled = false;

  // onComplete/onError 는 한 번만 호출되도록 보장한다 (취소 시에는 둘 다 미호출).
  const settle = (fn?: () => void) => {
    if (settled) return;
    settled = true;
    fn?.();
  };

  (async () => {
    let resp;
    try {
      resp = await expoFetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      settle(() =>
        handlers.onError(
          new ApiError(0, '서버에 연결할 수 없어요. 네트워크를 확인해주세요.', 'NETWORK_ERROR')
        )
      );
      return;
    }

    // SSE 가 아니라 HTTP 에러 본문이면 에러로 처리
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      settle(() => {
        if (resp.status === 401) notifyUnauthorized();
        handlers.onError(parseError(resp.status, body));
      });
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      settle(() => handlers.onComplete());
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const drainFrames = () => {
      let idx: number;
      while (!settled && (idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const ev = parseFrame(frame);
        if (ev) handlers.onEvent(ev);
      }
    };

    // sse_starlette 등 다수의 SSE 서버는 줄·프레임 구분에 CRLF(\r\n)를 쓴다.
    // 프레임 경계는 \n\n 로 탐지하므로, 버퍼를 LF 로 정규화해야 \r\n\r\n 이
    // 경계로 인식된다. (정규화하지 않으면 토큰이 한 건도 파싱되지 않아 화면에
    // 아무 응답도 표시되지 않는다.) 청크 경계에서 \r\n 이 쪼개질 수 있어
    // append 후 버퍼 전체를 다시 정규화한다.
    const append = (text: string) => {
      buffer = (buffer + text).replace(/\r\n/g, '\n');
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        append(decoder.decode(value, { stream: true }));
        drainFrames();
        if (settled) return; // 취소됨
      }
      append(decoder.decode());
      drainFrames();
      settle(() => handlers.onComplete());
    } catch {
      // 사용자가 취소(abort)한 경우는 오류가 아니다.
      if (controller.signal.aborted) {
        settle();
        return;
      }
      settle(() =>
        handlers.onError(new ApiError(0, '응답을 받는 중 연결이 끊겼어요.', 'NETWORK_ERROR'))
      );
    }
  })();

  return () => {
    settle(() => controller.abort());
  };
}

/**
 * 환자 메시지를 전송하고 LLM 응답을 SSE 로 스트리밍한다.
 * @returns 스트림을 취소하는 함수 (abort)
 */
export function streamMessage(
  conversationId: string,
  text: string,
  handlers: StreamHandlers
): () => void {
  return runSseStream(`/me/conversations/${conversationId}/messages`, { text }, handlers);
}

/**
 * 세션 오프닝(코치가 먼저 말 걸기)을 SSE 로 스트리밍한다 — 본문 없음.
 * 세션1을 제외한 주간 세션에서, 환자 첫 발화 전에 코치가 먼저 인사한다.
 * @returns 스트림을 취소하는 함수 (abort)
 */
export function streamOpening(conversationId: string, handlers: StreamHandlers): () => void {
  return runSseStream(`/me/conversations/${conversationId}/opening`, undefined, handlers);
}
