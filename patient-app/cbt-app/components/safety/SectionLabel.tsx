import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '@/constants/theme';

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: 10,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
});
