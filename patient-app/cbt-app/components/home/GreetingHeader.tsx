import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '@/constants/theme';

type Props = { name: string };

export function GreetingHeader({ name }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>안녕하세요, {name}님</Text>
      <Text style={styles.headline}>오늘도 회복의 하루예요</Text>
      <Text style={styles.subline}>당신의 노력이 차곡차곡 쌓이고 있어요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 4,
    paddingBottom: 12,
  },
  greeting: { fontSize: 12, color: colors.textSecondary, marginBottom: 3 },
  headline: { fontSize: 21, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  subline: { fontSize: 12, color: colors.textSecondary },
});
