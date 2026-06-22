import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';

type Props = { days: number; bestStreak: number; goal: number };

export function SobrietyCounterCard({ days, goal }: Props) {
  const router = useRouter();
  const progress = Math.min(days / Math.max(goal, 1), 1);
  const barProgress = Math.round(progress * 100);

  return (
    <Pressable
      onPress={() => router.push('/progress')}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.iconCircle}>
        <Ionicons name="leaf-outline" size={30} color={colors.coral} />
      </View>
      <View style={styles.info}>
        <Text style={styles.label}>단주 이어가는 중</Text>
        <View style={styles.daysRow}>
          <Text style={styles.daysNumber}>{days}</Text>
          <Text style={styles.daysUnit}>일째</Text>
        </View>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${barProgress}%` as any }]} />
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.barLabel}>목표 {goal}일 중 {barProgress}%</Text>
          <View style={styles.journeyHint}>
            <Text style={styles.journeyHintText}>12주 여정 보기</Text>
            <Ionicons name="chevron-forward" size={13} color={colors.coral} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardPressed: { opacity: 0.9 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.coralSoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  info: { flex: 1 },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: 1 },
  daysRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginBottom: 7 },
  daysNumber: { fontSize: 26, fontWeight: '500', color: colors.coral, lineHeight: 30 },
  daysUnit: { fontSize: 14, fontWeight: '400', color: colors.textSecondary },
  barBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: 5,
  },
  barFill: { height: '100%', backgroundColor: colors.coral, borderRadius: radius.pill },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barLabel: { fontSize: 11, color: colors.textTertiary },
  journeyHint: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  journeyHintText: { fontSize: 11, fontWeight: '500', color: colors.coral },
});
