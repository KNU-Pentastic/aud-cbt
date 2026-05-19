import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function makeDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')} (${weekday})`;
}

export function makeTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type DailyNote = {
  date: string;       // YYYY-MM-DD
  dateLabel: string;  // 사용자가 수정 가능한 표시 문자열
  content: string;
  updatedAt: string;
};

type NoteState = {
  notes: Record<string, DailyNote>;
  saveNote: (date: string, updates: Partial<Pick<DailyNote, 'content' | 'dateLabel'>>) => void;
  deleteNote: (date: string) => void;
};

export const useNoteStore = create<NoteState>()(
  persist(
    (set, get) => ({
      notes: {},
      saveNote: (date, updates) => {
        const existing = get().notes[date];
        const note: DailyNote = existing
          ? { ...existing, ...updates, updatedAt: new Date().toISOString() }
          : {
              date,
              dateLabel: makeDateLabel(date),
              content: '',
              updatedAt: new Date().toISOString(),
              ...updates,
            };
        set((state) => ({ notes: { ...state.notes, [date]: note } }));
      },
      deleteNote: (date) => {
        set((state) => {
          const next = { ...state.notes };
          delete next[date];
          return { notes: next };
        });
      },
    }),
    {
      name: '@cbt_notes',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export type YearMonthSection = {
  title: string;
  key: string;
  data: DailyNote[];
};

export function getSections(notes: Record<string, DailyNote>): YearMonthSection[] {
  const all = Object.values(notes).sort((a, b) => b.date.localeCompare(a.date));
  const groups: Record<string, DailyNote[]> = {};

  all.forEach((note) => {
    const [y, m] = note.date.split('-');
    const key = `${y}-${m}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(note);
  });

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, data]) => {
      const [y, m] = key.split('-');
      return { key, title: `${y}년 ${Number(m)}월`, data };
    });
}
