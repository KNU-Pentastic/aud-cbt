import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message } from '@/store/useChatStore';
import { colors, radius } from '@/constants/theme';

type Props = { message: Message };

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <View style={styles.rowUser}>
        <View style={[styles.bubble, styles.bubbleUser]}>
          <Text style={styles.textUser}>{message.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rowAssistant}>
      <View style={styles.avatarCircle}>
        <Ionicons name="leaf-outline" size={16} color={colors.coral} />
      </View>
      <View style={[styles.bubble, styles.bubbleAssistant]}>
        <Text style={styles.textAssistant}>{message.content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowUser: {
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  rowAssistant: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
  },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.coralSoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  bubbleUser: {
    backgroundColor: colors.coral,
    borderRadius: radius.card,
    borderTopRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 4,
    borderTopRightRadius: radius.card,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  textUser: { fontSize: 13, color: colors.textOnDark, lineHeight: 20 },
  textAssistant: { fontSize: 13, color: colors.textPrimary, lineHeight: 20 },
});
