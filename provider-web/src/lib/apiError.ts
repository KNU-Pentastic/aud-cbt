/**
 * openapi-fetch 가 던지는 에러(백엔드 표준 에러 봉투) 또는 일반 Error 에서
 * code/message 를 추출한다.
 *
 * 백엔드 봉투: { error: { code, message, details, request_id } }
 * BFF 는 이 봉투를 그대로 통과시키므로 openapi-fetch 의 `error` 가 곧 이 형태다.
 */
export function extractApiError(err: unknown): { code?: string; message?: string } {
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>
    const envelope = anyErr.error
    if (envelope && typeof envelope === "object") {
      const e = envelope as Record<string, unknown>
      return {
        code: typeof e.code === "string" ? e.code : undefined,
        message: typeof e.message === "string" ? e.message : undefined,
      }
    }
    return {
      code: typeof anyErr.code === "string" ? anyErr.code : undefined,
      message: typeof anyErr.message === "string" ? anyErr.message : undefined,
    }
  }
  return {}
}
