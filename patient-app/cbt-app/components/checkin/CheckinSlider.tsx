import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  minLabel?: string;
  maxLabel?: string;
  max?: number;
  step?: number;
  unit?: string;
  isCraving?: boolean;
};

export function CheckinSlider({
  label,
  value,
  onChange,
  minLabel,
  maxLabel,
  max = 10,
  step = 1,
  unit,
  isCraving = false,
}: Props) {
  const trackColor = isCraving ? colors.sage : colors.coral;
  const valueColor = isCraving ? colors.orangeDark : colors.coral;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color: valueColor }]}>
          {value}
          {unit ? <Text style={styles.unit}> {unit}</Text> : null}
        </Text>
      </View>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={trackColor}
        maximumTrackTintColor={colors.border}
        thumbTintColor={trackColor}
      />

      {(minLabel || maxLabel) && (
        <View style={styles.labelsRow}>
          <Text style={styles.endLabel}>{minLabel}</Text>
          <Text style={styles.endLabel}>{maxLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  value: { fontSize: 15, fontWeight: '500' },
  unit: { fontSize: 12, fontWeight: '400', color: colors.textSecondary },
  slider: { width: '100%', height: 36 },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -2,
  },
  endLabel: { fontSize: 10, color: colors.textQuaternary },
});
