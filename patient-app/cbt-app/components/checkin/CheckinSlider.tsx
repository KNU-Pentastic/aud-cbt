import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  minLabel?: string;
  maxLabel?: string;
};

export function CheckinSlider({ label, value, onChange, minLabel, maxLabel }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={10}
        step={1}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={colors.coral}
        maximumTrackTintColor={colors.coralSofter}
        thumbTintColor={colors.coral}
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
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  value: { fontSize: 18, fontWeight: '700', color: colors.coral },
  slider: { width: '100%', height: 36 },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -2,
  },
  endLabel: { fontSize: 10, color: colors.textTertiary },
});
