import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useProgress, weekTitle } from '@/lib/queries';
import { EmergencyButton } from '@/components/EmergencyButton';
import { colors, spacing, radius } from '@/constants/theme';

const TOTAL_WEEKS = 12;

export default function ProgressScreen() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useProgress();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>나의 진도</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.coral} />
        </View>
      ) : isError || !data ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>정보를 불러오지 못했어요.</Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* 단주 일수 */}
          <View style={styles.sobrietyCard}>
            <Text style={styles.sobrietyLabel}>단주</Text>
            <Text style={styles.sobrietyDays}>{data.sobriety_days}</Text>
            <Text style={styles.sobrietyUnit}>일째 함께하고 있어요</Text>
          </View>

          {/* 세션 진행률 */}
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>12주 프로그램</Text>
              <Text style={styles.progressBadge}>
                {data.weeks_completed} / {TOTAL_WEEKS}주 완료
              </Text>
            </View>

            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  { width: `${(data.weeks_completed / TOTAL_WEEKS) * 100}%` as any },
                ]}
              />
            </View>

            <View style={styles.weekRow}>
              <Ionicons name="bookmark" size={12} color={colors.textTertiary} />
              <Text style={styles.weekText}>
                이번 주차 · {data.current_week}주차 {weekTitle(data.current_week)}
              </Text>
            </View>
          </View>

          {data.next_session_date && (
            <Text style={styles.nextSession}>다음 세션 예정일 · {data.next_session_date}</Text>
          )}
        </ScrollView>
      )}

      <EmergencyButton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 96 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  errorText: { fontSize: 14, color: colors.textSecondary },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
  },
  retryText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  sobrietyCard: {
    backgroundColor: colors.coralSoft,
    borderRadius: radius.lg,
    paddingVertical: 32,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sobrietyLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  sobrietyDays: { fontSize: 64, fontWeight: '800', color: colors.coral, lineHeight: 70 },
  sobrietyUnit: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  progressCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    marginBottom: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  progressTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  progressBadge: { fontSize: 12, fontWeight: '500', color: colors.sageDark },
  barBg: {
    height: 8,
    backgroundColor: colors.coralSofter,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: { height: '100%', backgroundColor: colors.coral, borderRadius: 4 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weekText: { fontSize: 12, color: colors.textSecondary },
  nextSession: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },
});
