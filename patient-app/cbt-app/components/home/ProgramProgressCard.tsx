import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/constants/theme';

type Props = { currentWeek: number; totalWeeks: number; weekTitle: string };

export function ProgramProgressCard({ currentWeek, totalWeeks, weekTitle }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBox}>
            <Ionicons name="bookmark-outline" size={11} color={colors.sageDark} />
          </View>
          <Text style={styles.title}>12주 프로그램</Text>
        </View>
        <View style={styles.weekBadge}>
          <Text style={styles.weekText}>
            {currentWeek} / {totalWeeks}주차
          </Text>
        </View>
      </View>

      <View style={styles.dotsRow}>
        {Array.from({ length: totalWeeks }).map((_, i) => {
          const weekNum = i + 1;
          let bg: string = colors.borderSoft;
          if (weekNum < currentWeek) bg = colors.coral;
          else if (weekNum === currentWeek) bg = colors.sage;
          return <View key={i} style={[styles.dot, { backgroundColor: bg }]} />;
        })}
      </View>

      <View style={styles.subtitleRow}>
        <Ionicons name="bookmark" size={11} color={colors.textTertiary} />
        <Text style={styles.subtitle}>이번 주차 · {weekTitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.sageSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  weekBadge: {
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  weekText: { fontSize: 11, fontWeight: '500', color: colors.sageDark },
  dotsRow: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  dot: { flex: 1, height: 6, borderRadius: 3 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subtitle: { fontSize: 11, color: colors.textSecondary },
});
