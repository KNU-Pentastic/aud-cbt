type Patient = {
  patient_id: string
  name: string
  current_week: number
  sobriety_days: number
  last_active_at: string
  program_status: "active" | "completed" | "withdrawn"
  llm_locked: boolean
  unacknowledged_safety_events: number
}

export const mockProvider = {
  provider_id: "pr_5e7d1a8c2b",
  name: "김민수",
  email: "minsoo.kim@knu.ac.kr",
  affiliation: "강원대학교병원 정신건강의학과",
  active_patient_count: 7,
  notification_preferences: { email_summary: true },
}

export const mockPatients: Patient[] = [
  {
    patient_id: "p_8f3a9b2c4d",
    name: "이영호",
    current_week: 4,
    sobriety_days: 47,
    last_active_at: "2026-05-17T10:23:00Z",
    program_status: "active",
    llm_locked: false,
    unacknowledged_safety_events: 1,
  },
  {
    patient_id: "p_3a1f8e9d2b",
    name: "박서연",
    current_week: 2,
    sobriety_days: 21,
    last_active_at: "2026-05-18T07:42:00Z",
    program_status: "active",
    llm_locked: false,
    unacknowledged_safety_events: 0,
  },
  {
    patient_id: "p_7c4d2e1a9b",
    name: "정재훈",
    current_week: 8,
    sobriety_days: 89,
    last_active_at: "2026-05-16T22:08:00Z",
    program_status: "active",
    llm_locked: true,
    unacknowledged_safety_events: 2,
  },
  {
    patient_id: "p_9e2b6f1a4c",
    name: "최지원",
    current_week: 12,
    sobriety_days: 124,
    last_active_at: "2026-05-15T19:15:00Z",
    program_status: "completed",
    llm_locked: false,
    unacknowledged_safety_events: 0,
  },
  {
    patient_id: "p_1d8b3a5c7e",
    name: "한도윤",
    current_week: 1,
    sobriety_days: 8,
    last_active_at: "2026-05-18T08:55:00Z",
    program_status: "active",
    llm_locked: false,
    unacknowledged_safety_events: 0,
  },
  {
    patient_id: "p_6c9a2e4b1f",
    name: "강민서",
    current_week: 6,
    sobriety_days: 63,
    last_active_at: "2026-05-17T18:30:00Z",
    program_status: "active",
    llm_locked: false,
    unacknowledged_safety_events: 0,
  },
  {
    patient_id: "p_4b7d1f8e2a",
    name: "윤서영",
    current_week: 5,
    sobriety_days: 52,
    last_active_at: "2026-05-18T11:02:00Z",
    program_status: "active",
    llm_locked: false,
    unacknowledged_safety_events: 0,
  },
]

export type Medication = { name: string; dose: string; frequency: string }
export type Checkin = {
  date: string
  mood_nrs: number
  craving_nrs: number
  sleep_hours: number
}
export type SessionRecord = {
  session_id: string
  week_number: number
  completed_at: string
  emotional_tone: "engaged" | "resistant" | "low" | "volatile" | "neutral"
  completed_objectives: string[]
  unaddressed_objectives: string[]
}
export type SafetyEvent = {
  safety_event_id: string
  grade: "A" | "B"
  event_type:
    | "suicide_risk"
    | "acute_intoxication"
    | "relapse"
    | "medication_stop"
    | "paws"
  occurred_at: string
  context: string
}

export type PatientDetail = {
  patient_id: string
  name: string
  discharge_profile: {
    diagnosis_severity: "moderate" | "severe"
    admission_days: number
    discharge_date: string
    medications: Medication[]
    comorbidities: string[]
    suicide_ideation_history: "none" | "past" | "during_admission" | "current"
    primary_triggers_raw: string
    normalized_triggers: string[]
    sso: { name: string; relation: string; phone: string }
    next_outpatient_date: string
  }
  progress: {
    current_week: number
    sobriety_days: number
    medication_adherence_rate_30d: number
  }
  recent_checkins_30d: Checkin[]
  active_session: { session_id: string; week_number: number } | null
  recent_sessions: SessionRecord[]
  recent_safety_events: SafetyEvent[]
  llm_lock_status: {
    locked: boolean
    since: string | null
    reason: string | null
    unlocked_at?: string | null
    unlocked_by?: string | null
    unlock_note?: string | null
  }
}

