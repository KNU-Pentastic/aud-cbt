import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * 백엔드 API의 베이스 URL.
 *
 * 우선순위:
 *  1) 환경변수 EXPO_PUBLIC_API_URL (예: https://api.example.com/v1)
 *  2) Expo dev (Expo Go / dev-client): Metro 의 hostUri 에서 호스트 자동 추출
 *     → 실기기에서도 .env 없이 같은 LAN의 PC 백엔드(8000)에 자동 연결
 *  3) 플랫폼별 fallback
 *     - Android 에뮬레이터: 호스트 PC = 10.0.2.2
 *     - iOS 시뮬레이터/웹: localhost
 *
 * 운영 빌드에서는 반드시 EXPO_PUBLIC_API_URL 을 지정해야 합니다.
 */
const API_PORT = 8000;
const API_PATH = '/v1';

function devHostFromExpo(): string | null {
  // 예: "172.30.1.79:8081" 또는 "172.30.1.79:8081/--/..." 형태
  const hostUri =
    Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.hostUri ?? null;
  if (!hostUri || typeof hostUri !== 'string') return null;
  const host = hostUri.split('/')[0]?.split(':')[0];
  return host && host.length > 0 ? host : null;
}

function resolveApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  const devHost = devHostFromExpo();
  if (devHost) {
    return `http://${devHost}:${API_PORT}${API_PATH}`;
  }
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${host}:${API_PORT}${API_PATH}`;
}

export const API_BASE = resolveApiBase();
