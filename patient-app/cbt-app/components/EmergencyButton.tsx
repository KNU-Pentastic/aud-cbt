import { Pressable, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, cardShadow } from '@/constants/theme';

/**
 * 모든 화면에 항상 노출되는 응급 안내 진입 버튼 (명세 P1 4.1.2 — "절대 양보 금지").
 * 명세 권고에 따라 빨간색을 피하고 차분한 색(sage)을 사용한다.
 * 탭 시 P4(응급 안내, /safety)로 즉시 이동.
 */
export function EmergencyButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="도움이 필요해요. 응급 안내로 이동"
      onPress={() => router.push('/safety')}
      style={({ pressed }) => [
        styles.button,
        { bottom: Math.max(insets.bottom, 16) + 8 },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name="medical-outline" size={18} color={colors.surface} />
      <Text style={styles.text}>도움이 필요해요</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.sageDark,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
    ...cardShadow,
  },
  pressed: { opacity: 0.85 },
  text: { fontSize: 13, fontWeight: '700', color: colors.surface },
});