const MOCK_PATIENT_DETAILS: Record<string, PatientDetail> = {
  p_8f3a9b2c4d: {
    patient_id: "p_8f3a9b2c4d",
    name: "이영호",
    discharge_profile: {
      diagnosis_severity: "moderate",
      admission_days: 18,
      discharge_date: "2026-04-01",
      medications: [
        { name: "날트렉손", dose: "50mg", frequency: "1x daily" },
        { name: "아캄프로세이트", dose: "666mg", frequency: "3x daily" },
      ],
      comorbidities: ["우울", "불면"],
      suicide_ideation_history: "past",
      primary_triggers_raw: "퇴근 후 회식 자리, 부부 다툼 직후",
      normalized_triggers: [
        "work_stress",
        "social_pressure",
        "interpersonal_conflict",
      ],
      sso: { name: "이정훈", relation: "배우자", phone: "010-1234-5678" },
      next_outpatient_date: "2026-06-02",
    },
    progress: {
      current_week: 4,
      sobriety_days: 47,
      medication_adherence_rate_30d: 0.87,
    },
    recent_checkins_30d: makeCheckins(14, { moodSeed: 4, cravingSeed: 7, sleepSeed: 5 }),
    active_session: null,
    recent_sessions: [
      {
        session_id: "s_1a2b3c4d5e",
        week_number: 4,
        completed_at: "2026-05-12T14:00:00Z",
        emotional_tone: "engaged",
        completed_objectives: ["사고 관리 ABC", "고위험 상황 식별"],
        unaddressed_objectives: ["거절 시나리오 연습"],
      },
      {
        session_id: "s_9z8y7x6w5v",
        week_number: 3,
        completed_at: "2026-05-05T14:00:00Z",
        emotional_tone: "resistant",
        completed_objectives: ["음주 패턴 분석"],
        unaddressed_objectives: [],
      },
    ],
    recent_safety_events: [
      {
        safety_event_id: "se_3g4h5i6j7k",
        grade: "B",
        event_type: "relapse",
        occurred_at: "2026-05-14T22:30:00Z",
        context: "갈망 대화 중 환자가 어제 한 잔 보고. RESU 분기로 전환됨.",
      },
    ],
    llm_lock_status: { locked: false, since: null, reason: null },
  },
  p_7c4d2e1a9b: {
    patient_id: "p_7c4d2e1a9b",
    name: "정재훈",
    discharge_profile: {
      diagnosis_severity: "severe",
      admission_days: 31,
      discharge_date: "2026-02-18",
      medications: [{ name: "디설피람", dose: "250mg", frequency: "1x daily" }],
      comorbidities: ["우울", "불안"],
      suicide_ideation_history: "during_admission",
      primary_triggers_raw: "야간 불면, 외로움",
      normalized_triggers: ["sleep_disturbance", "loneliness"],
      sso: { name: "정수민", relation: "여동생", phone: "010-9876-5432" },
      next_outpatient_date: "2026-05-29",
    },
    progress: {
      current_week: 8,
      sobriety_days: 89,
      medication_adherence_rate_30d: 0.62,
    },
    recent_checkins_30d: makeCheckins(21, {
      moodSeed: 3,
      cravingSeed: 6,
      sleepSeed: 4,
    }),
    active_session: null,
    recent_sessions: [
      {
        session_id: "s_a1b2c3d4e5",
        week_number: 7,
        completed_at: "2026-05-10T20:00:00Z",
        emotional_tone: "low",
        completed_objectives: ["거절 기술 연습"],
        unaddressed_objectives: ["SID 인식"],
      },
    ],
    recent_safety_events: [
      {
        safety_event_id: "se_aa11bb22cc",
        grade: "A",
        event_type: "suicide_risk",
        occurred_at: "2026-05-16T22:00:00Z",
        context: "대화 중 '다 끝내고 싶다' 발화. LLM 잠금 및 P4 안내.",
      },
      {
        safety_event_id: "se_dd33ee44ff",
        grade: "B",
        event_type: "medication_stop",
        occurred_at: "2026-05-15T09:00:00Z",
        context: "체크인 자유 메모에 '약 안 먹은 지 3일' 보고. SOMA 분기.",
      },
    ],
    llm_lock_status: {
      locked: true,
      since: "2026-05-16T22:00:00Z",
      reason: "safety_event_grade_a",
    },
  },
}

