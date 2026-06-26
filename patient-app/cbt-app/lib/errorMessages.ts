/**
 * 백엔드 에러 코드 → 사용자에게 보여줄 한국어 안내 메시지.
 *
 * 핵심: 레이트리밋(RATE_LIMITED, 일시적)과 일일 사용량 소진
 * (LLM_TOKEN_QUOTA_EXCEEDED, 오늘은 더 못 씀)을 다른 문구로 안내한다.
 * 백엔드가 정확한 code 를 내려주므로(프리플라이트 429 / SSE error 이벤트) 구분 가능.
 */
const MESSAGES: Record<string, string> = {
  RATE_LIMITED: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.',
  LLM_TOKEN_QUOTA_EXCEEDED: '오늘 대화 사용량을 다 썼어요. 내일 다시 이용할 수 있어요.',
  PAYLOAD_TOO_LARGE: '메시지가 너무 길어요. 더 짧게 나눠 보내주세요.',
  CONVERSATION_ENDED: '이 대화는 이미 종료되었어요.',
  LLM_UPSTREAM_UNAVAILABLE: '지금 답변을 생성할 수 없어요. 잠시 후 다시 시도해주세요.',
  NETWORK_ERROR: '서버에 연결할 수 없어요. 네트워크를 확인해주세요.',
};

const DEFAULT_MESSAGE = '문제가 발생했어요. 잠시 후 다시 시도해주세요.';

/** code 에 매핑된 안내 메시지. 없으면 fallback(백엔드 message) → 기본 문구 순. */
export function friendlyMessage(code?: string | null, fallback?: string | null): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback || DEFAULT_MESSAGE;
}

/** ApiError 등 { code, message } 형태의 에러를 친절 메시지로 변환. */
export function friendlyError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  return friendlyMessage(e?.code, e?.message);
}
