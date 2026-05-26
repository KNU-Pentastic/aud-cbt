/**
 * 인메모리 액세스 토큰 홀더.
 *
 * 순환 import를 피하기 위한 작은 모듈입니다.
 *  - useAuthStore: 로그인/부트스트랩/로그아웃 시 setToken() 으로 갱신
 *  - lib/api.ts: 인증이 필요한 요청에서 getToken() 으로 읽음
 *  - 401 콜백: useAuthStore.bootstrap 에서 setUnauthorizedHandler 로 등록,
 *    lib/api.ts 가 401 응답 수신 시 notifyUnauthorized 로 트리거.
 *
 * 영속화(SecureStore)는 useAuthStore가 담당합니다.
 */
let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function getToken(): string | null {
  return accessToken;
}

export function setToken(token: string | null): void {
  accessToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}
