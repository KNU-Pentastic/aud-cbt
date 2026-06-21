import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useSettings } from '@/lib/queries';
import { api } from '@/lib/api';
import { colors, spacing, radius } from '@/constants/theme';
import { EmergencyBanner } from '@/components/safety/EmergencyBanner';
import { EmergencyCallCard } from '@/components/safety/EmergencyCallCard';
import { SelfHelpTile } from '@/components/safety/SelfHelpTile';
import { SectionLabel } from '@/components/safety/SectionLabel';
import { TipModal, TipData, BREATH_TIP, GROUND_TIP } from '@/components/safety/TipModal';
import { AddictionCenterCard } from '@/components/safety/AddictionCenterCard';

const REL_LABELS: Record<string, string> = {
  spouse: '배우자',
  parent: '부모',
  sibling: '형제자매',
  child: '자녀',
  friend: '친구',
  other: '기타',
};

async function openTel(phone: string) {
  try {
    await Linking.openURL(`tel:${phone.replace(/[^0-9]/g, '')}`);
  } catch {
    Alert.alert('전화 연결 실패');
  }
}

async function openSms(phone: string) {
  try {
    await Linking.openURL(`sms:${phone.replace(/[^0-9]/g, '')}`);
  } catch {
    Alert.alert('문자 보내기 실패');
  }
}

export default function SafetyScreen() {
  const router = useRouter();
  const { data: settings } = useSettings();
  const sso = settings?.sso ?? null;

  const [activeTip, setActiveTip] = useState<TipData | null>(null);
  const recordedRef = useRef(false);

  // 명세 4.4.1: P4 진입 자체를 안전 이벤트로 기록 (fire-and-forget)
  useEffect(() => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    api
      .post('/me/safety/p4-shown', { trigger: 'manual_button', clicked_resource: 'none' })
      .catch(() => {
        /* 기록 실패는 응급 안내 표시를 막지 않음 */
      });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>긴급 안내</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <EmergencyBanner />

        <AddictionCenterCard />

        <EmergencyCallCard
          variant="primary"
          label="자살예방상담전화"
          phoneNumber="1393"
          description="24시간 · 무료 · 익명 상담"
          icon="call"
        />

        <EmergencyCallCard variant="dark" label="응급 의료" phoneNumber="119" icon="medkit" />

        {/* 보호자(SSO) — 백엔드(D0/설정) 등록 정보 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabelText}>보호자 연락처</Text>
          <Pressable onPress={() => router.push('/settings' as any)} hitSlop={8}>
            <Text style={styles.manageText}>관리</Text>
          </Pressable>
        </View>

        {sso ? (
          <View style={styles.ssoCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{sso.name.charAt(0)}</Text>
            </View>
            <View style={styles.ssoInfo}>
              <Text style={styles.ssoName}>{sso.name}</Text>
              <Text style={styles.ssoDetail}>
                {REL_LABELS[sso.relationship] ?? ''} · {sso.phone}
              </Text>
            </View>
            <Pressable onPress={() => openTel(sso.phone)} style={styles.ssoActionBtn} hitSlop={6}>
              <Ionicons name="call" size={16} color={colors.sageDark} />
            </Pressable>
            <Pressable onPress={() => openSms(sso.phone)} style={styles.ssoActionBtn} hitSlop={6}>
              <Ionicons name="chatbubble" size={15} color={colors.coral} />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => router.push('/settings' as any)} style={styles.emptyState}>
            <Ionicons name="person-add-outline" size={20} color={colors.textTertiary} />
            <Text style={styles.emptyText}>설정에서 보호자 연락처를 등록해보세요</Text>
          </Pressable>
        )}

        <View style={{ height: spacing.lg }} />

        <SectionLabel>지금 할 수 있는 것</SectionLabel>
        <View style={styles.tilesRow}>
          <SelfHelpTile
            icon="cloud-outline"
            iconBg="sage"
            title="호흡 가이드"
            subtitle="4-7-8 호흡법"
            onPress={() => setActiveTip(BREATH_TIP)}
          />
          <SelfHelpTile
            icon="footsteps-outline"
            iconBg="coral"
            title="그라운딩"
            subtitle="5-4-3-2-1 기법"
            onPress={() => setActiveTip(GROUND_TIP)}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <TipModal tip={activeTip} onClose={() => setActiveTip(null)} />
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
  scroll: { paddingBottom: 40 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 10,
  },
  sectionLabelText: { fontSize: 11, fontWeight: '600', color: colors.textPrimary, letterSpacing: 0.3 },
  manageText: { fontSize: 12, fontWeight: '600', color: colors.sageDark },
  ssoCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.coralSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '600', color: colors.coral },
  ssoInfo: { flex: 1 },
  ssoName: { fontSize: 14, fontWeight: '500', color: colors.textPrimary, marginBottom: 2 },
  ssoDetail: { fontSize: 11, color: colors.textSecondary },
  ssoActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 0.5,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    marginHorizontal: spacing.xl,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 12, color: colors.textSecondary },
  tilesRow: { flexDirection: 'row', paddingHorizontal: spacing.xl, gap: 9 },
});
