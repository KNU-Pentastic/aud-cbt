import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/useAuthStore';
import { ApiError } from '@/lib/api';
import { colors, spacing, radius } from '@/constants/theme';
import ConsentSheet from '@/components/ConsentSheet';

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
  const [consentVisible, setConsentVisible] = useState(false);

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

  // 회원가입은 개인정보 수집동의 화면을 거친 뒤 실제 가입을 진행한다.
  const handleSubmit = () => {
    if (!canSubmit) return;
    if (mode === 'register') {
      setConsentVisible(true);
      return;
    }
    void performAuth();
  };

  // 실제 자격 증명으로 등록/로그인을 수행한다.
  const performAuth = async () => {
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

  const handleConsentAgree = () => {
    setConsentVisible(false);
    void performAuth();
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
        </ScrollView>
      </KeyboardAvoidingView>

      <ConsentSheet
        visible={consentVisible}
        onClose={() => setConsentVisible(false)}
        onAgree={handleConsentAgree}
      />
    </SafeAreaView>
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
});
