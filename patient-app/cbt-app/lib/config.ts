import { Platform } from 'react-native';

/**
 * 백엔드 API의 베이스 URL.
 *
 * 우선순위:
 *  1) 환경변수 EXPO_PUBLIC_API_URL (예: https://api.example.com/v1)
 *  2) 플랫폼별 기본값 (로컬 개발)
 *     - Android 에뮬레이터: 호스트 PC = 10.0.2.2
 *     - iOS 시뮬레이터/웹: localhost
 *
 * 실기기에서 테스트할 때는 EXPO_PUBLIC_API_URL 에 PC의 LAN IP를 넣어주세요.
 * (예: EXPO_PUBLIC_API_URL=http://192.168.0.10:8000/v1)
 */
function resolveApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${host}:8000/v1`;
}

export const API_BASE = resolveApiBase();
