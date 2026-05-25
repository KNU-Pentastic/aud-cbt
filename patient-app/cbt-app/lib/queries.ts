import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { PatientHome, Progress, Settings } from './api-types';

export const queryKeys = {
  home: ['patient-home'] as const,
  progress: ['progress'] as const,
  settings: ['settings'] as const,
};

export function usePatientHome() {
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: () => api.get<PatientHome>('/me/patient'),
  });
}

export function useProgress() {
  return useQuery({
    queryKey: queryKeys.progress,
    queryFn: () => api.get<Progress>('/me/progress'),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.get<Settings>('/me/settings'),
  });
}

/** 다음 단주 마일스톤(목표) 계산 */
const MILESTONES = [7, 14, 30, 60, 90, 180, 365];
export function nextMilestone(days: number): number {
  return MILESTONES.find((m) => m > days) ?? days + 30;
}

/** Project MATCH 12주 구조 기반 주차 주제 (P1/P5 표시용) */
const WEEK_TITLES: Record<number, string> = {
  1: '도입과 동기',
  2: '갈망 다스리기',
  3: '음주 거절 기술',
  4: '사고 관리',
  5: '문제 해결',
  6: '생활 균형',
  7: '응급 상황 대비',
  8: '무관해 보이는 결정(SID)',
  9: '대인관계 기술',
  10: '감정 다루기',
  11: '지지 체계 다지기',
  12: '종결과 재발 방지 계획',
};
export function weekTitle(week: number): string {
  return WEEK_TITLES[week] ?? `${week}주차 세션`;
}
