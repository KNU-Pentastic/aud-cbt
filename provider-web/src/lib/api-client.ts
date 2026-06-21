"use client"

import createClient, { type Middleware } from "openapi-fetch"
import { API_BASE_URL } from "./env"
import type { paths } from "@/shared/api-types"

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    // 토큰은 httpOnly 쿠키에 저장되므로 브라우저는 직접 접근하지 못함.
    // Next.js Route Handler(`/api/mock/v1/*` 또는 BFF 경로)가 쿠키에서 꺼내
    // 백엔드로 전달하는 구조.
    request.headers.set("Accept", "application/json")
    return request
  },
  async onResponse({ response }) {
    // 세션이 없거나 토큰이 만료/무효(좀비 세션)면 BFF가 401을 준다.
    // 에러 화면에 갇히지 않도록 로그인 화면으로 보낸다(쿠키는 BFF가 이미 제거).
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/login"
    ) {
      window.location.href = "/login"
    }
    return response
  },
}

export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL })
apiClient.use(authMiddleware)
