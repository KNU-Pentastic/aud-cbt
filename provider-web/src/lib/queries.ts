"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { PatientDetail } from "@/mocks/fixtures"

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

export function usePatients() {
  return useQuery({
    queryKey: qk.patients(),
    queryFn: async () => {
      const { data, error } = await apiClient.GET(
        "/provider/patients" as never,
        { params: { query: { page: 1, page_size: 50 } } } as never,
      )
      if (error) throw error
      return data as PaginatedPatients
    },
  })
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
      return data as PatientDetail
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
  comorbidities: string[]
  suicide_ideation_history: "none" | "past" | "during_admission" | "current"
  primary_triggers: { raw_text: string }
  sso: { name: string; relation: string; phone: string }
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

export function useRegenerateCode(patientId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await apiClient.POST(
        "/provider/patients/{patient_id}/registration-code/regenerate" as never,
        { params: { path: { patient_id: patientId } } } as never,
      )
      if (error) throw error
      return data as { registration_code: string; expires_at: string }
    },
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
