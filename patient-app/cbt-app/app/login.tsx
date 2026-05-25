import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/useAuthStore';
import { ApiError } from '@/lib/api';
import { colors, spacing, radius } from '@/constants/theme';

type Mode = 'register' | 'login';

export default function LoginScreen() {
  const register = useAuthStore((s) => s.register);
  const login = useAuthStore((s) => s.login);

  const [mode, setMode] = useState<Mode>('register');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const codeValid = /^[A-Z0-9]{8}$/.test(code);
  const pinValid = /^[0-9]{6}$/.test(pin);
  const canSubmit = codeValid && pinValid && !submitting;

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
});
