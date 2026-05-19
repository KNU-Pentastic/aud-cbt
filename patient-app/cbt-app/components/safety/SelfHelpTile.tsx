import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/constants/theme';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: 'sage' | 'coral';
  title: string;
  subtitle: string;
  onPress?: () => void;
};

export function SelfHelpTile({ icon, iconBg, title, subtitle, onPress }: Props) {
  const handlePress = onPress ?? (() => Alert.alert('곧 추가될 기능이에요'));

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={[styles.iconBox, iconBg === 'sage' ? styles.bgSage : styles.bgCoral]}>
        <Ionicons
          name={icon}
          size={16}
          color={iconBg === 'sage' ? colors.sageDark : colors.coral}
        />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  tilePressed: { opacity: 0.7 },
  iconBox: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 10,
  },
  bgSage: { backgroundColor: colors.sageSoft },
  bgCoral: { backgroundColor: colors.coralSofter },
  title: { fontSize: 12, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  subtitle: { fontSize: 10, color: colors.textSecondary },
});
