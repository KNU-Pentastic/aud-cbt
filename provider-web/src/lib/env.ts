export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/mock/v1"

export const ENABLE_MOCKS =
  (process.env.NEXT_PUBLIC_ENABLE_MOCKS ?? "true") === "true"
