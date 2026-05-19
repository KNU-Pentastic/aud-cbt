import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCheckinStore, useTodayCheckin } from '@/store/useCheckinStore';
import { CheckinSlider } from '@/components/checkin/CheckinSlider';
import { MedicationToggle } from '@/components/checkin/MedicationToggle';
import { colors, spacing, radius } from '@/constants/theme';

const checkinSchema = z.object({
  mood: z.number().min(0).max(10),
  craving: z.number().min(0).max(10),
  sleepQuality: z.number().min(0).max(10),
  tookMedication: z.boolean(),
});

type CheckinFormData = z.infer<typeof checkinSchema>;

export default function CheckinScreen() {
  const router = useRouter();
  const submitCheckin = useCheckinStore((s) => s.submitCheckin);
  const todayCheckin = useTodayCheckin();

  const { control, handleSubmit, formState: { isSubmitting } } = useForm<CheckinFormData>({
    resolver: zodResolver(checkinSchema),
    defaultValues: todayCheckin
      ? {
          mood: todayCheckin.mood,
          craving: todayCheckin.craving,
          sleepQuality: todayCheckin.sleepQuality,
          tookMedication: todayCheckin.tookMedication,
        }
      : {
          mood: 5,
          craving: 0,
          sleepQuality: 5,
          tookMedication: true,
        },
  });

  const onSubmit = (data: CheckinFormData) => {
    try {
      submitCheckin(data);
      Alert.alert(
        '체크인 완료',
        todayCheckin ? '오늘의 기록이 수정되었어요.' : '오늘의 기록이 저장되었어요.',
        [{ text: '확인', onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert('저장 실패', '다시 시도해주세요.');
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

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.intro}>
          <Text style={styles.title}>오늘은 어떠셨나요?</Text>
          <Text style={styles.subtitle}>4개 항목 · 약 1분이면 끝나요</Text>
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
              minLabel="전혀 없음 0"
              maxLabel="극심함 10"
            />
          )}
        />

        <Controller
          control={control}
          name="sleepQuality"
          render={({ field: { value, onChange } }) => (
            <CheckinSlider
              label="수면 질"
              value={value}
              onChange={onChange}
              minLabel="매우 나쁨 0"
              maxLabel="매우 좋음 10"
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

        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          style={({ pressed }) => [
            styles.submitBtn,
            pressed && styles.submitBtnPressed,
          ]}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
          <Text style={styles.submitText}>
            {todayCheckin ? '체크인 수정하기' : '체크인 저장하기'}
          </Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  scroll: { paddingBottom: 20 },
  intro: { paddingHorizontal: spacing.xxl, paddingBottom: 18 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 12, color: colors.textSecondary },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.xl,
    marginTop: 8,
    backgroundColor: colors.coral,
    paddingVertical: 16,
    borderRadius: radius.md,
  },
  submitBtnPressed: { opacity: 0.85 },
  submitText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
