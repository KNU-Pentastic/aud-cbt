import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@/constants/theme';

type Props = { name: string };

export function GreetingHeader({ name }: Props) {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <View style={styles.textCol}>
        <Text style={styles.greeting}>안녕하세요, {name}님</Text>
        <Text style={styles.headline}>오늘도 회복의 하루예요</Text>
        <Text style={styles.subline}>당신의 노력이 차곡차곡 쌓이고 있어요</Text>
      </View>
      <Pressable
        onPress={() => router.push('/settings' as any)}
        hitSlop={10}
        accessibilityLabel="설정"
        style={({ pressed }) => [styles.gear, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: 4,
    paddingBottom: 12,
  },
  textCol: { flex: 1 },
  greeting: { fontSize: 12, color: colors.textSecondary, marginBottom: 3 },
  headline: { fontSize: 21, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  subline: { fontSize: 12, color: colors.textSecondary },
  gear: { padding: 4, marginTop: 2 },
});
