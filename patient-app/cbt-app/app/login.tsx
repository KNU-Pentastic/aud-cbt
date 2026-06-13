import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
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

export default function LoginScreen() {
  const register = useAuthStore((s) => s.register);
  const login = useAuthStore((s) => s.login);
  const googleSignIn = useAuthStore((s) => s.googleSignIn);

  const [mode, setMode] = useState<Mode>('register');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const codeValid = /^[A-Z0-9]{8}$/.test(code);
  const pinValid = /^[0-9]{6}$/.test(pin);
  const canSubmit = codeValid && pinValid && !submitting;

  // OAuth 2.1 Authorization Code + PKCE. 성공 시 id_token 을 백엔드로 보낸다.
  const [, googleResponse, promptGoogle] = Google.useAuthRequest({
    iosClientId: GOOGLE_OAUTH.iosClientId,
    androidClientId: GOOGLE_OAUTH.androidClientId,
    webClientId: GOOGLE_OAUTH.webClientId,
    scopes: ['openid', 'email', 'profile'],
  });

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'success') {
      if (googleResponse.type === 'error') {
        setGoogleBusy(false);
        Alert.alert('구글 로그인 실패', '다시 시도해주세요.');
      } else {
        setGoogleBusy(false); // dismiss/cancel
      }
      return;
    }
    const idToken =
      googleResponse.authentication?.idToken ??
      (googleResponse.params?.id_token as string | undefined);
    if (!idToken) {
      setGoogleBusy(false);
      Alert.alert('구글 로그인 실패', 'id_token 을 받지 못했어요.');
      return;
    }
    (async () => {
      try {
        // 최초 연동이면 등록 코드로 신원을 바인딩한다(이미 연동된 계정은 코드 무시).
        await googleSignIn(idToken, codeValid ? code : undefined);
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
        setGoogleBusy(false);
      }
    })();
  }, [googleResponse]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogle = async () => {
    setGoogleBusy(true);
    try {
      await promptGoogle();
    } catch {
      setGoogleBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await register(code, pin);
      } else {
        await login(code, pin);
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
        <View style={styles.body}>
          <Text style={styles.title}>함께 회복을 시작해요</Text>
          <Text style={styles.subtitle}>
            {mode === 'register'
              ? '의료진에게 받은 등록 코드와\n사용할 PIN 6자리를 입력해주세요.'
              : '등록 코드와 PIN을 입력해주세요.'}
          </Text>

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
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>또는</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                onPress={handleGoogle}
                disabled={googleBusy || submitting}
                style={[styles.googleBtn, (googleBusy || submitting) && styles.googleBtnDisabled]}
              >
                {googleBusy ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <Text style={styles.googleText}>구글로 계속하기</Text>
                )}
              </Pressable>

              {mode === 'register' && (
                <Text style={styles.googleHint}>
                  처음이라면 위에 등록 코드를 입력한 뒤 구글로 계속하기를 눌러주세요.
                </Text>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl },
  title: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 32,
  },
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
