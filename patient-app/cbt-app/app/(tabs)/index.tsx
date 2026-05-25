import { ScrollView, View, Text, StyleSheet, StatusBar, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/constants/theme';
import { usePatientHome, nextMilestone, weekTitle } from '@/lib/queries';
import { GreetingHeader } from '@/components/home/GreetingHeader';
import { SobrietyCounterCard } from '@/components/home/SobrietyCounterCard';
import { ProgramProgressCard } from '@/components/home/ProgramProgressCard';
import { TodaySessionCard } from '@/components/home/TodaySessionCard';
import { QuickActions } from '@/components/home/QuickActions';
import { TodayCheckinCard } from '@/components/home/TodayCheckinCard';
import { InsightCard } from '@/components/home/InsightCard';
import { EmergencyButton } from '@/components/EmergencyButton';

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

export default function HomeScreen() {
  const { data, isLoading, isError, refetch } = usePatientHome();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

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
          <GreetingHeader name={data.name} />

          <SobrietyCounterCard
            days={data.sobriety_days}
            bestStreak={data.sobriety_days}
            goal={nextMilestone(data.sobriety_days)}
          />

          <ProgramProgressCard
            currentWeek={data.current_week}
            totalWeeks={12}
            weekTitle={weekTitle(data.current_week)}
          />

          <TodaySessionCard
            sessionNumber={data.current_week}
            title={weekTitle(data.current_week)}
            duration="약 40분"
          />

          {data.next_outpatient_date && (
            <View style={styles.outpatientCard}>
              <View style={styles.outpatientIcon}>
                <Ionicons name="calendar-outline" size={15} color={colors.sageDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.outpatientLabel}>다음 외래 예약</Text>
                <Text style={styles.outpatientDate}>{formatDate(data.next_outpatient_date)}</Text>
              </View>
            </View>
          )}

          <QuickActions />

          <TodayCheckinCard completed={!data.today_tasks.checkin_pending} />

          <InsightCard days={data.sobriety_days} />
        </ScrollView>
      )}

      <EmergencyButton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 96 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  errorText: { fontSize: 14, color: colors.textSecondary },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
  },
  retryText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  outpatientCard: {
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
    gap: 12,
  },
  outpatientIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.sageSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outpatientLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 2 },
  outpatientDate: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
});
