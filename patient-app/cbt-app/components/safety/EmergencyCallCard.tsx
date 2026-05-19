import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { colors, spacing } from '@/constants/theme';

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
  } catch (e) {
    Alert.alert('전화 연결 실패', '전화를 걸 수 없습니다.');
  }
}

export function EmergencyCallCard({ variant, label, phoneNumber, description, icon }: Props) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={() => callNumber(phoneNumber)}
      style={({ pressed }) => [
        styles.card,
        isPrimary ? styles.cardPrimary : styles.cardDark,
        pressed && styles.cardPressed,
      ]}
    >
      <View
        style={[
          styles.iconCircle,
          isPrimary ? styles.iconCirclePrimary : styles.iconCircleDark,
        ]}
      >
        <Ionicons
          name={icon}
          size={isPrimary ? 22 : 20}
          color={isPrimary ? '#FFFFFF' : colors.coral}
        />
      </View>

      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.number, { fontSize: isPrimary ? 18 : 16, fontWeight: isPrimary ? '700' : '600' }]}>
          {phoneNumber}
        </Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>

      <Ionicons
        name="chevron-forward"
        size={isPrimary ? 18 : 16}
        color="rgba(255,255,255,0.65)"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 18,
  },
  cardPrimary: { backgroundColor: colors.coral, marginBottom: 10 },
  cardDark: { backgroundColor: colors.dark, marginBottom: spacing.lg },
  cardPressed: { opacity: 0.85 },
  iconCircle: { justifyContent: 'center', alignItems: 'center' },
  iconCirclePrimary: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  iconCircleDark: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.darkSoft,
  },
  info: { flex: 1 },
  label: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginBottom: 2 },
  number: { color: '#FFFFFF' },
  description: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
});
