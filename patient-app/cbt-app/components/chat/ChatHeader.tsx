import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/constants/theme';

type Props = {
  sessionNumber: number;
  onBack: () => void;
  onEnd: () => void;
};

export function ChatHeader({ sessionNumber, onBack, onEnd }: Props) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
        <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
      </Pressable>

      <Text style={styles.title}>세션 {sessionNumber}</Text>

      <Pressable
        onPress={onEnd}
        style={({ pressed }) => [styles.endBtn, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.endText}>종료</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  iconBtn: { width: 32 },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  endBtn: {
    backgroundColor: colors.coralSofter,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 99,
  },
  endText: { fontSize: 12, fontWeight: '600', color: colors.coral },
});
