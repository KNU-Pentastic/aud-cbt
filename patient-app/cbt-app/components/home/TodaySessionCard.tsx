import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';

type Props = {
  sessionNumber: number;
  title: string;
  duration: string;
};

export function TodaySessionCard({ sessionNumber, title, duration }: Props) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/chat/new' as any)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.iconCircle}>
        <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.coral} />
      </View>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>오늘의 세션</Text>
      </View>

      <Text style={styles.sessionLabel}>세션 {sessionNumber}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>예상 {duration} · 채팅형 대화</Text>

      <View style={styles.button}>
        <Ionicons name="arrow-forward-circle-outline" size={18} color="#FFFFFF" />
        <Text style={styles.buttonText}>오늘의 대화 시작하기</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.dark,
    borderRadius: radius.lg,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 18,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.darkSoft,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 18,
    right: 22,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.darkSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 14,
  },
  badgeText: { fontSize: 11, color: '#FFFFFF', fontWeight: '500' },
  sessionLabel: { fontSize: 11, color: colors.coral, marginBottom: 2 },
  title: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  subtitle: { fontSize: 11, color: colors.textOnDarkMuted, marginBottom: 14 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.coral,
    paddingVertical: 13,
    borderRadius: 14,
  },
  cardPressed: { opacity: 0.88 },
  buttonPressed: { opacity: 0.88 },
  buttonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});
