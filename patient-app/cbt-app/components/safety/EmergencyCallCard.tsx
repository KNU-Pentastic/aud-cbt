import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { colors, spacing, radius } from '@/constants/theme';

type Props = {
  variant: 'primary' | 'dark';
  label: string;
  phoneNumber: string;
  description?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

async function callNumber(phone: string) {
  const cleaned = phone.replace(/[^0-9]/g, '');
  try {
    await Linking.openURL(`tel:${cleaned}`);
  } catch {
    Alert.alert('전화 연결 실패', '전화를 걸 수 없습니다.');
  }
}

export function EmergencyCallCard({ variant, label, phoneNumber, description, icon }: Props) {
  const isPrimary = variant === 'primary';
  const bg = isPrimary ? colors.coral : colors.orangeAlt;
  const iconBoxBg = 'rgba(255,255,255,0.18)';
  const subTextColor = isPrimary ? colors.primaryMuted : colors.orangeFade;
  const chevronColor = isPrimary ? colors.primaryMuted : colors.orangeFade;

  return (
    <Pressable
      onPress={() => callNumber(phoneNumber)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: bg, marginBottom: isPrimary ? 11 : spacing.lg },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: iconBoxBg }]}>
        <Ionicons name={icon} size={24} color={colors.textOnDark} />
      </View>

      <View style={styles.info}>
        <Text style={styles.number}>{phoneNumber}</Text>
        {description && <Text style={[styles.description, { color: subTextColor }]}>{description}</Text>}
        <Text style={[styles.label, { color: subTextColor }]}>{label}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={chevronColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 17,
    borderRadius: radius.card,
  },
  cardPressed: { opacity: 0.88 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  info: { flex: 1 },
  number: { fontSize: 22, fontWeight: '500', color: colors.textOnDark, letterSpacing: 1 },
  description: { fontSize: 11, marginTop: 1 },
  label: { fontSize: 11, marginTop: 1 },
});
