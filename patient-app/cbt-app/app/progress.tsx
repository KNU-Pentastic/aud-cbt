import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useProgress } from '@/lib/queries';
import { EmergencyButton } from '@/components/EmergencyButton';
import { colors, spacing, radius } from '@/constants/theme';

const TOTAL_WEEKS = 12;

type PhaseStatus = 'done' | 'active' | 'todo';

interface Phase {
  id: number;
  range: string;
  rangeLabel: string;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  startWeek: number;
  endWeek: number;
}

const PHASES: Phase[] = [
  {
    id: 1,
    range: '1–2주차',
    rangeLabel: '시작',
    title: '회복의 기초 다지기',
    description: '단주 동기를 다지고 갈망 대처를 배우는 기간',
    icon: 'leaf-outline',
    startWeek: 1,
    endWeek: 2,
  },
  {
    id: 2,
    range: '3–4주차',
    rangeLabel: '분석',
    title: '나의 음주 패턴 들여다보기',
    description: '사고 관리와 문제 해결로 내 패턴을 이해하는 기간',
    icon: 'bulb-outline',
    startWeek: 3,
    endWeek: 4,
  },
  {
    id: 3,
    range: '5–11주차',
    rangeLabel: '훈련',
    title: '탄탄하지 않아도 괜찮아, 기르기',
    description: '거절·위기 대처·재발 방지 기술을 익히는 기간',
    icon: 'shield-checkmark-outline',
    startWeek: 5,
    endWeek: 11,
  },
  {
    id: 4,
    range: '12주차',
    rangeLabel: '졸업',
    title: '새로운 시작을 위해',
    description: '지나온 길을 돌아보고 새롭게 출발하는 기간',
    icon: 'flower-outline',
    startWeek: 12,
    endWeek: 12,
  },
];

function getPhaseStatus(phase: Phase, currentWeek: number): PhaseStatus {
  if (currentWeek > phase.endWeek) return 'done';
  if (currentWeek >= phase.startWeek) return 'active';
  return 'todo';
}

/** 서브 주차 태그를 표시할지 — 다주 단계에서 적어도 1주 이상 완료한 경우만 */
function showWeekTags(phase: Phase, currentWeek: number, status: PhaseStatus): boolean {
  return (
    status === 'active' &&
    phase.startWeek !== phase.endWeek &&
    currentWeek > phase.startWeek
  );
}

