"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { PatientDetail } from "@/mocks/fixtures"
import { COMORBIDITY_LABELS, type Comorbidity } from "@/lib/safety"

export const qk = {
  provider: () => ["provider"] as const,
  patients: () => ["provider", "patients"] as const,
  patient: (id: string) => ["provider", "patients", id] as const,
}

type PatientSummary = {
  patient_id: string
  name: string
  current_week: number
  sobriety_days: number
  last_active_at: string
  program_status: "active" | "completed" | "withdrawn"
  llm_locked: boolean
  unacknowledged_safety_events: number
}

type PaginatedPatients = {
  items: PatientSummary[]
  pagination: {
    page: number
    page_size: number
    total_items: number
    total_pages: number
  }
}

export function useProviderProfile() {
  return useQuery({
    queryKey: qk.provider(),
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/me/provider" as never)
      if (error) throw error
      return data as {
        provider_id: string
        name: string
        email: string
        affiliation: string
        active_patient_count: number
      }
    },
  })
}

type BackendPatientListItem = Omit<
  PatientSummary,
  "unacknowledged_safety_events" | "last_active_at"
> & {
  last_active_at: string | null
  unacknowledged_safety_events_count: number
}

function adaptPatientList(raw: {
  items: BackendPatientListItem[]
  pagination: PaginatedPatients["pagination"]
}): PaginatedPatients {
  return {
    items: raw.items.map((i) => ({
      patient_id: i.patient_id,
      name: i.name,
      current_week: i.current_week,
      sobriety_days: i.sobriety_days,
      last_active_at: i.last_active_at ?? "",
      program_status: i.program_status,
      llm_locked: i.llm_locked,
      unacknowledged_safety_events: i.unacknowledged_safety_events_count,
    })),
    pagination: raw.pagination,
  }
}

export function usePatients() {
  return useQuery({
    queryKey: qk.patients(),
    queryFn: async () => {
      const { data, error } = await apiClient.GET(
        "/provider/patients" as never,
        { params: { query: { page: 1, page_size: 50 } } } as never,
      )
      if (error) throw error
      return adaptPatientList(data as never)
    },
  })
}

type BackendSafetyEvent = {
  safety_event_id: string
  grade: "A" | "B"
  event_type: PatientDetail["recent_safety_events"][number]["event_type"]
  detected_at: string
  source?: string
  recommended_action?: string
}

type BackendRecentSession = {
  session_id: string
  week_number: number
  ended_at: string | null
  summary: {
    emotional_tone?: PatientDetail["recent_sessions"][number]["emotional_tone"]
    completed_objectives?: string[]
    unaddressed_objectives?: string[]
  } | null
}

type BackendPatientDetail = {
  patient_id: string
  discharge_profile: {
    name: string
    diagnosis_severity: PatientDetail["discharge_profile"]["diagnosis_severity"]
    admission_days: number
    medications: PatientDetail["discharge_profile"]["medications"]
    comorbidities: string[]
    suicide_ideation_history: PatientDetail["discharge_profile"]["suicide_ideation_history"]
    normalized_triggers: string[]
    next_outpatient_date: string
    sso: { name: string; relationship: string; phone: string } | null
  }
  progress: PatientDetail["progress"]
  recent_checkins_30d: PatientDetail["recent_checkins_30d"]
  active_session: { session_id: string; week_number: number } | null
  recent_sessions: BackendRecentSession[]
  recent_safety_events: {
    grade_a: BackendSafetyEvent[]
    grade_b: BackendSafetyEvent[]
  }
  llm_lock_status: { locked: boolean; locked_at: string | null; reason: string | null }
}

function adaptPatientDetail(raw: BackendPatientDetail): PatientDetail {
  const dp = raw.discharge_profile
  const events = [
    ...raw.recent_safety_events.grade_a,
    ...raw.recent_safety_events.grade_b,
  ]
  return {
    patient_id: raw.patient_id,
    name: dp.name,
    discharge_profile: {
      diagnosis_severity: dp.diagnosis_severity,
      admission_days: dp.admission_days,
      discharge_date: "",
      medications: dp.medications,
      comorbidities: (dp.comorbidities as Comorbidity[]).map(
        (c) => COMORBIDITY_LABELS[c] ?? c,
      ),
      suicide_ideation_history: dp.suicide_ideation_history,
      primary_triggers_raw: "",
      normalized_triggers: dp.normalized_triggers,
      sso: {
        name: dp.sso?.name ?? "",
        relation: dp.sso?.relationship ?? "",
        phone: dp.sso?.phone ?? "",
      },
      next_outpatient_date: dp.next_outpatient_date,
    },
    progress: raw.progress,
    recent_checkins_30d: raw.recent_checkins_30d,
    active_session: raw.active_session,
    recent_sessions: raw.recent_sessions.map((s) => ({
      session_id: s.session_id,
      week_number: s.week_number,
      completed_at: s.ended_at ?? "",
      emotional_tone: s.summary?.emotional_tone ?? "neutral",
      completed_objectives: s.summary?.completed_objectives ?? [],
      unaddressed_objectives: s.summary?.unaddressed_objectives ?? [],
    })),
    recent_safety_events: events.map((e) => ({
      safety_event_id: e.safety_event_id,
      grade: e.grade,
      event_type: e.event_type,
      occurred_at: e.detected_at,
      context: e.recommended_action ?? e.source ?? "",
    })),
    llm_lock_status: {
      locked: raw.llm_lock_status.locked,
      since: raw.llm_lock_status.locked_at,
      reason: raw.llm_lock_status.reason,
    },
  }
}

