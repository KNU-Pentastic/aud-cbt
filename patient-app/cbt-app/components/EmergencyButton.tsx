import { Pressable, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, cardShadow } from '@/constants/theme';

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
      <Ionicons name="shield-checkmark-outline" size={17} color={colors.textOnDark} />
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
    backgroundColor: colors.orangeAlt,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
    ...cardShadow,
  },
  pressed: { opacity: 0.85 },
  text: { fontSize: 13, fontWeight: '600', color: colors.textOnDark },
});
