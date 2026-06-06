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

  // 나가기는 대화를 끝내지 않는다 — 세션 종료 여부는 LLM 이 판단한다.
  // (대화는 active 로 유지되어 다시 들어오면 이전 내용이 그대로 복원된다.)
  const handleLeave = () => {
    router.back();
  };

  const reversedMessages = [...session.messages].reverse();
  // 어시스턴트 응답 도착 전(스트리밍 버블 생성 전)에만 타이핑 표시
  const showTyping = isTyping && !session.messages.some((m) => m.streaming);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ChatHeader
        sessionNumber={session.sessionNumber}
        onBack={() => router.back()}
        onLeave={handleLeave}
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
            <Text style={styles.completeText}>오늘 세션이 마무리되었어요. 수고하셨어요 🌿</Text>
          </View>
        ) : (
          <ChatInput onSend={handleSend} disabled={isTyping} />
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
});
