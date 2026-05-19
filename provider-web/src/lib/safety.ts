export type SafetyGrade = "A" | "B"

export type SafetyEventType =
  | "suicide_risk"
  | "acute_intoxication"
  | "relapse"
  | "medication_stop"
  | "paws"

export const SAFETY_EVENT_LABELS: Record<SafetyEventType, string> = {
  suicide_risk: "자살 위험",
  acute_intoxication: "급성 중독",
  relapse: "재발 신호",
  medication_stop: "복약 중단",
  paws: "지연성 금단",
}

export function gradeLabel(grade: SafetyGrade): string {
  return grade === "A" ? "응급(A)" : "비응급(B)"
}

export type DiagnosisSeverity = "moderate" | "severe"
export const SEVERITY_LABELS: Record<DiagnosisSeverity, string> = {
  moderate: "DSM-5 중등도",
  severe: "DSM-5 중증",
}

export type SuicideIdeationHistory = "none" | "past" | "during_admission" | "current"
export const SUICIDE_HISTORY_LABELS: Record<SuicideIdeationHistory, string> = {
  none: "없음",
  past: "과거에 있었음",
  during_admission: "입원 중 있었음",
  current: "현재 있음",
}

export type ProgramStatus = "active" | "completed" | "withdrawn"
export const PROGRAM_STATUS_LABELS: Record<ProgramStatus, string> = {
  active: "진행 중",
  completed: "종결",
  withdrawn: "중단",
}

export type EmotionalTone =
  | "engaged"
  | "resistant"
  | "low"
  | "volatile"
  | "neutral"
export const EMOTIONAL_TONE_LABELS: Record<EmotionalTone, string> = {
  engaged: "참여적",
  resistant: "저항적",
  low: "저조",
  volatile: "불안정",
  neutral: "보통",
}

export type Comorbidity =
  | "depression"
  | "anxiety"
  | "insomnia"
  | "ptsd"
  | "bipolar"
  | "other"

export const COMORBIDITY_OPTIONS: { value: Comorbidity; label: string }[] = [
  { value: "depression", label: "우울" },
  { value: "anxiety", label: "불안" },
  { value: "insomnia", label: "불면" },
  { value: "ptsd", label: "PTSD" },
  { value: "bipolar", label: "양극성장애" },
  { value: "other", label: "기타" },
]

export const COMORBIDITY_LABELS: Record<Comorbidity, string> =
  Object.fromEntries(COMORBIDITY_OPTIONS.map((o) => [o.value, o.label])) as Record<
    Comorbidity,
    string
  >

export type SsoRelationship =
  | "spouse"
  | "parent"
  | "sibling"
  | "child"
  | "friend"
  | "other"

export const RELATIONSHIP_OPTIONS: { value: SsoRelationship; label: string }[] = [
  { value: "spouse", label: "배우자" },
  { value: "parent", label: "부모" },
  { value: "sibling", label: "형제·자매" },
  { value: "child", label: "자녀" },
  { value: "friend", label: "친구" },
  { value: "other", label: "기타" },
]

export const RELATIONSHIP_LABELS: Record<SsoRelationship, string> =
  Object.fromEntries(RELATIONSHIP_OPTIONS.map((o) => [o.value, o.label])) as Record<
    SsoRelationship,
    string
  >

export const MEDICATION_PRESETS = [
  { name: "날트렉손", dose: "50mg", frequency: "1x daily" },
  { name: "아캄프로세이트", dose: "666mg", frequency: "3x daily" },
  { name: "디설피람", dose: "250mg", frequency: "1x daily" },
] as const
