import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/constants/theme';

export type TipData = {
  title: string;
  intro: string;
  tipIntro: string;
  bullets: string[];
  description: string;
  source: string;
  accent: string;
};

export const BREATH_TIP: TipData = {
  title: '마음의 안정을 찾는\n4-7-8 호흡법',
  intro: "불안하거나 잠이 오지 않는 순간, '천연 진정제'라 불리는 4-7-8 호흡법을 시작해 보세요.",
  tipIntro: '비결은 아주 간단합니다.',
  bullets: [
    '4초간 코로 숨을 깊게 들이마시고,',
    '7초간 숨을 꾹 참았다가,',
    '8초간 입으로 숨을 천천히 내뱉습니다.',
  ],
  description:
    '이 호흡은 우리 몸의 부교감 신경을 자극해 심장 박동을 낮추고 긴장된 근육을 이완시켜 줍니다.',
  source: '출처: 미국 애리조나 대학교 통합의학 센터 (Andrew Weil, MD)',
  accent: colors.sage,
};

export const GROUND_TIP: TipData = {
  title: '마음을 현재로 돌리는\n5-4-3-2-1 그라운딩',
  intro:
    "불안이나 공황으로 생각이 마구 엉킬 때, 오감을 깨워 '지금, 여기'의 현실로 돌아오는 그라운딩 감각 인지 기법을 시작해 보세요.",
  tipIntro: '비결은 주변의 오감에 집중하는 것입니다.',
  bullets: [
    '눈에 보이는 5가지 물건을 바라보고,',
    '몸이 느끼는 4가지 감각에 집중하며,',
    '귀에 들리는 3가지 소리에 귀를 기울이고,',
    '코로 맡아지는 2가지 냄새를 인지한 뒤,',
    '입안에서 느껴지는 1가지 맛에 집중합니다.',
  ],
  description:
    '이 과정은 과열된 뇌의 편도체를 안정시키고 의식을 현재로 붙잡아 두는 강력한 닻(Anchor)이 되어 줍니다.',
  source: "출처: 미국외상스트레스전문가협회(ATSS), '오감을 활용한 인지적 감각 안정화 모델'",
  accent: colors.coral,
};

type Props = {
  tip: TipData | null;
  onClose: () => void;
};

export function TipModal({ tip, onClose }: Props) {
  return (
    <Modal
      visible={tip !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        {tip && (
          <View style={styles.card}>
            {/* 컬러 상단 바 */}
            <View style={[styles.accentBar, { backgroundColor: tip.accent }]} />

            {/* 헤더 */}
            <View style={styles.header}>
              <Text style={styles.title}>{tip.title}</Text>
              <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.divider} />

            {/* 본문 */}
            <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
              <Text style={styles.intro}>{tip.intro}</Text>

              <Text style={styles.tipIntro}>{tip.tipIntro}</Text>

              {tip.bullets.map((bullet, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={[styles.bulletDot, { color: tip.accent }]}>•</Text>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ))}

              <Text style={styles.description}>{tip.description}</Text>

              <Text style={styles.source}>{tip.source}</Text>

              <View style={{ height: 4 }} />
            </ScrollView>

            {/* 닫기 버튼 */}
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.closeButtonText}>닫기</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    width: '100%',
    maxHeight: '78%',
    backgroundColor: '#FFFDF8',
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  accentBar: {
    height: 4,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  closeBtn: {
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 22,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 16,
  },
  intro: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 21,
    marginBottom: 14,
  },
  tipIntro: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 21,
  },
  description: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 21,
    marginTop: 14,
    marginBottom: 14,
  },
  source: {
    fontSize: 10,
    color: colors.textTertiary,
    lineHeight: 16,
  },
  closeButton: {
    marginHorizontal: 22,
    marginTop: 12,
    marginBottom: 18,
    paddingVertical: 13,
    borderRadius: radius.md,
    backgroundColor: colors.borderSoft,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
