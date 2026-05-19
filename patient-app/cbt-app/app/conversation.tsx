import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSobriety } from '@/context/SobrietyContext';
import { colors, spacing, radius } from '@/constants/theme';

export default function ConversationScreen() {
  const router = useRouter();
  const { incrementDay, lastCompletedDate } = useSobriety();

  const today = new Date().toDateString();
  const alreadyCompletedToday = lastCompletedDate === today;

  async function handleComplete() {
    if (alreadyCompletedToday) {
      router.back();
      return;
    }
    await incrementDay();
    router.back();
  }

  function handleLater() {
    router.back();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>오늘의 대화</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.content}>
          <View style={styles.iconBg}>
            <Ionicons name="chatbubbles-outline" size={36} color={colors.coral} />
          </View>

          <Text style={styles.title}>오늘의 대화</Text>
          <Text style={styles.description}>
            세션을 완료하면{'\n'}단주 카운터가 하루 올라가요
          </Text>

          {alreadyCompletedToday && (
            <Text style={styles.alreadyNotice}>오늘은 이미 완료했어요</Text>
          )}

          <Pressable
            onPress={handleComplete}
            style={({ pressed }) => [styles.completeButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.completeButtonText}>
              {alreadyCompletedToday ? '돌아가기' : '대화 완료'}
            </Text>
          </Pressable>

          <Pressable onPress={handleLater} style={styles.laterButton} hitSlop={8}>
            <Text style={styles.laterText}>나중에 하기</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.dark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 15, fontWeight: '500', color: '#FFFFFF' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  content: { alignItems: 'center' },
  iconBg: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.coralSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  alreadyNotice: {
    fontSize: 12,
    color: colors.coral,
    marginBottom: 16,
    fontWeight: '500',
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.coral,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: radius.md,
    width: '100%',
  },
  buttonPressed: { opacity: 0.88 },
  completeButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  laterButton: { marginTop: 16, padding: 4 },
  laterText: { fontSize: 13, color: colors.textSecondary },
});
