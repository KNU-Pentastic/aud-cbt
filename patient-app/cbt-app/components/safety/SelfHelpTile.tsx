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

export function SelfHelpTile({ icon, title, subtitle, onPress }: Props) {
  const handlePress = onPress ?? (() => Alert.alert('곧 추가될 기능이에요'));

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <Ionicons name={icon} size={22} color={colors.coral} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 13,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tilePressed: { opacity: 0.7 },
  icon: { marginBottom: 7 },
  title: { fontSize: 12, fontWeight: '500', color: colors.textPrimary, marginBottom: 2, textAlign: 'center' },
  subtitle: { fontSize: 10, color: colors.textTertiary, textAlign: 'center' },
});
