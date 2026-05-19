"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { createSession } from "@/lib/session"

const LoginSchema = z.object({
  email: z.email({ error: "올바른 이메일을 입력하세요." }),
  password: z
    .string()
    .min(12, { error: "비밀번호는 12자 이상이어야 합니다." }),
})

export type LoginState = {
  errors?: {
    email?: string[]
    password?: string[]
    form?: string[]
  }
}

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors }
  }

  // MVP: Mock fallback. 실제 백엔드 연동 전에는 Mock 자격을 직접 검증.
  // (브라우저측 MSW는 서버 컴포넌트에서 동작하지 않으므로 자체 검증)
  const VALID = {
    email: "provider@example.com",
    password: "Demo!Pass1234",
  }

  let providerId: string | null = null
  let accessToken: string | null = null

  const backendUrl = process.env.BACKEND_INTERNAL_URL

  try {
    if (backendUrl) {
      const res = await fetch(`${backendUrl}/auth/provider/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      })
      if (!res.ok) {
        return { errors: { form: ["로그인에 실패했습니다."] } }
      }
      const body = (await res.json()) as { access_token: string }
      accessToken = body.access_token
      providerId = "pr_5e7d1a8c2b"
    } else {
      // Mock 검증
      if (
        parsed.data.email !== VALID.email ||
        parsed.data.password !== VALID.password
      ) {
        return {
          errors: {
            form: ["이메일 또는 비밀번호가 일치하지 않습니다."],
          },
        }
      }
      accessToken = "mock.jwt.token"
      providerId = "pr_5e7d1a8c2b"
    }
  } catch {
    return { errors: { form: ["서버 응답을 받지 못했습니다."] } }
  }

  await createSession({
    provider_id: providerId,
    email: parsed.data.email,
    access_token: accessToken,
  })
  redirect("/patients")
}
