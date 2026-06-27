import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';

type Props = {
  /** 백엔드 current_step. 범위를 벗어난 값(0·6·NaN)도 안에서 1..5 로 보정한다. */
  stage: number;
  /** 백엔드가 보낸 단계 이름(step_name). 없으면 아래 폴백 라벨을 쓴다. */
  label?: string;
  /** 현재 단계 진행도 0~1. 주면 단계 내 진행 막대를 함께 그린다. */
  completion?: number;
};

const TOTAL = 5;

// 백엔드 cbt_stages.CBT_STEPS 와 의미를 일치시킨 폴백 라벨. 평상시엔 백엔드 step_name 을
// 그대로 쓰고(label prop), 그 값이 없을 때만(구버전 payload·오프닝 등) 이 표를 쓴다.
const STAGE_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '체크인 리뷰',
  2: '지난주 과제 리뷰',
  3: '핵심 콘텐츠',
  4: '개인화',
  5: '이번 주 과제',
};

export function StageIndicator({ stage, label, completion }: Props) {
  const s = Math.max(1, Math.min(TOTAL, Math.round(stage) || 1)) as 1 | 2 | 3 | 4 | 5;
  const name = label || STAGE_LABELS[s];
  const pct =
    completion != null && Number.isFinite(completion)
      ? Math.max(0, Math.min(1, completion))
      : null;

  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        {([1, 2, 3, 4, 5] as const).map((d) => (
          <View
            key={d}
            style={[
              styles.dot,
              d <= s ? styles.dotActive : styles.dotInactive,
              d === s && styles.dotCurrent,
            ]}
          />
        ))}
      </View>
      <View style={styles.labelWrap}>
        <Text style={styles.label} numberOfLines={1}>
          {name} · {s}/{TOTAL}단계
          {pct != null ? ` · ${Math.round(pct * 100)}%` : ''}
        </Text>
        {pct != null ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` as any }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.xxl,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: { borderRadius: 99 },
  dotActive: { width: 8, height: 8, backgroundColor: colors.coral },
  dotInactive: { width: 6, height: 6, backgroundColor: colors.borderSoft },
  dotCurrent: { width: 10, height: 10 },
  labelWrap: { flex: 1, gap: 4 },
  label: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderSoft,
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: radius.pill, backgroundColor: colors.coral },
});
