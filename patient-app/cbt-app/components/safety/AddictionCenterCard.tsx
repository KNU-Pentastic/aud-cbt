import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';

export function AddictionCenterCard() {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push('/addiction-centers' as any)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.iconCircle}>
        <Ionicons name="business-outline" size={20} color={colors.sageDark} />
      </View>
      <View style={styles.info}>
        <Text style={styles.label}>중독관리통합지원센터</Text>
        <Text style={styles.description}>전국 지역별 중독 전문 상담기관</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: 10,
    backgroundColor: colors.sage,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  cardPressed: { opacity: 0.85 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1 },
  label: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  description: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
});
