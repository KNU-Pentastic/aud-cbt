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
}

export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL })
apiClient.use(authMiddleware)
