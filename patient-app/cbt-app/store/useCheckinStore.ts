import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Checkin = {
  id: string;
  date: string;       // YYYY-MM-DD
  mood: number;       // 0-10
  craving: number;    // 0-10
  sleepQuality: number; // 0-10
  tookMedication: boolean;
  createdAt: string;  // ISO
};

export type CheckinInput = Omit<Checkin, 'id' | 'date' | 'createdAt'>;

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type CheckinState = {
  checkins: Checkin[];
  submitCheckin: (data: CheckinInput) => Checkin;
};

export const useCheckinStore = create<CheckinState>()(
  persist(
    (set, get) => ({
      checkins: [],
      submitCheckin: (data) => {
        const today = todayKey();
        const existing = get().checkins.find((c) => c.date === today);

        if (existing) {
          // 같은 날이면 수정
          const updated: Checkin = { ...existing, ...data };
          set((state) => ({
            checkins: state.checkins.map((c) =>
              c.id === existing.id ? updated : c
            ),
          }));
          return updated;
        }

        // 새 체크인
        const newCheckin: Checkin = {
          id: Date.now().toString(),
          date: today,
          createdAt: new Date().toISOString(),
          ...data,
        };
        set((state) => ({
          checkins: [...state.checkins, newCheckin],
        }));
        return newCheckin;
      },
    }),
    {
      name: '@cbt_checkins',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// 오늘 체크인 정보를 가져오는 셀렉터 훅
export function useTodayCheckin(): Checkin | null {
  return useCheckinStore((s) =>
    s.checkins.find((c) => c.date === todayKey()) ?? null
  );
}
