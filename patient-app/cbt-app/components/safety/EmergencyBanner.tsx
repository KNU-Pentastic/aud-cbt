import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';

export function EmergencyBanner() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>지금 안전하신가요?</Text>
      <Text style={styles.subtitle}>
        위기 상황이라면 망설이지 말고 도움을 요청하세요. 혼자 견디지 않아도 돼요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.coralSofter,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderLeftWidth: 3,
    borderLeftColor: colors.coral,
  },
  title: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
});
