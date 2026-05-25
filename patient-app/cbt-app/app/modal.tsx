import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSobriety } from '@/context/SobrietyContext';
import { colors, radius, spacing, cardShadow } from '@/constants/theme';

export default function SessionModal() {
  const { incrementDay } = useSobriety();

  const handleComplete = async () => {
    await incrementDay();
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="chatbubbles-outline" size={40} color={colors.coral} />
      </View>

      <Text style={styles.title}>오늘의 대화</Text>
      <Text style={styles.subtitle}>
        세션을 완료하면{'\n'}단주 카운터가 하루 올라가요
      </Text>

      <Pressable
        onPress={handleComplete}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Ionicons name="checkmark-circle-outline" size={18} color={colors.textOnDark} />
        <Text style={styles.buttonText}>대화 완료</Text>
      </Pressable>

      <Pressable onPress={() => router.back()} style={styles.cancelButton}>
        <Text style={styles.cancelText}>나중에 하기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.background,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.coralSoftBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    ...cardShadow,
    shadowOpacity: 0.06,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 40,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.coral,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: radius.md,
    width: '100%',
    marginBottom: 12,
    ...cardShadow,
    shadowColor: colors.coralDark,
    shadowOpacity: 0.20,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textOnDark,
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
