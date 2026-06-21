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
      <View style={styles.left}>
        <Text style={styles.label}>세션 {sessionNumber} · 오늘의 대화 🌱</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>예상 {duration} · 주 1회 핵심 세션</Text>
      </View>
      <View style={styles.arrowCircle}>
        <Ionicons name="arrow-forward" size={20} color={colors.textOnDark} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: 10,
    backgroundColor: colors.dark,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardPressed: { opacity: 0.88 },
  left: { flex: 1, paddingRight: 12 },
  label: { fontSize: 11, color: colors.primarySoft, marginBottom: 2 },
  title: { fontSize: 15, fontWeight: '500', color: colors.textOnDark, marginBottom: 3 },
  subtitle: { fontSize: 10, color: colors.primaryMuted },
  arrowCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
});
