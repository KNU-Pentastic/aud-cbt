import {
  View, Text, FlatList, StyleSheet, Alert, Platform, KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useChatStore } from '@/store/useChatStore';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { TraceStrip } from '@/components/chat/TraceStrip';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { ChatInput } from '@/components/chat/ChatInput';
import { colors, spacing } from '@/constants/theme';

export default function ChatScreen() {
  const { sessionId, kind } = useLocalSearchParams<{ sessionId: string; kind?: string }>();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const creatingRef = useRef(false);

  const startNewSession = useChatStore((s) => s.startNewSession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const completeSession = useChatStore((s) => s.completeSession);
  const isTyping = useChatStore((s) => s.isTyping);
  const error = useChatStore((s) => s.error);
  const clearError = useChatStore((s) => s.clearError);
  const safetyTripped = useChatStore((s) => s.safetyTripped);
  const clearSafetyTrip = useChatStore((s) => s.clearSafetyTrip);
  const session = useChatStore((s) =>
    sessionId && sessionId !== 'new' ? s.sessions[sessionId] : null
  );

  // 'new' 진입 시 백엔드에 세션 생성/복원 후 실제 conversation_id 로 교체
  useEffect(() => {
    if (sessionId !== 'new' || creatingRef.current) return;
    creatingRef.current = true;
    (async () => {
      const newId = await startNewSession(kind === 'craving' ? 'craving' : 'session');
      if (newId) {
        router.replace(`/chat/${newId}`);
      } else if (useChatStore.getState().llmLocked) {
        router.replace('/safety');
      } else {
        Alert.alert('연결 실패', useChatStore.getState().error ?? '잠시 후 다시 시도해주세요.', [
          { text: '확인', onPress: () => router.back() },
        ]);
      }
    })();
  }, [sessionId]);

  // 등급 A 안전 신호 → P4 응급 안내로 강제 이동
  useEffect(() => {
    if (safetyTripped) {
      clearSafetyTrip();
      router.replace('/safety');
    }
  }, [safetyTripped]);

  // 스트림 오류는 알림으로 표시
  useEffect(() => {
    if (error && session) {
      Alert.alert('오류', error, [{ text: '확인', onPress: clearError }]);
    }
  }, [error]);

  if (sessionId === 'new' || !session) {
    return (
      <View style={styles.blank}>
        <ActivityIndicator color={colors.coral} />
        <Text style={styles.blankText}>대화를 준비하고 있어요...</Text>
      </View>
    );
  }

  const handleSend = (text: string) => {
    sendMessage(session.id, text);
  };

  // 뒤로가기는 대화를 끝내지 않는다 — 대화는 active 로 유지되어 다시 들어오면 이전
  // 내용이 그대로 복원된다. 세션 종료는 아래 '세션 마치기'로 사용자가 직접 한다.
  const handleBack = () => {
    router.back();
  };

  // 세션 마치기(수동 종료) — 자동 종료 대신 사용자가 직접 마무리한다. 마치면 이
  // 대화는 다시 이어갈 수 없으므로 한 번 확인한다.
  // 주의: React Native Web 에서는 Alert.alert 의 버튼 콜백이 호출되지 않아 버튼이
  // '안 먹는' 것처럼 보인다. 그래서 웹에서는 window.confirm 으로, 네이티브에서는
  // Alert.alert 으로 확인한다.
  const handleEndSession = () => {
    // 수동 종료 — 종료 시점은 사용자가 정한다(기능의 본래 취지). 언제든 마칠 수 있으므로
    // 이미 끝난 대화만 방어적으로 막는다. (예전엔 session_ready 신호 전엔 막았는데, 그
    // 게이트가 외부 LLM·네트워크 장애 때 버튼을 영구 비활성화시켜 실질적으로 끝난 세션을
    // 못 끝내는 함정이 됐다 — 주차 진행 여부는 서버가 current_step 으로 안전하게 결정한다.)
    if (session.isComplete) return;
    // 종료(/end)가 서버에서 확정된 뒤에만 로비(홈)로 복귀한다. await 후 이동해야 로비가
    // current-session 을 조회할 때 이 대화가 아직 active 로 보이는 레이스를 막는다.
    // 종료가 실패하면(false) 화면에 머무르고 오류 Alert(아래 useEffect)로 안내해, 거짓
    // 완료로 빠져나가지 않고 다시 '세션 마치기'로 재시도할 수 있게 한다.
    const endNow = async () => {
      const ok = await completeSession(session.id);
      if (ok) router.replace('/');
    };
    const title = '세션을 마칠까요?';
    const message =
      '마치면 오늘 대화는 다시 이어갈 수 없어요. 더 나누고 싶은 이야기가 있다면 계속하셔도 괜찮아요.';

    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false;
      if (ok) endNow();
      return;
    }

    Alert.alert(title, message, [
      { text: '계속하기', style: 'cancel' },
      { text: '세션 마치기', style: 'destructive', onPress: endNow },
    ]);
  };

  const reversedMessages = [...session.messages].reverse();
  // 어시스턴트 응답 도착 전(스트리밍 버블 생성 전)에만 타이핑 표시
  const showTyping = isTyping && !session.messages.some((m) => m.streaming);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ChatHeader
        sessionNumber={session.sessionNumber}
        onBack={handleBack}
        onEnd={handleEndSession}
        endEnabled={!session.isComplete}
      />

      <TraceStrip sessionId={session.id} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={reversedMessages}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListHeaderComponent={showTyping ? <TypingIndicator /> : null}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
        />
        {session.isComplete ? (
          <View style={styles.completeNotice}>
            <Text style={styles.completeText}>오늘 세션을 마쳤어요. 수고하셨어요 🌿</Text>
          </View>
        ) : (
          <>
            {session.readyToComplete && (
              <View style={styles.readyNotice}>
                <Text style={styles.readyText}>
                  오늘 다룰 내용은 마무리됐어요. 더 궁금한 점이 있으면 계속 이야기하고,
                  마치려면 상단의 ‘세션 마치기’를 눌러주세요.
                </Text>
              </View>
            )}
            <ChatInput onSend={handleSend} disabled={isTyping} />
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  blank: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  blankText: { fontSize: 13, color: colors.textSecondary },
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  completeNotice: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  completeText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  readyNotice: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  readyText: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
