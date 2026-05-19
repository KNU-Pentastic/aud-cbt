import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@cbt_sobriety_state';
const MILESTONES = [1, 7, 14, 30, 60, 90, 180, 365];

type SobrietyState = {
  days: number;
  bestStreak: number;
  lastCompletedDate: string | null;
  goal: number;
  isLoading: boolean;
  incrementDay: () => Promise<boolean>;
};

const SobrietyContext = createContext<SobrietyState | undefined>(undefined);

export function SobrietyProvider({ children }: { children: ReactNode }) {
  const [days, setDays] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [lastCompletedDate, setLastCompletedDate] = useState<string | null>(null);
  const [goal, setGoal] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadState();
  }, []);

  async function loadState() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setDays(parsed.days ?? 0);
        setBestStreak(parsed.bestStreak ?? 0);
        setLastCompletedDate(parsed.lastCompletedDate ?? null);
        setGoal(parsed.goal ?? 1);
      }
    } catch (e) {
      console.error('Failed to load sobriety state:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveState(state: {
    days: number;
    bestStreak: number;
    lastCompletedDate: string;
    goal: number;
  }) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save sobriety state:', e);
    }
  }

  async function incrementDay(): Promise<boolean> {
    const today = new Date().toDateString();

    // 같은 날 두 번 적용 방지
    if (lastCompletedDate === today) {
      return false;
    }

    const newDays = days + 1;
    const newBestStreak = Math.max(bestStreak, newDays);
    const newGoal = MILESTONES.find((m) => m > newDays) ?? newDays + 30;

    setDays(newDays);
    setBestStreak(newBestStreak);
    setLastCompletedDate(today);
    setGoal(newGoal);

    await saveState({
      days: newDays,
      bestStreak: newBestStreak,
      lastCompletedDate: today,
      goal: newGoal,
    });

    return true;
  }

  return (
    <SobrietyContext.Provider
      value={{ days, bestStreak, lastCompletedDate, goal, isLoading, incrementDay }}
    >
      {children}
    </SobrietyContext.Provider>
  );
}

export function useSobriety() {
  const context = useContext(SobrietyContext);
  if (!context) {
    throw new Error('useSobriety must be used within SobrietyProvider');
  }
  return context;
}
