import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuthStore } from '@/store/useAuthStore';
import { ApiError } from '@/lib/api';
import { GOOGLE_OAUTH, GOOGLE_OAUTH_ENABLED } from '@/lib/config';
import { colors, spacing, radius } from '@/constants/theme';

// 구글 로그인 후 인앱 브라우저 세션을 정리한다(리다이렉트 완료 처리).
WebBrowser.maybeCompleteAuthSession();

type Mode = 'register' | 'login';
type Method = 'pin' | 'email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const register = useAuthStore((s) => s.register);
  const login = useAuthStore((s) => s.login);
  const emailRegister = useAuthStore((s) => s.emailRegister);
  const emailLogin = useAuthStore((s) => s.emailLogin);

  const [mode, setMode] = useState<Mode>('register');
  const [method, setMethod] = useState<Method>('pin');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const codeValid = /^[A-Z0-9]{8}$/.test(code);
  const pinValid = /^[0-9]{6}$/.test(pin);
  const emailValid = EMAIL_RE.test(email.trim());
  const passwordValid = password.length >= 8;

  // 등록 코드는 회원가입(항상)과, 로그인 중 코드+PIN 방식에서만 필요하다.
  const needsCode = mode === 'register' || method === 'pin';

  const canSubmit =
    !submitting &&
    (needsCode ? codeValid : true) &&
    (method === 'pin' ? pinValid : emailValid && passwordValid);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (mode === 'register') {
        if (method === 'pin') await register(code, pin);
        else await emailRegister(code, email.trim(), password);
      } else {
        if (method === 'pin') await login(code, pin);
        else await emailLogin(email.trim(), password);
      }
      // 성공 시 루트 레이아웃의 인증 게이트가 자동으로 앱 화면으로 이동시킴
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : '문제가 발생했어요. 다시 시도해주세요.';
      Alert.alert(mode === 'register' ? '등록 실패' : '로그인 실패', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>함께 회복을 시작해요</Text>
          <Text style={styles.subtitle}>
            {mode === 'register'
              ? '의료진에게 받은 등록 코드로 가입해요.\nPIN 또는 이메일 방식을 선택할 수 있어요.'
              : '가입한 방식으로 로그인해주세요.'}
          </Text>

          {/* 자격 증명 방식 선택 */}
          <View style={styles.segment}>
            <Pressable
              onPress={() => setMethod('pin')}
              style={[styles.segmentBtn, method === 'pin' && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, method === 'pin' && styles.segmentTextActive]}>
                코드 + PIN
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMethod('email')}
              style={[styles.segmentBtn, method === 'email' && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, method === 'email' && styles.segmentTextActive]}>
                이메일
              </Text>
            </Pressable>
          </View>

          {needsCode && (
            <>
              <Text style={styles.label}>등록 코드</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                placeholder="영문/숫자 8자리"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
              />
            </>
          )}

          {method === 'pin' ? (
            <>
              <Text style={styles.label}>PIN (숫자 6자리)</Text>
              <TextInput
                style={styles.input}
                value={pin}
                onChangeText={(t) => setPin(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="••••••"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>이메일</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <Text style={styles.label}>비밀번호 (8자 이상)</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                textContentType={mode === 'register' ? 'newPassword' : 'password'}
              />
            </>
          )}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[styles.submitBtn, canSubmit ? styles.submitActive : styles.submitDisabled]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>
                {mode === 'register' ? '시작하기' : '로그인'}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => setMode(mode === 'register' ? 'login' : 'register')}
            style={styles.switchBtn}
            hitSlop={8}
          >
            <Text style={styles.switchText}>
              {mode === 'register'
                ? '이미 등록했어요 · 로그인하기'
                : '처음이신가요? · 등록하기'}
            </Text>
          </Pressable>

          {GOOGLE_OAUTH_ENABLED && (
            <GoogleAuthButton
              registrationCode={codeValid ? code : undefined}
              disabled={submitting}
              showHint={mode === 'register'}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * 구글 로그인 버튼 — Google.useAuthRequest 훅을 품고 있다.
 *
 * 이 훅은 현재 플랫폼의 client ID 가 없으면 즉시 throw 하므로, 부모는 반드시
 * GOOGLE_OAUTH_ENABLED 가 true 일 때만 이 컴포넌트를 렌더해야 한다(훅은 조건부
 * 호출이 불가능하므로 '조건부 렌더되는 자식'으로 격리한다).
 */
function GoogleAuthButton({
  registrationCode,
  disabled,
  showHint,
}: {
  registrationCode?: string;
  disabled?: boolean;
  showHint?: boolean;
}) {
  const googleSignIn = useAuthStore((s) => s.googleSignIn);
  const [busy, setBusy] = useState(false);

  // OAuth 2.1 Authorization Code + PKCE. 네이티브에서는 라이브러리가 코드를
  // 자동 교환해 response.params.id_token 을 채운다. 성공 시 백엔드로 전달.
  const [, response, promptAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_OAUTH.iosClientId,
    androidClientId: GOOGLE_OAUTH.androidClientId,
    webClientId: GOOGLE_OAUTH.webClientId,
    scopes: ['openid', 'email', 'profile'],
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'error') {
      setBusy(false);
      // 실제 원인(redirect_uri_mismatch 등)을 그대로 노출해 진단을 돕는다.
      const detail =
        response.error?.message ??
        (response.params?.error_description as string | undefined) ??
        (response.params?.error as string | undefined);
      Alert.alert('구글 로그인 실패', detail || '다시 시도해주세요.');
      return;
    }
    if (response.type !== 'success') {
      setBusy(false); // dismiss / cancel / locked
      return;
    }
    const idToken =
      response.authentication?.idToken || (response.params?.id_token as string | undefined);
    if (!idToken) {
      setBusy(false);
      Alert.alert(
        '구글 로그인 실패',
        'id_token 을 받지 못했어요. 구글 클라이언트 ID(플랫폼·리다이렉트) 설정을 확인해주세요.'
      );
      return;
    }
    (async () => {
      try {
        // 최초 연동이면 등록 코드로 신원을 바인딩한다(이미 연동된 계정은 코드 무시).
        await googleSignIn(idToken, registrationCode);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'OAUTH_LINK_REQUIRED') {
          Alert.alert(
            '등록 코드가 필요해요',
            '처음 구글로 가입할 때는 의료진에게 받은 등록 코드를 먼저 입력한 뒤 다시 시도해주세요.'
          );
        } else {
          const msg = e instanceof ApiError ? e.message : '구글 로그인에 실패했어요.';
          Alert.alert('구글 로그인 실패', msg);
        }
      } finally {
        setBusy(false);
      }
    })();
  }, [response]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPress = async () => {
    setBusy(true);
    try {
      const res = await promptAsync();
      // 성공(코드 수신)이면 자동 교환→effect 에서 마무리하므로 busy 유지.
      // 취소·실패면 즉시 해제(effect 가 success 외에도 해제하지만 안전망).
      if (!res || res.type !== 'success') setBusy(false);
    } catch {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>또는</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        onPress={onPress}
        disabled={busy || disabled}
        style={[styles.googleBtn, (busy || disabled) && styles.googleBtnDisabled]}
      >
        {busy ? (
          <ActivityIndicator color={colors.textPrimary} />
        ) : (
          <Text style={styles.googleText}>구글로 계속하기</Text>
        )}
      </Pressable>

      {showHint && (
        <Text style={styles.googleHint}>
          처음이라면 위에 등록 코드를 입력한 뒤 구글로 계속하기를 눌러주세요.
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 24,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.borderSoft,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: 22,
  },
  segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.sm, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.surface },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  segmentTextActive: { color: colors.textPrimary },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    letterSpacing: 1,
  },
  submitBtn: {
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: 8,
  },
  submitActive: { backgroundColor: colors.coral },
  submitDisabled: { backgroundColor: colors.borderSoft },
  submitText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  switchBtn: { marginTop: 20, alignItems: 'center' },
  switchText: { fontSize: 13, color: colors.sageDark, fontWeight: '500' },
  divider: { flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 16 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { marginHorizontal: 12, fontSize: 12, color: colors.textTertiary },
  googleBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  googleBtnDisabled: { opacity: 0.6 },
  googleText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  googleHint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
