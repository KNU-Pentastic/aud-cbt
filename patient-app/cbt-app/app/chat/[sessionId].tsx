import {
  View, FlatList, StyleSheet, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useChatStore } from '@/store/useChatStore';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { StageIndicator } from '@/components/chat/StageIndicator';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { ChatInput } from '@/components/chat/ChatInput';
import { colors } from '@/constants/theme';

export default function ChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const startNewSession = useChatStore((s) => s.startNewSession);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const completeSession = useChatStore((s) => s.completeSession);
  const isTyping = useChatStore((s) => s.isTyping);
  const session = useChatStore((s) =>
    sessionId && sessionId !== 'new' ? s.sessions[sessionId] : null
  );

  useEffect(() => {
    if (sessionId === 'new') {
      const newId = startNewSession();
      router.replace(`/chat/${newId}`);
    }
  }, []);

  if (sessionId === 'new' || !session) {
    return <View style={styles.blank} />;
  }

  const handleSend = (text: string) => {
    sendMessage(session.id, text);
  };

  const handleEnd = () => {
    Alert.alert(
      '대화 종료',
      '오늘의 대화를 마무리할까요?',
      [
        { text: '계속하기', style: 'cancel' },
        {
          text: '종료',
          style: 'destructive',
          onPress: () => {
            completeSession(session.id);
            router.back();
          },
        },
      ]
    );
  };

  const reversedMessages = [...session.messages].reverse();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ChatHeader
        sessionNumber={session.sessionNumber}
        onBack={() => router.back()}
        onEnd={handleEnd}
      />
      <StageIndicator stage={session.stage} />

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
          ListHeaderComponent={isTyping ? <TypingIndicator /> : null}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
        />
        <ChatInput onSend={handleSend} disabled={isTyping || session.isComplete} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
