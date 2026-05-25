/**
 * 인메모리 액세스 토큰 홀더.
 *
 * 순환 import를 피하기 위한 작은 모듈입니다.
 *  - useAuthStore: 로그인/부트스트랩/로그아웃 시 setToken() 으로 갱신
 *  - lib/api.ts: 인증이 필요한 요청에서 getToken() 으로 읽음
 *
 * 영속화(SecureStore)는 useAuthStore가 담당합니다.
 */
let accessToken: string | null = null;

export function getToken(): string | null {
  return accessToken;
}

export function setToken(token: string | null): void {
  accessToken = token;
}
