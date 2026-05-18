import { http, HttpResponse, delay } from "msw"
import { API_BASE_URL } from "@/lib/env"
import { getMockPatientDetail, mockPatients, mockProvider } from "./fixtures"

const url = (path: string) => `${API_BASE_URL}${path}`

const VALID_PROVIDER = {
  email: "provider@example.com",
  password: "Demo!Pass1234",
  totp: "123456",
}

function makeRegistrationCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export const handlers = [
  http.post(url("/auth/provider/login"), async ({ request }) => {
    const body = (await request.json()) as {
      email: string
      password: string
      totp: string
    }
    await delay(400)
    if (
      body.email !== VALID_PROVIDER.email ||
      body.password !== VALID_PROVIDER.password ||
      body.totp !== VALID_PROVIDER.totp
    ) {
      return HttpResponse.json(
        {
          error: {
            code: "AUTH_INVALID_CREDENTIALS",
            message: "이메일·비밀번호·TOTP 중 하나가 일치하지 않습니다.",
            request_id: crypto.randomUUID(),
          },
        },
        { status: 401 },
      )
    }
    return HttpResponse.json({
      access_token:
        "mock.jwt." + btoa(JSON.stringify({ sub: mockProvider.provider_id })),
      token_type: "Bearer",
      expires_in: 8 * 60 * 60,
    })
  }),

  http.post(url("/auth/logout"), async () => {
    await delay(100)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(url("/me/provider"), async () => {
    await delay(200)
    return HttpResponse.json(mockProvider)
  }),

  http.get(url("/provider/patients"), async ({ request }) => {
    await delay(250)
    const u = new URL(request.url)
    const page = Number(u.searchParams.get("page") ?? "1")
    const pageSize = Number(u.searchParams.get("page_size") ?? "20")
    const start = (page - 1) * pageSize
    const items = mockPatients.slice(start, start + pageSize)
    return HttpResponse.json({
      items,
      pagination: {
        page,
        page_size: pageSize,
        total_items: mockPatients.length,
        total_pages: Math.ceil(mockPatients.length / pageSize),
      },
    })
  }),

  http.get(url("/provider/patients/:patientId"), async ({ params }) => {
    await delay(300)
    const detail = getMockPatientDetail(String(params.patientId))
    if (!detail) {
      return HttpResponse.json(
        {
          error: {
            code: "PATIENT_NOT_FOUND",
            message: "환자를 찾을 수 없습니다.",
            request_id: crypto.randomUUID(),
          },
        },
        { status: 404 },
      )
    }
    return HttpResponse.json(detail)
  }),

  http.post(url("/provider/patients"), async ({ request }) => {
    await delay(500)
    const body = (await request.json()) as { name?: string }
    const newId = "p_" + Math.random().toString(36).slice(2, 12)
    return HttpResponse.json(
      {
        patient_id: newId,
        registration_code: makeRegistrationCode(),
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        normalized_triggers: ["work_stress", "social_pressure"],
        created_patient_name: body.name ?? "신규 환자",
      },
      { status: 201 },
    )
  }),

  http.post(
    url("/provider/patients/:patientId/registration-code/regenerate"),
    async () => {
      await delay(300)
      return HttpResponse.json({
        registration_code: makeRegistrationCode(),
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      })
    },
  ),

  http.put(
    url("/provider/patients/:patientId/medications"),
    async ({ request, params }) => {
      await delay(300)
      const body = (await request.json()) as {
        medications: Array<{ name: string; dose: string; frequency: string }>
      }
      return HttpResponse.json({
        patient_id: String(params.patientId),
        medications: body.medications,
        updated_at: new Date().toISOString(),
      })
    },
  ),

  http.patch(
    url("/provider/patients/:patientId/next-outpatient-date"),
    async ({ request, params }) => {
      await delay(200)
      const body = (await request.json()) as { next_outpatient_date: string }
      return HttpResponse.json({
        patient_id: String(params.patientId),
        next_outpatient_date: body.next_outpatient_date,
        updated_at: new Date().toISOString(),
      })
    },
  ),

  http.patch(
    url("/provider/patients/:patientId/program-status"),
    async ({ request, params }) => {
      await delay(300)
      const body = (await request.json()) as {
        new_status: "completed" | "withdrawn"
        reason: string
      }
      return HttpResponse.json({
        patient_id: String(params.patientId),
        program_status: body.new_status,
        reason: body.reason,
        updated_at: new Date().toISOString(),
      })
    },
  ),
]