function makeCheckins(
  count: number,
  seed: { moodSeed: number; cravingSeed: number; sleepSeed: number },
): Checkin[] {
  const today = new Date("2026-05-18T00:00:00Z")
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    return {
      date: d.toISOString().slice(0, 10),
      mood_nrs: Math.max(0, Math.min(10, seed.moodSeed + ((i * 3) % 5))),
      craving_nrs: Math.max(
        0,
        Math.min(10, seed.cravingSeed - ((i * 2) % 6)),
      ),
      sleep_hours: Math.max(0, Math.min(12, seed.sleepSeed + ((i * 7) % 4))),
    }
  })
}

function synthDetailFromSummary(p: Patient): PatientDetail {
  return {
    patient_id: p.patient_id,
    name: p.name,
    discharge_profile: {
      diagnosis_severity: p.sobriety_days > 60 ? "severe" : "moderate",
      admission_days: 14 + ((p.name.length * 3) % 20),
      discharge_date: new Date(
        Date.now() - p.sobriety_days * 24 * 3600 * 1000,
      )
        .toISOString()
        .slice(0, 10),
      medications: [
        { name: "날트렉손", dose: "50mg", frequency: "1x daily" },
      ],
      comorbidities: ["우울"],
      suicide_ideation_history: "none",
      primary_triggers_raw: "스트레스, 친구 권유",
      normalized_triggers: ["work_stress", "social_pressure"],
      sso: { name: "보호자", relation: "가족", phone: "010-0000-0000" },
      next_outpatient_date: "2026-06-15",
    },
    progress: {
      current_week: p.current_week,
      sobriety_days: p.sobriety_days,
      medication_adherence_rate_30d: 0.85,
    },
    recent_checkins_30d: makeCheckins(14, {
      moodSeed: 5,
      cravingSeed: 4,
      sleepSeed: 6,
    }),
    active_session: null,
    recent_sessions: [
      {
        session_id: `s_${p.patient_id.slice(2, 7)}`,
        week_number: Math.max(1, p.current_week - 1),
        completed_at: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
        emotional_tone: "neutral",
        completed_objectives: ["주차 핵심 콘텐츠 전달"],
        unaddressed_objectives: [],
      },
    ],
    recent_safety_events: [],
    llm_lock_status: { locked: p.llm_locked, since: null, reason: null },
  }
}

export function getMockPatientDetail(patientId: string): PatientDetail | null {
  const existing = MOCK_PATIENT_DETAILS[patientId]
  if (existing) return existing
  const summary = mockPatients.find((p) => p.patient_id === patientId)
  if (!summary) return null
  return synthDetailFromSummary(summary)
}

/**
 * Clear a mock patient's LLM safety lock so the detail/list views reflect the
 * unlock on the next refetch. Returns the unlock audit echoed by the endpoint.
 */
export function unlockMockPatient(
  patientId: string,
  unlockedBy: string,
  note?: string,
): { unlocked_at: string; unlocked_by: string } {
  const unlocked_at = new Date().toISOString()
  const detail = MOCK_PATIENT_DETAILS[patientId]
  if (detail) {
    detail.llm_lock_status = {
      locked: false,
      since: detail.llm_lock_status.since,
      reason: detail.llm_lock_status.reason,
      unlocked_at,
      unlocked_by: unlockedBy,
      unlock_note: note ?? null,
    }
  }
  const summary = mockPatients.find((p) => p.patient_id === patientId)
  if (summary) summary.llm_locked = false
  return { unlocked_at, unlocked_by: unlockedBy }
}
