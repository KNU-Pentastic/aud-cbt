import { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings, queryKeys } from '@/lib/queries';
import { api, ApiError } from '@/lib/api';
import type { SsoRelationship, SupportPerson } from '@/lib/api-types';
import { useAuthStore } from '@/store/useAuthStore';
import { EmergencyButton } from '@/components/EmergencyButton';
import { colors, spacing, radius } from '@/constants/theme';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];

const RELATIONSHIPS: { value: SsoRelationship; label: string }[] = [
  { value: 'spouse', label: '배우자' },
  { value: 'parent', label: '부모' },
  { value: 'sibling', label: '형제자매' },
  { value: 'child', label: '자녀' },
  { value: 'friend', label: '친구' },
  { value: 'other', label: '기타' },
];

function hourLabel(time: string): string {
  const h = parseInt(time.split(':')[0] ?? '20', 10);
  const period = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${h12}시`;
}

function formatPhone(text: string): string {
  const d = text.replace(/\D/g, '');
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const { data, isLoading, isError, refetch } = useSettings();

  const [savingDay, setSavingDay] = useState(false);
  const [savingTime, setSavingTime] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [ssoName, setSsoName] = useState('');
  const [ssoRel, setSsoRel] = useState<SsoRelationship>('spouse');
  const [ssoPhone, setSsoPhone] = useState('');
  const [savingSso, setSavingSso] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    queryClient.invalidateQueries({ queryKey: queryKeys.home });
  };

  const changeDay = async (day: number) => {
    if (!data || savingDay) return;
    setSavingDay(true);
    try {
      await api.patch('/me/settings', { session_day_of_week: day });
      invalidate();
    } catch (e) {
      Alert.alert('저장 실패', e instanceof ApiError ? e.message : '다시 시도해주세요.');
    } finally {
      setSavingDay(false);
    }
  };

  const changeHour = async (delta: number) => {
    if (!data || savingTime) return;
    const cur = parseInt(data.daily_checkin_time.split(':')[0] ?? '20', 10);
    const next = (cur + delta + 24) % 24;
    setSavingTime(true);
    try {
      await api.patch('/me/settings', {
        daily_checkin_time: `${String(next).padStart(2, '0')}:00`,
      });
      invalidate();
    } catch (e) {
      Alert.alert('저장 실패', e instanceof ApiError ? e.message : '다시 시도해주세요.');
    } finally {
      setSavingTime(false);
    }
  };

  const openSsoModal = () => {
    if (data?.sso) {
      setSsoName(data.sso.name);
      setSsoRel(data.sso.relationship);
      setSsoPhone(data.sso.phone);
    } else {
      setSsoName('');
      setSsoRel('spouse');
      setSsoPhone('');
    }
    setModalVisible(true);
  };

  const saveSso = async () => {
    if (!ssoName.trim() || !ssoPhone.trim()) {
      Alert.alert('이름과 전화번호를 입력해주세요');
      return;
    }
    setSavingSso(true);
    try {
      await api.post<SupportPerson>('/me/sso', {
        name: ssoName.trim(),
        relationship: ssoRel,
        phone: ssoPhone.trim(),
      });
      invalidate();
      setModalVisible(false);
    } catch (e) {
      Alert.alert('저장 실패', e instanceof ApiError ? e.message : '다시 시도해주세요.');
    } finally {
      setSavingSso(false);
    }
  };

  const deleteSso = () => {
    if (!data?.sso) return;
    const id = data.sso.sso_id;
    Alert.alert('연락처 삭제', '정말 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.del(`/me/sso/${id}`);
            invalidate();
          } catch (e) {
            Alert.alert('삭제 실패', e instanceof ApiError ? e.message : '다시 시도해주세요.');
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>설정</Text>
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
          {/* 알림 시간 */}
          <Text style={styles.sectionLabel}>일일 체크인 알림 시간</Text>
          <View style={styles.card}>
            <Pressable onPress={() => changeHour(-1)} hitSlop={8} style={styles.stepBtn}>
              <Ionicons name="remove" size={20} color={colors.sageDark} />
            </Pressable>
            <View style={styles.timeBox}>
              {savingTime ? (
                <ActivityIndicator color={colors.coral} />
              ) : (
                <Text style={styles.timeText}>{hourLabel(data.daily_checkin_time)}</Text>
              )}
            </View>
            <Pressable onPress={() => changeHour(1)} hitSlop={8} style={styles.stepBtn}>
              <Ionicons name="add" size={20} color={colors.sageDark} />
            </Pressable>
          </View>
          <Text style={styles.hint}>1시간 단위로 조정할 수 있어요</Text>

          {/* 세션 요일 */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>세션 진행 요일</Text>
          <View style={styles.dayRow}>
            {DAYS.map((d, i) => {
              const active = data.session_day_of_week === i;
              return (
                <Pressable
                  key={d}
                  onPress={() => changeDay(i)}
                  style={[styles.dayChip, active ? styles.dayChipActive : styles.dayChipInactive]}
                >
                  <Text style={active ? styles.dayTextActive : styles.dayTextInactive}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>변경은 다음 주부터 적용돼요</Text>

          {/* SSO */}
          <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
            <Text style={styles.sectionLabel}>비상 연락처 (보호자)</Text>
            <Pressable onPress={openSsoModal} style={styles.addBtn}>
              <Ionicons name={data.sso ? 'create-outline' : 'add'} size={15} color={colors.sageDark} />
              <Text style={styles.addBtnText}>{data.sso ? '수정' : '추가'}</Text>
            </Pressable>
          </View>
          {data.sso ? (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ssoName}>
                  {data.sso.name}
                  <Text style={styles.ssoRel}>
                    {'  '}
                    {RELATIONSHIPS.find((r) => r.value === data.sso!.relationship)?.label ?? ''}
                  </Text>
                </Text>
                <Text style={styles.ssoPhone}>{data.sso.phone}</Text>
              </View>
              <Pressable onPress={deleteSso} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={openSsoModal} style={styles.emptyState}>
              <Ionicons name="person-add-outline" size={20} color={colors.textTertiary} />
              <Text style={styles.emptyText}>위기 상황에 연락할 보호자를 등록해주세요</Text>
            </Pressable>
          )}

          {/* 로그아웃 */}
          <Pressable onPress={handleLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={18} color={colors.coral} />
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>

          <View style={{ height: 96 }} />
        </ScrollView>
      )}

      {/* SSO 추가/수정 모달 */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setModalVisible(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrapper}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{data?.sso ? '연락처 수정' : '연락처 추가'}</Text>

            <Text style={styles.fieldLabel}>이름 *</Text>
            <TextInput
              style={styles.input}
              value={ssoName}
              onChangeText={setSsoName}
              placeholder="이름"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={styles.fieldLabel}>관계</Text>
            <View style={styles.relRow}>
              {RELATIONSHIPS.map((r) => {
                const active = ssoRel === r.value;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => setSsoRel(r.value)}
                    style={[styles.relChip, active ? styles.relChipActive : styles.relChipInactive]}
                  >
                    <Text style={active ? styles.relTextActive : styles.relTextInactive}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>전화번호 *</Text>
            <TextInput
              style={styles.input}
              value={ssoPhone}
              onChangeText={(t) => setSsoPhone(formatPhone(t))}
              placeholder="010-0000-0000"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
            />

            <View style={styles.modalButtons}>
              <Pressable onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </Pressable>
              <Pressable onPress={saveSso} disabled={savingSso} style={styles.saveBtn}>
                {savingSso ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>저장</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <EmergencyButton />
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
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 96 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  errorText: { fontSize: 14, color: colors.textSecondary },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.coral },
  retryText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 10 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.sageSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  timeText: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  hint: { fontSize: 11, color: colors.textSecondary, marginTop: 8 },
  dayRow: { flexDirection: 'row', gap: 6 },
  dayChip: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  dayChipActive: { backgroundColor: colors.coral },
  dayChipInactive: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dayTextActive: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  dayTextInactive: { fontSize: 13, color: colors.textSecondary },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: 10,
  },
  addBtnText: { fontSize: 12, fontWeight: '600', color: colors.sageDark },
  ssoName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary, marginBottom: 3 },
  ssoRel: { fontSize: 12, fontWeight: '400', color: colors.textSecondary },
  ssoPhone: { fontSize: 13, color: colors.textSecondary },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 12, color: colors.textSecondary },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.xxl,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.coralSofter,
  },
  logoutText: { fontSize: 14, fontWeight: '600', color: colors.coral },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.xxl,
    paddingTop: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 20 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  relRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  relChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  relChipActive: { backgroundColor: colors.coral },
  relChipInactive: {
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  relTextActive: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  relTextInactive: { fontSize: 12, color: colors.textSecondary },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.borderSoft, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  saveBtn: { flex: 2, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.coral, alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});
