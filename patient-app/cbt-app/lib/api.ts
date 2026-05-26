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
  const { method = 'GET', body, auth = true } = opts;
  const token = getToken();

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
    });
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없어요. 네트워크를 확인해주세요.', 'NETWORK_ERROR');
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
// React Native 에는 POST 바디를 지원하는 EventSource 가 없으므로
// XMLHttpRequest 의 점진적 responseText(readyState 3) 를 직접 파싱합니다.
// ---------------------------------------------------------------------------

export type SseEvent =
  | { event: 'start'; data: { message_id: string; conversation_id: string } }
  | { event: 'token'; data: { text: string } }
  | { event: 'safety_classified'; data: { grade: 'A' | 'B'; event_type: string } }
  | { event: 'context_switched'; data: { from: string; to: string } }
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
 * 대화 메시지를 전송하고 SSE 응답을 스트리밍한다.
 * @returns 스트림을 취소하는 함수 (abort)
 */
export function streamMessage(
  conversationId: string,
  text: string,
  handlers: StreamHandlers
): () => void {
  const token = getToken();
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API_BASE}/me/conversations/${conversationId}/messages`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

  let processed = 0;
  let buffer = '';
  let settled = false;

  const drain = () => {
    const full = xhr.responseText;
    buffer += full.slice(processed);
    processed = full.length;
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const ev = parseFrame(frame);
      if (ev) handlers.onEvent(ev);
    }
  };

  xhr.onreadystatechange = () => {
    if (settled) return;
    // HEADERS_RECEIVED 이상에서 HTTP 에러(SSE 아님)면 본문을 에러로 처리
    if (xhr.readyState >= XMLHttpRequest.HEADERS_RECEIVED && xhr.status >= 400) {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        settled = true;
        if (xhr.status === 401) notifyUnauthorized();
        handlers.onError(parseError(xhr.status, xhr.responseText));
      }
      return;
    }
    if (xhr.readyState === XMLHttpRequest.LOADING) {
      drain();
    } else if (xhr.readyState === XMLHttpRequest.DONE) {
      settled = true;
      drain();
      handlers.onComplete();
    }
  };

  xhr.onerror = () => {
    if (settled) return;
    settled = true;
    handlers.onError(
      new ApiError(0, '서버에 연결할 수 없어요. 네트워크를 확인해주세요.', 'NETWORK_ERROR')
    );
  };

  xhr.send(JSON.stringify({ text }));

  return () => {
    if (!settled) {
      settled = true;
      xhr.abort();
    }
  };
}
