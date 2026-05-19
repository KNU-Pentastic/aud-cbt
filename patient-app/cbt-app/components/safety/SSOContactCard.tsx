import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { SSOContact } from '@/store/useSettingsStore';
import { colors, spacing, radius } from '@/constants/theme';

type Props = {
  contact: SSOContact;
  onEdit: () => void;
  onDelete: () => void;
};

async function call(phone: string) {
  try {
    await Linking.openURL(`tel:${phone.replace(/[^0-9]/g, '')}`);
  } catch {
    Alert.alert('전화 연결 실패');
  }
}

async function sendSMS(phone: string) {
  try {
    await Linking.openURL(`sms:${phone.replace(/[^0-9]/g, '')}`);
  } catch {
    Alert.alert('문자 보내기 실패');
  }
}

export function SSOContactCard({ contact, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{contact.name.charAt(0)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{contact.name}</Text>
          <Text style={styles.detail}>
            {contact.relationship ? `${contact.relationship} · ` : ''}{contact.phone}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textTertiary}
        />
      </View>

      {expanded && (
        <>
          <View style={styles.divider} />
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => call(contact.phone)}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
            >
              <View style={[styles.actionIcon, styles.callBg]}>
                <Ionicons name="call" size={16} color={colors.sageDark} />
              </View>
              <Text style={styles.actionLabel}>전화</Text>
            </Pressable>

            <Pressable
              onPress={() => sendSMS(contact.phone)}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
            >
              <View style={[styles.actionIcon, styles.smsBg]}>
                <Ionicons name="chatbubble" size={15} color={colors.coral} />
              </View>
              <Text style={styles.actionLabel}>문자</Text>
            </Pressable>

            <Pressable
              onPress={onEdit}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
            >
              <View style={[styles.actionIcon, styles.editBg]}>
                <Ionicons name="pencil" size={15} color={colors.textSecondary} />
              </View>
              <Text style={styles.actionLabel}>수정</Text>
            </Pressable>

            <Pressable
              onPress={onDelete}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
            >
              <View style={[styles.actionIcon, styles.deleteBg]}>
                <Ionicons name="trash" size={15} color={colors.coral} />
              </View>
              <Text style={styles.actionLabel}>삭제</Text>
            </Pressable>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  cardPressed: { opacity: 0.85 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.sageSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '600', color: colors.sageDark },
  info: { flex: 1 },
  name: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginBottom: 1 },
  detail: { fontSize: 10, color: colors.textSecondary },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSoft,
    marginTop: 12,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  actionPressed: { opacity: 0.65 },
  actionIcon: {
    width: 36, height: 36, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  callBg: { backgroundColor: colors.sageSoft },
  smsBg: { backgroundColor: colors.coralSofter },
  editBg: { backgroundColor: colors.borderSoft },
  deleteBg: { backgroundColor: colors.coralSofter },
  actionLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
});
