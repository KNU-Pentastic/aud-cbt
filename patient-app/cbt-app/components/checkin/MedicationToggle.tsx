import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
};

export function MedicationToggle({ value, onChange }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>복약 여부</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(true)}
          style={[
            styles.option,
            value === true ? styles.optionActive : styles.optionInactive,
          ]}
        >
          <Text style={value === true ? styles.textActive : styles.textInactive}>
            예 · 복용함
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange(false)}
          style={[
            styles.option,
            value === false ? styles.optionActive : styles.optionInactive,
          ]}
        >
          <Text style={value === false ? styles.textActive : styles.textInactive}>
            아니오
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    flexBasis: 0,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  optionActive: { backgroundColor: colors.coral },
  optionInactive: {
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  textActive: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  textInactive: { fontSize: 12, color: colors.textSecondary },
});
