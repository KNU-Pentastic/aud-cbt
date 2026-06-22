/**
 * 플랫폼 무관 확인 다이얼로그.
 *
 * - 네이티브(iOS/Android): RN `Alert.alert` 의 취소/확인 2버튼.
 * - 웹: React Native Web 은 `Alert.alert` 를 구현하지 않아 *호출이 no-op* 이다.
 *   확인 다이얼로그가 뜨지 않고 onPress 콜백도 절대 실행되지 않으므로
 *   (로그아웃·삭제 버튼이 "먹통"이 되는 원인), 브라우저 `window.confirm` 으로 대체한다.
 *
 * @returns 사용자가 확인을 누르면 true, 취소면 false.
 */
import { Alert, Platform } from 'react-native';

type ConfirmOptions = {
  confirmText?: string;
  cancelText?: string;
  /** 확인 버튼을 파괴적(빨강) 스타일로. 네이티브에서만 의미가 있다. */
  destructive?: boolean;
};

export function confirmAsync(
  title: string,
  message?: string,
  options: ConfirmOptions = {}
): Promise<boolean> {
  const { confirmText = '확인', cancelText = '취소', destructive = false } = options;

  if (Platform.OS === 'web') {
    // window.confirm 은 제목/본문 구분이 없어 한 문자열로 합친다.
    // 비브라우저(SSR 등) 컨텍스트에서는 막을 수 없으니 진행(true)으로 간주한다.
    const text = message ? `${title}\n\n${message}` : title;
    const canPrompt =
      typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function';
    return Promise.resolve(canPrompt ? globalThis.confirm(text) : true);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

/**
 * 플랫폼 무관 단일 버튼 안내 다이얼로그.
 *
 * `confirmAsync` 와 같은 이유로 웹에서는 `Alert.alert` 가 동작하지 않는다.
 * "확인을 누르면 화면 이동" 같은 후처리가 콜백에 묶여 있으면 웹에서 그 후처리가
 * 통째로 사라지므로(사용자가 화면에 갇힘), 반드시 await 로 다음 동작을 이어준다.
 *
 * @returns 사용자가 확인을 누르면(또는 웹에서 alert 가 닫히면) resolve.
 */
export function alertAsync(title: string, message?: string): Promise<void> {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
      globalThis.alert(text);
    }
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: '확인', onPress: () => resolve() }]);
  });
}
