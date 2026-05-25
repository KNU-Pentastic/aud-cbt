/** 백엔드 응답 타입 (backend/app/schemas 기준, 환자용 엔드포인트). */

export type TodayTasks = {
  checkin_pending: boolean;
  session_today: boolean;
};

export type PatientHome = {
  patient_id: string;
  name: string;
  sobriety_days: number;
  current_week: number;
  days_to_next_session: number | null;
  today_tasks: TodayTasks;
  next_outpatient_date: string | null;
  llm_locked: boolean;
};

export type Progress = {
  sobriety_days: number;
  weeks_completed: number;
  current_week: number;
  next_session_date: string | null;
};

export type MedicationRecord = {
  medication_name: string;
  taken: boolean;
  side_effect_note?: string | null;
};

export type CheckinOut = {
  checkin_id: string;
  date: string;
  mood_nrs: number;
  craving_nrs: number;
  sleep_hours: number;
  medication_records: MedicationRecord[];
  free_note: string | null;
  submitted_at: string;
};

export type SafetyGrade = 'A' | 'B';
export type SafetyEventType =
  | 'suicide_risk'
  | 'acute_intoxication'
  | 'relapse'
  | 'medication_stop'
  | 'paws';

export type SafetyClassification = {
  grade: SafetyGrade;
  event_type: SafetyEventType;
  next_action: string;
};

export type CheckinSubmit = {
  mood_nrs: number;
  craving_nrs: number;
  sleep_hours: number;
  medication_records: MedicationRecord[];
  free_note?: string | null;
};

export type CheckinResponse = {
  checkin: CheckinOut;
  safety_classification: SafetyClassification | null;
};

export type SsoRelationship =
  | 'spouse'
  | 'parent'
  | 'sibling'
  | 'child'
  | 'friend'
  | 'other';

export type SupportPerson = {
  sso_id: string;
  name: string;
  relationship: SsoRelationship;
  phone: string;
  access_level?: 'info_only';
};

export type Settings = {
  daily_checkin_time: string; // "HH:MM"
  session_day_of_week: number; // 0=월 ~ 6=일
  sso: SupportPerson | null;
};

export type SettingsPatch = {
  daily_checkin_time?: string;
  session_day_of_week?: number;
};

export type Paginated<T> = {
  items: T[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
};
