import { http, HttpResponse, delay } from "msw"
import { API_BASE_URL } from "@/lib/env"
import {
  getMockPatientDetail,
  mockPatients,
  mockProvider,
  unlockMockPatient,
} from "./fixtures"

const url = (path: string) => `${API_BASE_URL}${path}`

const VALID_PROVIDER = {
  email: "provider@example.com",
  password: "Demo!Pass1234",
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
    }
    await delay(400)
    if (
      body.email !== VALID_PROVIDER.email ||
      body.password !== VALID_PROVIDER.password
    ) {
      return HttpResponse.json(
        {
          error: {
            code: "AUTH_INVALID_CREDENTIALS",
            message: "이메일 또는 비밀번호가 일치하지 않습니다.",
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
      items: items.map((p) => ({
        patient_id: p.patient_id,
        name: p.name,
        current_week: p.current_week,
        sobriety_days: p.sobriety_days,
        last_active_at: p.last_active_at,
        program_status: p.program_status,
        llm_locked: p.llm_locked,
        unacknowledged_safety_events_count: p.unacknowledged_safety_events,
      })),
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
    const gradeA = detail.recent_safety_events.filter((e) => e.grade === "A")
    const gradeB = detail.recent_safety_events.filter((e) => e.grade === "B")
    return HttpResponse.json({
      patient_id: detail.patient_id,
      discharge_profile: {
        name: detail.name,
        diagnosis_severity: detail.discharge_profile.diagnosis_severity,
        admission_days: detail.discharge_profile.admission_days,
        medications: detail.discharge_profile.medications,
        comorbidities: detail.discharge_profile.comorbidities,
        suicide_ideation_history: detail.discharge_profile.suicide_ideation_history,
        normalized_triggers: detail.discharge_profile.normalized_triggers,
        next_outpatient_date: detail.discharge_profile.next_outpatient_date,
        sso: detail.discharge_profile.sso
          ? {
              name: detail.discharge_profile.sso.name,
              relationship: detail.discharge_profile.sso.relation,
              phone: detail.discharge_profile.sso.phone,
            }
          : null,
      },
      progress: detail.progress,
      recent_checkins_30d: detail.recent_checkins_30d,
      active_session: detail.active_session,
      recent_sessions: detail.recent_sessions.map((s) => ({
        session_id: s.session_id,
        week_number: s.week_number,
        ended_at: s.completed_at,
        summary: {
          emotional_tone: s.emotional_tone,
          completed_objectives: s.completed_objectives,
          unaddressed_objectives: s.unaddressed_objectives,
        },
      })),
      recent_safety_events: {
        grade_a: gradeA.map((e) => ({
          safety_event_id: e.safety_event_id,
          grade: e.grade,
          event_type: e.event_type,
          detected_at: e.occurred_at,
          source: e.context,
        })),
        grade_b: gradeB.map((e) => ({
          safety_event_id: e.safety_event_id,
          grade: e.grade,
          event_type: e.event_type,
          detected_at: e.occurred_at,
          source: e.context,
        })),
      },
      llm_lock_status: {
        locked: detail.llm_lock_status.locked,
        locked_at: detail.llm_lock_status.since,
        reason: detail.llm_lock_status.reason,
        unlocked_at: detail.llm_lock_status.unlocked_at ?? null,
        unlocked_by: detail.llm_lock_status.unlocked_by ?? null,
        unlock_note: detail.llm_lock_status.unlock_note ?? null,
      },
    })
  }),

  http.get(
    url("/provider/patients/:patientId/registration-code"),
    async ({ params }) => {
      await delay(200)
      const patientId = String(params.patientId)
      const summary = mockPatients.find((p) => p.patient_id === patientId)
      if (!summary) {
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
      return HttpResponse.json({
        registration_code: null,
        status: "none",
        expires_at: null,
        is_registered: false,
      })
    },
  ),

  http.delete(url("/provider/patients/:patientId"), async ({ params }) => {
    await delay(300)
    const patientId = String(params.patientId)
    const idx = mockPatients.findIndex((p) => p.patient_id === patientId)
    if (idx === -1) {
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
    mockPatients.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
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

  http.post(
    url("/provider/patients/:patientId/unlock-llm"),
    async ({ request, params }) => {
      await delay(300)
      const body = (await request
        .json()
        .catch(() => ({}))) as { note?: string }
      const patientId = String(params.patientId)
      const { unlocked_at, unlocked_by } = unlockMockPatient(
        patientId,
        mockProvider.provider_id,
        body.note,
      )
      return HttpResponse.json({
        patient_id: patientId,
        locked: false,
        unlocked_at,
        unlocked_by,
        acknowledged_safety_events: 1,
      })
    },
  ),
]
