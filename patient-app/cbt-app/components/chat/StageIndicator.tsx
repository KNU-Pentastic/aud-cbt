import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '@/constants/theme';

type Props = { stage: 1 | 2 | 3 | 4 | 5 };

const STAGE_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '탐색',
  2: '심화',
  3: '인지',
  4: '재구성',
  5: '마무리',
};

export function StageIndicator({ stage }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        {([1, 2, 3, 4, 5] as const).map((s) => (
          <View
            key={s}
            style={[
              styles.dot,
              s <= stage ? styles.dotActive : styles.dotInactive,
              s === stage && styles.dotCurrent,
            ]}
          />
        ))}
      </View>
      <Text style={styles.label}>
        {STAGE_LABELS[stage]} · {stage}/5단계
      </Text>
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
  label: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
});
