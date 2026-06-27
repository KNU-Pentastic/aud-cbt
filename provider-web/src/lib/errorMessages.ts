import { extractApiError } from "./apiError"

/**
 * 백엔드 에러 코드 → 사용자에게 보여줄 한국어 안내 메시지.
 *
 * 의료진 웹은 환자 LLM 대화를 직접 호출하지 않으므로 주 대상은 레이트리밋
 * (RATE_LIMITED)·인증 만료(UNAUTHORIZED)·자격 오류다. 매핑되지 않은 코드는
 * 호출부가 넘긴 fallback(화면별 한국어 문구)을 우선 사용한다.
 */
const MESSAGES: Record<string, string> = {
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  LLM_TOKEN_QUOTA_EXCEEDED: "오늘 LLM 사용량을 모두 사용했습니다. 내일 다시 시도하세요.",
  PAYLOAD_TOO_LARGE: "요청 데이터가 너무 큽니다.",
  UNAUTHORIZED: "세션이 만료되었습니다. 다시 로그인해주세요.",
  INVALID_CREDENTIALS: "이메일 또는 비밀번호가 일치하지 않습니다.",
}

/** 에러 객체 → 친절 메시지. 매핑 코드 우선, 없으면 fallback → 백엔드 message → 기본. */
export function friendlyError(err: unknown, fallback?: string): string {
  const { code, message } = extractApiError(err)
  if (code && MESSAGES[code]) return MESSAGES[code]
  return fallback || message || "오류가 발생했습니다."
}

/** 코드만 알 때(서버 액션 등). 매핑 우선, 없으면 fallback. */
export function friendlyMessageFromCode(code?: string | null, fallback?: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code]
  return fallback || "오류가 발생했습니다."
}
