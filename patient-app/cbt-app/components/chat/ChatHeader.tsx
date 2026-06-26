import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '@/constants/theme';

type Props = {
  sessionNumber: number;
  /** 뒤로가기 — 대화를 끝내지 않고 화면만 나간다(대화는 active 로 유지). */
  onBack: () => void;
  /** 세션 마치기(수동 종료) — 사용자가 직접 대화를 마무리한다. */
  onEnd: () => void;
  /**
   * 종료 버튼 활성화 여부. 수동 종료는 사용자가 원할 때 언제든 가능하므로, 대화가
   * 진행 중이면(!isComplete) 항상 true 다. 이미 종료된 대화에서만 false 가 되어
   * 회색으로 비활성화된다. ('마칠 준비'(session_ready) 신호는 더 이상 종료를 막지
   * 않고, 본문의 안내 배너로만 '이제 마무리해도 좋아요'를 부드럽게 알린다.)
   */
  endEnabled?: boolean;
};

export function ChatHeader({ sessionNumber, onBack, onEnd, endEnabled = false }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </Pressable>
        <View>
          <Text style={styles.title}>세션 {sessionNumber}</Text>
          <Text style={styles.subtitle}>핵심 콘텐츠</Text>
        </View>
      </View>

      <Pressable
        onPress={onEnd}
        disabled={!endEnabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="세션 마치기"
        accessibilityState={{ disabled: !endEnabled }}
        style={({ pressed }) => [
          styles.endBtn,
          !endEnabled && styles.endBtnDisabled,
          pressed && endEnabled && { opacity: 0.7 },
        ]}
      >
        <Ionicons
          name="stop-circle-outline"
          size={18}
          color={endEnabled ? colors.textSecondary : colors.textQuaternary}
        />
        <Text style={[styles.endLabel, !endEnabled && styles.endLabelDisabled]}>
          세션 마치기
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 28 },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  endBtnDisabled: { backgroundColor: colors.surfaceDim, borderColor: colors.borderLight },
  endLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  endLabelDisabled: { color: colors.textQuaternary },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 1,
  },
});
