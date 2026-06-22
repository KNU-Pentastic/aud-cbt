/**
 * 플랫폼 무관 토큰 영속화.
 *
 * - 네이티브(iOS/Android): expo-secure-store (Keychain / Keystore)
 * - 웹: localStorage  (expo-secure-store 는 웹에서 메서드를 *호출*하면 예외를 던진다.
 *   모듈 import 자체는 웹에서 ExpoSecureStore.web → `export default {}` 로 해석되어
 *   안전하므로, Platform.OS 가드로 호출만 막으면 된다.)
 *
 * SecureStore 와 동일한 시그니처(getItemAsync/setItemAsync/deleteItemAsync)를 노출해
 * 호출부(useAuthStore)는 import 한 줄만 바꾸면 된다.
 *
 * 저장(set)·삭제(delete)는 양 플랫폼 모두 best-effort 다 — 실패해도 예외를 던지지 않는다.
 * 토큰의 1차 소스는 인메모리(authToken)이며 영속화는 보조 수단이므로, 키체인 일시
 * 오류가 로그인/로그아웃 흐름 자체를 막지 않도록 한다.
 *
 * 웹은 SecureStore 같은 OS 키체인이 없어 localStorage 로 대체한다. 데모/개발 환경
 * 기준이며, 운영 웹에서는 httpOnly 쿠키 등 더 강한 보관소를 고려해야 한다.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

/** 웹에서 SSR/비브라우저 컨텍스트를 대비해 안전하게 localStorage 를 얻는다. */
function webStorage(): Storage | null {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage ?? null : null;
  } catch {
    // 일부 환경(쿠키 차단 등)에서 localStorage 접근 자체가 예외를 던질 수 있다.
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return webStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb) {
    try {
      webStorage()?.setItem(key, value);
    } catch {
      /* 저장 실패해도 인메모리 토큰으로 현재 세션은 동작한다 */
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    /* 키체인 일시 오류로 로그인 흐름이 막히지 않도록 best-effort */
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb) {
    try {
      webStorage()?.removeItem(key);
    } catch {
      /* noop */
    }
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* 삭제 실패해도 로그아웃(인메모리 토큰 폐기)은 진행되어야 한다 */
  }
}
