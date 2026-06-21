import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/constants/theme';

type Props = {
  sessionNumber: number;
  onBack: () => void;
  onLeave: () => void;
};

export function ChatHeader({ sessionNumber, onBack, onLeave }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </Pressable>
        <View>
          <Text style={styles.title}>세션 {sessionNumber}</Text>
          <Text style={styles.subtitle}>핵심 콘텐츠</Text>
        </View>
      </View>

      <Pressable
        onPress={onLeave}
        hitSlop={8}
        style={({ pressed }) => [pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="stop-circle-outline" size={22} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 28 },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 1,
  },
});
