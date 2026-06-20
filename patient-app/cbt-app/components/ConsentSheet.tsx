import { useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '@/constants/theme';

/**
 * 개인정보 수집·이용 동의 시트 (시연용 목업).
 *
 * 실제 동의 내역을 저장하지 않는다 — 회원가입 직전에 화면으로만 보여주고,
 * 필수 항목 동의 시 onAgree() 를 호출해 실제 가입 절차로 넘긴다.
 */

type ConsentItem = {
  key: string;
  required: boolean;
  title: string;
  detail: string;
};

const ITEMS: ConsentItem[] = [
  {
    key: 'privacy',
    required: true,
    title: '개인정보 수집·이용 동의 (필수)',
    detail:
      '수집 항목: 이메일 또는 PIN, 등록 코드, 서비스 이용 기록\n' +
      '수집 목적: 회원 식별 및 인지행동치료(CBT) 프로그램 제공\n' +
      '보유 기간: 회원 탈퇴 시까지',
  },
  {
    key: 'sensitive',
    required: true,
    title: '민감정보(건강정보) 수집·이용 동의 (필수)',
    detail:
      '수집 항목: 음주/충동 기록, 감정 체크인, 상담 대화 내용\n' +
      '수집 목적: 맞춤형 회복 지원 및 치료 효과 분석\n' +
      '보유 기간: 회원 탈퇴 시까지',
  },
  {
    key: 'marketing',
    required: false,
    title: '안내·알림 수신 동의 (선택)',
    detail: '회복 리마인더 및 프로그램 안내 알림을 받아볼 수 있어요.',
  },
];

function CheckRow({
  checked,
  label,
  onToggle,
  emphasized,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
  emphasized?: boolean;
}) {
  return (
    <Pressable style={styles.checkRow} onPress={onToggle} hitSlop={6}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked && <Text style={styles.checkMark}>✓</Text>}
      </View>
      <Text style={[styles.checkLabel, emphasized && styles.checkLabelStrong]}>{label}</Text>
    </Pressable>
  );
}

export default function ConsentSheet({
  visible,
  onClose,
  onAgree,
}: {
  visible: boolean;
  onClose: () => void;
  onAgree: () => void;
}) {
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});

  const allChecked = ITEMS.every((it) => agreed[it.key]);
  const requiredMet = useMemo(
    () => ITEMS.filter((it) => it.required).every((it) => agreed[it.key]),
    [agreed],
  );

  const toggle = (key: string) =>
    setAgreed((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleAll = () => {
    const next = !allChecked;
    setAgreed(Object.fromEntries(ITEMS.map((it) => [it.key, next])));
  };

  const handleAgree = () => {
    if (!requiredMet) return;
    onAgree();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <View style={styles.handle} />
          <Text style={styles.heading}>개인정보 수집·이용 동의</Text>
          <Text style={styles.sub}>
            서비스 가입을 위해 아래 내용을 확인하고 동의해주세요.
          </Text>

          <Pressable style={styles.allRow} onPress={toggleAll} hitSlop={6}>
            <View style={[styles.checkbox, allChecked && styles.checkboxOn]}>
              {allChecked && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.allLabel}>전체 동의하기</Text>
          </Pressable>

          <View style={styles.divider} />

          <ScrollView style={styles.list} contentContainerStyle={styles.listBody}>
            {ITEMS.map((it) => (
              <View key={it.key} style={styles.itemBlock}>
                <CheckRow
                  checked={!!agreed[it.key]}
                  label={it.title}
                  onToggle={() => toggle(it.key)}
                  emphasized={it.required}
                />
                <Text style={styles.itemDetail}>{it.detail}</Text>
              </View>
            ))}

            <Text style={styles.notice}>
              필수 항목 동의를 거부할 권리가 있으나, 거부 시 서비스 이용이
              제한될 수 있습니다.
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose} hitSlop={6}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.agreeBtn, requiredMet ? styles.agreeOn : styles.agreeOff]}
              onPress={handleAgree}
              disabled={!requiredMet}
            >
              <Text style={styles.agreeText}>동의하고 가입</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  heading: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  sub: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    marginTop: 6,
    marginBottom: spacing.lg,
  },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  allLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginLeft: 12 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  list: { flexGrow: 0 },
  listBody: { paddingBottom: spacing.md },
  itemBlock: { marginBottom: spacing.xl },
  checkRow: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxOn: { backgroundColor: colors.coral, borderColor: colors.coral },
  checkMark: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  checkLabel: { fontSize: 14, color: colors.textSecondary, marginLeft: 12, flex: 1 },
  checkLabelStrong: { color: colors.textPrimary, fontWeight: '600' },
  itemDetail: {
    fontSize: 12,
    color: colors.textTertiary,
    lineHeight: 18,
    marginLeft: 34,
    marginTop: 6,
  },
  notice: {
    fontSize: 11,
    color: colors.textTertiary,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  cancelBtn: {
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.borderSoft,
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  agreeBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeOn: { backgroundColor: colors.coral },
  agreeOff: { backgroundColor: colors.borderSoft },
  agreeText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
