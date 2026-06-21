import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/constants/theme';

export function EmergencyBanner() {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="shield-checkmark-outline" size={34} color={colors.orangeAlt} />
      </View>
      <Text style={styles.title}>지금 안전하신가요?</Text>
      <Text style={styles.subtitle}>
        위기 상황이라면 혼자 견디지 말고{'\n'}지금 바로 도움을 요청하세요
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 18,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.sageSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '500', color: colors.textPrimary, marginBottom: 6 },
  subtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    lineHeight: 19,
    textAlign: 'center',
  },
});
