import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SobrietyProvider } from '@/context/SobrietyContext';
import { useAuthStore } from '@/store/useAuthStore';
import { colors } from '@/constants/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60,
    },
  },
});

/** 인증 상태에 따라 로그인 화면 ↔ 앱 화면을 전환하는 게이트 */
function useAuthGate() {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();
  const prevStatus = useRef(status);

  useEffect(() => {
    useAuthStore.getState().bootstrap();
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    const onLogin = (segments[0] as string) === 'login';
    // authenticated → unauthenticated 전이(로그아웃/401 만료) 시
    // 이전 사용자의 React Query 캐시를 폐기한다.
    if (prevStatus.current === 'authenticated' && status === 'unauthenticated') {
      queryClient.clear();
    }
    prevStatus.current = status;
    if (status === 'unauthenticated' && !onLogin) {
      router.replace('/login' as any);
    } else if (status === 'authenticated' && onLogin) {
      router.replace('/');
    }
  }, [status, segments]);

  return status;
}

export default function RootLayout() {
  const status = useAuthGate();

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.coral} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <SobrietyProvider>
          <Stack>
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="conversation" options={{ headerShown: false }} />
            <Stack.Screen name="safety" options={{ headerShown: false }} />
            <Stack.Screen name="progress" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="checkin" options={{ headerShown: false }} />
            <Stack.Screen name="chat" options={{ headerShown: false }} />
            <Stack.Screen name="notes" options={{ headerShown: false }} />
            <Stack.Screen name="addiction-centers" options={{ headerShown: false }} />
          </Stack>
        </SobrietyProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
