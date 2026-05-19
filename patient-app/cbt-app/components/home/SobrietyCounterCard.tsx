import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { colors, spacing, radius } from '@/constants/theme';

type Props = { days: number; bestStreak: number; goal: number };

const RING_SIZE = 78;
const STROKE_WIDTH = 4;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getEncouragement(days: number): string {
  if (days === 0) return '오늘부터 시작이에요';
  if (days < 7) return '꾸준히 이어가고 있어요';
  if (days < 30) return '정말 잘 해내고 있어요';
  if (days < 90) return '엄청난 변화를 만들고 있어요';
  return '회복의 길을 단단히 걷고 있어요';
}

export function SobrietyCounterCard({ days, bestStreak, goal }: Props) {
  const progress = Math.min(days / Math.max(goal, 1), 1);
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const daysToGoal = Math.max(0, goal - days);
  const barProgress = progress * 100;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.ringContainer}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={colors.coralSofter}
              strokeWidth={STROKE_WIDTH}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RADIUS}
              stroke={colors.coral}
              strokeWidth={STROKE_WIDTH}
              fill="none"
              strokeDasharray={`${CIRCUMFERENCE}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform={`rotate(-90, ${RING_SIZE / 2}, ${RING_SIZE / 2})`}
            />
          </Svg>
          <View style={styles.ringInner}>
            <Text style={styles.daysNumber}>{days}</Text>
            <Text style={styles.daysUnit}>일째</Text>
          </View>
        </View>

        <View style={styles.info}>
          <Text style={styles.label}>단주 카운터</Text>
          <Text style={styles.message}>{getEncouragement(days)}</Text>
          <Text style={styles.stats}>
            최장 {bestStreak}일 · 목표 {goal}일
          </Text>
        </View>

        <View style={styles.leafCircle}>
          <Ionicons name="leaf-outline" size={13} color={colors.sageDark} />
        </View>
      </View>

      <View style={styles.barContainer}>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${barProgress}%` as any }]} />
        </View>
        <Text style={styles.barLabel}>
          {goal}일 목표까지 {daysToGoal}일 남았어요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.lg,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringInner: { position: 'absolute', alignItems: 'center' },
  daysNumber: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, lineHeight: 26 },
  daysUnit: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  info: { flex: 1, marginLeft: 16 },
  label: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
  message: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  stats: { fontSize: 11, color: colors.textSecondary },
  leafCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.sageSoft,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    right: 0,
  },
  barContainer: { marginTop: 14 },
  barBg: {
    height: 3,
    backgroundColor: colors.coralSofter,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barFill: { height: '100%', backgroundColor: colors.coral, borderRadius: 2 },
  barLabel: { fontSize: 10, color: colors.textSecondary },
});
