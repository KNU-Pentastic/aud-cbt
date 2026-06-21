import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/queries';
import type { CheckinResponse, CheckinSubmit, Paginated, CheckinOut } from '@/lib/api-types';
import { CheckinSlider } from '@/components/checkin/CheckinSlider';
import { MedicationToggle } from '@/components/checkin/MedicationToggle';
import { EmergencyButton } from '@/components/EmergencyButton';
import { colors, spacing, radius } from '@/constants/theme';

const checkinSchema = z.object({
  mood: z.number().min(0).max(10),
  craving: z.number().min(0).max(10),
  sleepHours: z.number().min(0).max(12),
  tookMedication: z.boolean(),
  freeNote: z.string().max(2000).optional(),
});

type CheckinFormData = z.infer<typeof checkinSchema>;

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CheckinScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // 오늘 이미 제출한 체크인이 있으면 수정 모드로 prefill
  const { data: todayCheckin, isLoading } = useQuery({
    queryKey: ['today-checkin'],
    queryFn: async () => {
      const res = await api.get<Paginated<CheckinOut>>('/me/checkins?page=1&page_size=1');
      const latest = res.items[0];
      return latest && latest.date === localToday() ? latest : null;
    },
  });

  const { control, handleSubmit } = useForm<CheckinFormData>({
    resolver: zodResolver(checkinSchema),
    values: todayCheckin
      ? {
          mood: todayCheckin.mood_nrs,
          craving: todayCheckin.craving_nrs,
          sleepHours: todayCheckin.sleep_hours,
          tookMedication: todayCheckin.medication_records[0]?.taken ?? true,
          freeNote: todayCheckin.free_note ?? '',
        }
      : {
          mood: 5,
          craving: 0,
          sleepHours: 7,
          tookMedication: true,
          freeNote: '',
        },
  });

  const buildPayload = (data: CheckinFormData): CheckinSubmit => ({
    mood_nrs: data.mood,
    craving_nrs: data.craving,
    sleep_hours: data.sleepHours,
    medication_records: [{ medication_name: '처방약', taken: data.tookMedication }],
    free_note: data.freeNote?.trim() ? data.freeNote.trim() : null,
  });

  const afterSubmit = (res: CheckinResponse) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.home });
    queryClient.invalidateQueries({ queryKey: ['today-checkin'] });

    // 제출 시 안전 분류 결과 처리 (명세 4.2.1)
    const cls = res.safety_classification;
    if (cls?.grade === 'A') {
      router.replace('/safety');
      return;
    }
    if (cls?.grade === 'B') {
      Alert.alert(
        '체크인 저장됨',
        '오늘 기록에서 신경 쓰이는 부분이 보였어요. 다음 외래 때 의료진과 꼭 상의해 주세요.',
        [{ text: '확인', onPress: () => router.back() }]
      );
      return;
    }
    Alert.alert('체크인 완료', '오늘의 기록이 저장되었어요.', [
      { text: '확인', onPress: () => router.back() },
    ]);
  };

  const onSubmit = async (data: CheckinFormData) => {
    setSubmitting(true);
    const payload = buildPayload(data);
    try {
      let res: CheckinResponse;
      if (todayCheckin) {
        res = await api.patch<CheckinResponse>(
          `/me/checkins/${todayCheckin.checkin_id}`,
          payload
        );
      } else {
        try {
          res = await api.post<CheckinResponse>('/me/checkins', payload);
        } catch (e) {
          // 이미 오늘 제출됨 → 최근 체크인을 가져와 수정(PATCH)
          if (e instanceof ApiError && e.code === 'CHECKIN_ALREADY_SUBMITTED') {
            const latest = await api.get<Paginated<CheckinOut>>(
              '/me/checkins?page=1&page_size=1'
            );
            const id = latest.items[0]?.checkin_id;
            if (!id) throw e;
            res = await api.patch<CheckinResponse>(`/me/checkins/${id}`, payload);
          } else {
            throw e;
          }
        }
      }
      afterSubmit(res);
    } catch (e) {
      Alert.alert('저장 실패', e instanceof ApiError ? e.message : '다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>일일 체크인</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.coral} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.intro}>
              <Text style={styles.title}>오늘은 어떠셨나요?</Text>
              <Text style={styles.subtitle}>약 1분이면 끝나요</Text>
            </View>

            <Controller
              control={control}
              name="mood"
              render={({ field: { value, onChange } }) => (
                <CheckinSlider
                  label="기분"
                  value={value}
                  onChange={onChange}
                  minLabel="최악 0"
                  maxLabel="최고 10"
                />
              )}
            />

            <Controller
              control={control}
              name="craving"
              render={({ field: { value, onChange } }) => (
                <CheckinSlider
                  label="갈망"
                  value={value}
                  onChange={onChange}
                  minLabel="전혀 없음"
                  maxLabel="극심함"
                  isCraving
                />
              )}
            />

            <Controller
              control={control}
              name="sleepHours"
              render={({ field: { value, onChange } }) => (
                <CheckinSlider
                  label="수면 시간"
                  value={value}
                  onChange={onChange}
                  max={12}
                  unit="시간"
                  minLabel="0시간"
                  maxLabel="12시간"
                />
              )}
            />

            <Controller
              control={control}
              name="tookMedication"
              render={({ field: { value, onChange } }) => (
                <MedicationToggle value={value} onChange={onChange} />
              )}
            />

            <Controller
              control={control}
              name="freeNote"
              render={({ field: { value, onChange } }) => (
                <View style={styles.noteCard}>
                  <Text style={styles.noteLabel}>자유 메모 (선택)</Text>
                  <TextInput
                    style={styles.noteInput}
                    value={value}
                    onChangeText={onChange}
                    placeholder="오늘 있었던 일이나 떠오르는 생각을 적어주세요"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    maxLength={2000}
                  />
                </View>
              )}
            />

            <Pressable
              onPress={handleSubmit(onSubmit)}
              disabled={submitting}
              style={({ pressed }) => [styles.submitBtn, pressed && styles.submitBtnPressed]}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.submitText}>
                    {todayCheckin ? '체크인 수정하기' : '체크인 저장하기'}
                  </Text>
                </>
              )}
            </Pressable>

            <View style={{ height: 96 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <EmergencyButton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  scroll: { paddingBottom: 20 },
  intro: { paddingHorizontal: spacing.xxl, paddingBottom: 18 },
  title: { fontSize: 18, fontWeight: '500', color: colors.textPrimary, marginBottom: 3 },
  subtitle: { fontSize: 12, color: colors.textTertiary },
  noteCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  noteLabel: { fontSize: 13, fontWeight: '500', color: colors.textPrimary, marginBottom: 10 },
  noteInput: {
    minHeight: 64,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 0.5,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.xl,
    marginTop: 8,
    backgroundColor: colors.coral,
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  submitBtnPressed: { opacity: 0.85 },
  submitText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
