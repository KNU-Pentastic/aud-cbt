import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { api } from '@/lib/api';
import { getToken, setToken, setUnauthorizedHandler } from '@/lib/authToken';

const TOKEN_KEY = 'cbt_access_token';

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type AuthState = {
  /** 'loading' = 부트스트랩 중, 그 외는 인증 여부 확정 */
  status: 'loading' | 'authenticated' | 'unauthenticated';
  /** 앱 시작 시 SecureStore 에서 토큰 복원 */
  bootstrap: () => Promise<void>;
  /** 등록 코드 + PIN 으로 최초 등록 (코드 소비됨) */
  register: (registrationCode: string, pin: string) => Promise<void>;
  /** 등록 코드 + PIN 으로 로그인 */
  login: (registrationCode: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
};

async function persistToken(token: string): Promise<void> {
  setToken(token);
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',

  bootstrap: async () => {
    // 401 응답을 받으면 토큰을 폐기하고 로그인 화면으로 복귀시킨다.
    // (lib/api.ts → notifyUnauthorized → 아래 핸들러)
    setUnauthorizedHandler(() => {
      setToken(null);
      SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      set({ status: 'unauthenticated' });
    });

    try {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY);
      if (stored) {
        setToken(stored);
        set({ status: 'authenticated' });
        return;
      }
    } catch {
      /* SecureStore 접근 실패 시 비로그인으로 간주 */
    }
    set({ status: 'unauthenticated' });
  },

  register: async (registrationCode, pin) => {
    const res = await api.post<TokenResponse>(
      '/auth/patient/register',
      { registration_code: registrationCode, pin },
      { auth: false }
    );
    await persistToken(res.access_token);
    set({ status: 'authenticated' });
  },

  login: async (registrationCode, pin) => {
    const res = await api.post<TokenResponse>(
      '/auth/patient/login',
      { registration_code: registrationCode, pin },
      { auth: false }
    );
    await persistToken(res.access_token);
    set({ status: 'authenticated' });
  },

  logout: async () => {
    try {
      if (getToken()) await api.post('/auth/logout', undefined);
    } catch {
      /* 로그아웃은 클라이언트 토큰 폐기로 충분 (v3.0: 서버 블랙리스트 없음) */
    }
    setToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ status: 'unauthenticated' });
  },
}));