export default function ProgressScreen() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useProgress();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>12주 회복 여정</Text>
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
          {/* 전체 진행 요약 */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <Ionicons name="leaf-outline" size={28} color={colors.coral} />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.summaryLabel}>지금 {data.current_week} / {TOTAL_WEEKS}주차</Text>
              <View style={styles.summaryBarBg}>
                <View
                  style={[
                    styles.summaryBarFill,
                    { width: `${(data.weeks_completed / TOTAL_WEEKS) * 100}%` as any },
                  ]}
                />
              </View>
              <Text style={styles.summarySubLabel}>
                전체 진도 {Math.round((data.weeks_completed / TOTAL_WEEKS) * 100)}% · 잘 가고 있어요
              </Text>
            </View>
          </View>

          {/* 단주 일수 배지 */}
          <View style={styles.sobrietyRow}>
            <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.sobrietyText}>
              단주 <Text style={styles.sobrietyDays}>{data.sobriety_days}일째</Text> 함께하고 있어요
            </Text>
          </View>

          {/* 타임라인 */}
          <View style={styles.timeline}>
            {/* 세로 연결선 */}
            <View style={styles.timelineConnector} />

            {PHASES.map((phase) => {
              const status = getPhaseStatus(phase, data.current_week);
              const showTags = showWeekTags(phase, data.current_week, status);

              return (
                <View key={phase.id} style={styles.phaseRow}>
                  {/* 스텝 아이콘 */}
                  <View
                    style={[
                      styles.stepCircle,
                      status === 'done' && styles.stepDone,
                      status === 'active' && styles.stepActive,
                      status === 'todo' && styles.stepTodo,
                    ]}
                  >
                    {status === 'done' ? (
                      <Ionicons name="checkmark" size={19} color={colors.textOnDark} />
                    ) : (
                      <Ionicons
                        name={phase.icon}
                        size={17}
                        color={status === 'active' ? colors.textOnDark : colors.textQuaternary}
                      />
                    )}
                  </View>

                  {/* 카드 */}
                  <View
                    style={[
                      styles.phaseCard,
                      status === 'done' && styles.phaseCardDone,
                      status === 'active' && styles.phaseCardActive,
                      status === 'todo' && styles.phaseCardTodo,
                    ]}
                  >
                    <View style={styles.phaseCardHeader}>
                      <Text
                        style={[
                          styles.phaseRange,
                          status === 'todo' && styles.phaseRangeTodo,
                        ]}
                      >
                        {phase.range} · {phase.rangeLabel}
                      </Text>
                      {status === 'done' && (
                        <View style={styles.badgeDone}>
                          <Text style={styles.badgeDoneText}>완료</Text>
                        </View>
                      )}
                      {status === 'active' && (
                        <View style={styles.badgeActive}>
                          <Text style={styles.badgeActiveText}>진행 중</Text>
                        </View>
                      )}
                    </View>

                    <Text
                      style={[
                        styles.phaseTitle,
                        status === 'todo' && styles.phaseTitleTodo,
                      ]}
                    >
                      {phase.title}
                    </Text>
                    <Text
                      style={[
                        styles.phaseDesc,
                        status === 'todo' && styles.phaseDescTodo,
                      ]}
                    >
                      {phase.description}
                    </Text>

                    {showTags && (
                      <View style={styles.subLabelRow}>
                        <View style={styles.subTagDone}>
                          <Text style={styles.subTagDoneText}>
                            {data.current_week - 1}주 완료
                          </Text>
                        </View>
                        <View style={styles.subTagActive}>
                          <Text style={styles.subTagActiveText}>
                            {data.current_week}주 진행
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* 수료증 카드 */}
          <View style={styles.certCard}>
            <View style={styles.certIconBox}>
              <Ionicons name="ribbon-outline" size={26} color={colors.coral} />
            </View>
            <View>
              <Text style={styles.certTitle}>모든 여정을 완료하면</Text>
              <Text style={styles.certSub}>수료증이 발급돼요 🌱</Text>
            </View>
          </View>

          <View style={{ height: 96 }} />
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
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: colors.textPrimary },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  errorText: { fontSize: 14, color: colors.textSecondary },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
  },
  retryText: { fontSize: 13, fontWeight: '600', color: colors.textOnDark },

  // 요약 카드
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 14,
  },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.coralSoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  summaryInfo: { flex: 1 },
  summaryLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 7 },
  summaryBarBg: {
    height: 7,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: 5,
  },
  summaryBarFill: { height: '100%', backgroundColor: colors.coral, borderRadius: radius.pill },
  summarySubLabel: { fontSize: 11, color: colors.textTertiary },

  // 단주 배지
  sobrietyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  sobrietyText: { fontSize: 12, color: colors.textTertiary },
  sobrietyDays: { color: colors.coral, fontWeight: '500' },

  // 타임라인
  timeline: {
    position: 'relative',
    paddingLeft: 6,
    marginBottom: 14,
  },
  timelineConnector: {
    position: 'absolute',
    left: 22,
    top: 17,
    bottom: 60,
    width: 2,
    backgroundColor: colors.borderLight,
    zIndex: 0,
  },

  // 단계 행
  phaseRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 14,
    position: 'relative',
    zIndex: 1,
  },

  // 스텝 아이콘 원
  stepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    zIndex: 2,
  },
  stepDone: { backgroundColor: colors.coral },
  stepActive: {
    backgroundColor: colors.coral,
    borderWidth: 3,
    borderColor: colors.primaryMuted,
  },
  stepTodo: { backgroundColor: colors.border },

  // 단계 카드
  phaseCard: {
    flex: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  phaseCardDone: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  phaseCardActive: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.coral,
  },
  phaseCardTodo: {
    backgroundColor: colors.surfaceDim,
    borderWidth: 0.5,
    borderColor: colors.border,
  },

  phaseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  phaseRange: { fontSize: 11, fontWeight: '500', color: colors.coral },
  phaseRangeTodo: { color: colors.textTertiary },

  badgeDone: {
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeDoneText: { fontSize: 10, color: colors.coral },
  badgeActive: {
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeActiveText: { fontSize: 10, color: colors.orangeDeep },

  phaseTitle: { fontSize: 14, fontWeight: '500', color: colors.textPrimary, marginBottom: 3 },
  phaseTitleTodo: { color: colors.textDisabled },
  phaseDesc: { fontSize: 11, color: colors.textTertiary },
  phaseDescTodo: { color: colors.textQuaternary },

  subLabelRow: { flexDirection: 'row', gap: 6, marginTop: 9 },
  subTagDone: {
    backgroundColor: colors.coralSoft,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  subTagDoneText: { fontSize: 10, color: colors.coral },
  subTagActive: {
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  subTagActiveText: { fontSize: 10, color: colors.orangeDeep },

  // 수료증 카드
  certCard: {
    backgroundColor: colors.coralSoft,
    borderRadius: radius.card,
    paddingHorizontal: 15,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  certIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  certTitle: { fontSize: 13, fontWeight: '500', color: colors.coralDark },
  certSub: { fontSize: 15, fontWeight: '500', color: colors.coral, marginTop: 2 },
});
