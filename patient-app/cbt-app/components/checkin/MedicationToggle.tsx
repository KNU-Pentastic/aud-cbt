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
          style={[styles.option, value === true ? styles.optionActive : styles.optionInactive]}
        >
          <Text style={value === true ? styles.textActive : styles.textInactive}>
            예 · 복용함
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange(false)}
          style={[styles.option, value === false ? styles.optionInactive2 : styles.optionInactive]}
        >
          <Text style={value === false ? styles.textInactive2 : styles.textInactive}>
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
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  label: { fontSize: 13, fontWeight: '500', color: colors.textPrimary, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 11,
    alignItems: 'center',
  },
  optionActive: {
    backgroundColor: colors.coralSoft,
    borderWidth: 1.5,
    borderColor: colors.coral,
  },
  optionInactive: {
    backgroundColor: colors.surfaceDim,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  optionInactive2: {
    backgroundColor: colors.surfaceDim,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  textActive: { fontSize: 13, fontWeight: '500', color: colors.coralDark },
  textInactive: { fontSize: 13, color: colors.textTertiary },
  textInactive2: { fontSize: 13, color: colors.textTertiary },
});
