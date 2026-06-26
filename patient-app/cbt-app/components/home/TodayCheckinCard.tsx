import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';

type Props = { completed: boolean };

export function TodayCheckinCard({ completed }: Props) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push('/checkin')}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>오늘의 체크인</Text>
        <Text style={styles.meta}>
          {completed ? '완료됨 · 수정 가능' : '약 1분이면 돼요'}
        </Text>
      </View>

      <View style={styles.iconRow}>
        <View style={styles.iconItem}>
          <Ionicons name="happy-outline" size={24} color={colors.coral} />
          <Text style={styles.iconLabel}>기분</Text>
        </View>
        <View style={styles.iconItem}>
          <Ionicons name="flame-outline" size={24} color={colors.sage} />
          <Text style={styles.iconLabel}>갈망</Text>
        </View>
        <View style={styles.iconItem}>
          <Ionicons name="moon-outline" size={24} color={colors.coral} />
          <Text style={styles.iconLabel}>수면</Text>
        </View>
        <View style={styles.iconItem}>
          <Ionicons name="medical-outline" size={24} color={colors.coral} />
          <Text style={styles.iconLabel}>복약</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.7 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 11,
  },
  title: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  meta: { fontSize: 11, color: colors.textTertiary },
  iconRow: { flexDirection: 'row', justifyContent: 'space-between' },
  iconItem: { flex: 1, alignItems: 'center', gap: 4 },
  iconLabel: { fontSize: 10, color: colors.textSecondary },
});
