import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';

type Props = { completed: boolean };

export function TodayCheckinCard({ completed }: Props) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push('/checkin')}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View
        style={[styles.iconBox, completed ? styles.iconBoxDone : styles.iconBoxTodo]}
      >
        <Ionicons
          name={completed ? 'checkmark-circle' : 'clipboard-outline'}
          size={22}
          color={completed ? colors.sageDark : colors.coral}
        />
      </View>

      <View style={styles.info}>
        <Text style={styles.label}>
          {completed ? '오늘의 체크인 완료' : '오늘의 체크인'}
        </Text>
        <Text style={styles.subtitle}>
          {completed ? '오늘 기록 완료 · 수정 가능' : '4개 항목 · 약 1분이면 끝나요'}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardPressed: { opacity: 0.7 },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBoxTodo: { backgroundColor: colors.coralSofter },
  iconBoxDone: { backgroundColor: colors.sageSoft },
  info: { flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  subtitle: { fontSize: 11, color: colors.textSecondary },
});