export function usePatient(patientId: string) {
  return useQuery({
    queryKey: qk.patient(patientId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET(
        "/provider/patients/{patient_id}" as never,
        { params: { path: { patient_id: patientId } } } as never,
      )
      if (error) throw error
      return adaptPatientDetail(data as BackendPatientDetail)
    },
    enabled: !!patientId,
  })
}

type CreatePatientBody = {
  name: string
  phone: string
  date_of_birth: string
  sex: "male" | "female"
  discharge_date: string
  diagnosis_severity: "moderate" | "severe"
  admission_days: number
  medications: { name: string; dose: string; frequency: string }[]
  comorbidities: (
    | "depression"
    | "anxiety"
    | "insomnia"
    | "ptsd"
    | "bipolar"
    | "other"
  )[]
  suicide_ideation_history: "none" | "past" | "during_admission" | "current"
  primary_triggers: { raw_text: string }
  sso: {
    name: string
    relationship: "spouse" | "parent" | "sibling" | "child" | "friend" | "other"
    phone: string
  }
  next_outpatient_date: string
}

type CreatePatientResponse = {
  patient_id: string
  registration_code: string
  expires_at: string
  normalized_triggers: string[]
}

export function useCreatePatient() {
  const qc = useQueryClient()
  return useMutation<CreatePatientResponse, Error, CreatePatientBody>({
    mutationFn: async (body) => {
      const { data, error } = await apiClient.POST(
        "/provider/patients" as never,
        { body } as never,
      )
      if (error) throw error
      return data as CreatePatientResponse
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.patients() }),
  })
}

export type RegistrationCodeStatus = {
  registration_code: string | null
  status: "active" | "consumed" | "expired" | "none"
  expires_at: string | null
  is_registered: boolean
}

const regCodeKey = (id: string) =>
  [...qk.patient(id), "registration-code"] as const

export function useRegistrationCode(patientId: string) {
  return useQuery({
    queryKey: regCodeKey(patientId),
    queryFn: async () => {
      const { data, error } = await apiClient.GET(
        "/provider/patients/{patient_id}/registration-code" as never,
        { params: { path: { patient_id: patientId } } } as never,
      )
      if (error) throw error
      return data as RegistrationCodeStatus
    },
    enabled: !!patientId,
  })
}

export function useRegenerateCode(patientId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await apiClient.POST(
        "/provider/patients/{patient_id}/registration-code/regenerate" as never,
        { params: { path: { patient_id: patientId } } } as never,
      )
      if (error) throw error
      return data as { registration_code: string; expires_at: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: regCodeKey(patientId) })
      qc.invalidateQueries({ queryKey: qk.patient(patientId) })
    },
  })
}

export function useDeletePatient() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (patientId) => {
      const { error } = await apiClient.DELETE(
        "/provider/patients/{patient_id}" as never,
        { params: { path: { patient_id: patientId } } } as never,
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.patients() }),
  })
}

export function useUpdateMedications(patientId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      medications: { name: string; dose: string; frequency: string }[]
      change_note?: string
    }) => {
      const { data, error } = await apiClient.PUT(
        "/provider/patients/{patient_id}/medications" as never,
        {
          params: { path: { patient_id: patientId } },
          body,
        } as never,
      )
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.patient(patientId) }),
  })
}

export function useUpdateOutpatientDate(patientId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      next_outpatient_date: string
      change_note?: string
    }) => {
      const { data, error } = await apiClient.PATCH(
        "/provider/patients/{patient_id}/next-outpatient-date" as never,
        {
          params: { path: { patient_id: patientId } },
          body,
        } as never,
      )
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.patient(patientId) }),
  })
}

export function useUpdateProgramStatus(patientId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      new_status: "completed" | "withdrawn"
      reason: string
    }) => {
      const { data, error } = await apiClient.PATCH(
        "/provider/patients/{patient_id}/program-status" as never,
        {
          params: { path: { patient_id: patientId } },
          body,
        } as never,
      )
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.patient(patientId) })
      qc.invalidateQueries({ queryKey: qk.patients() })
    },
  })
}
