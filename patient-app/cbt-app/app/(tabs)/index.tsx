import { ScrollView, View, Text, StyleSheet, StatusBar, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';
import { usePatientHome, nextMilestone, weekTitle } from '@/lib/queries';
import { GreetingHeader } from '@/components/home/GreetingHeader';
import { SobrietyCounterCard } from '@/components/home/SobrietyCounterCard';
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
  const router = useRouter();

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

          <TodayCheckinCard completed={!data.today_tasks.checkin_pending} />

          <TodaySessionCard
            sessionNumber={data.current_week}
            title={weekTitle(data.current_week)}
            duration="약 40분"
          />

          <QuickActions />

          {data.next_outpatient_date && (
            <View style={styles.outpatientCard}>
              <View style={styles.outpatientIcon}>
                <Ionicons name="calendar-outline" size={15} color={colors.coral} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.outpatientLabel}>다음 외래 예약</Text>
                <Text style={styles.outpatientDate}>{formatDate(data.next_outpatient_date)}</Text>
              </View>
            </View>
          )}

          <InsightCard days={data.sobriety_days} />

          {/* 응급 배너 */}
          <Pressable
            onPress={() => router.push('/safety')}
            style={({ pressed }) => [styles.emergencyBanner, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.emergencyIcon}>
              <Ionicons name="shield-checkmark-outline" size={19} color={colors.textOnDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emergencyTitle}>도움이 필요해요</Text>
              <Text style={styles.emergencySub}>언제든 바로 도움을 받으세요</Text>
            </View>
          </Pressable>

          <View style={{ height: 96 }} />
        </ScrollView>
      )}

      <EmergencyButton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 0 },
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
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  outpatientIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.coralSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outpatientLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 2 },
  outpatientDate: { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  emergencyBanner: {
    marginHorizontal: spacing.xl,
    marginBottom: 12,
    backgroundColor: colors.sageSoft,
    borderWidth: 0.5,
    borderColor: colors.orangeBorder,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  emergencyIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.sage,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  emergencyTitle: { fontSize: 13, fontWeight: '500', color: colors.orangeDeep },
  emergencySub: { fontSize: 10, color: '#B07B4D', marginTop: 1 },
});
