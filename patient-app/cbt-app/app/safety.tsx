import {
  View, Text, Pressable, ScrollView, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSettingsStore, SSOContact } from '@/store/useSettingsStore';
import { colors, spacing, radius } from '@/constants/theme';
import { EmergencyBanner } from '@/components/safety/EmergencyBanner';
import { EmergencyCallCard } from '@/components/safety/EmergencyCallCard';
import { SSOContactCard } from '@/components/safety/SSOContactCard';
import { SelfHelpTile } from '@/components/safety/SelfHelpTile';
import { SectionLabel } from '@/components/safety/SectionLabel';
import { TipModal, TipData, BREATH_TIP, GROUND_TIP } from '@/components/safety/TipModal';
import { AddictionCenterCard } from '@/components/safety/AddictionCenterCard';

function formatPhone(text: string): string {
  const digits = text.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

export default function SafetyScreen() {
  const router = useRouter();
  const { ssoContacts, addContact, updateContact, removeContact } = useSettingsStore();

  const [activeTip, setActiveTip] = useState<TipData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<SSOContact | null>(null);
  const [formName, setFormName] = useState('');
  const [formRelationship, setFormRelationship] = useState('');
  const [formPhone, setFormPhone] = useState('');

  const openAdd = () => {
    setEditingContact(null);
    setFormName('');
    setFormRelationship('');
    setFormPhone('');
    setModalVisible(true);
  };

  const openEdit = (contact: SSOContact) => {
    setEditingContact(contact);
    setFormName(contact.name);
    setFormRelationship(contact.relationship);
    setFormPhone(contact.phone);
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!formName.trim() || !formPhone.trim()) {
      Alert.alert('이름과 전화번호를 입력해주세요');
      return;
    }
    const data = {
      name: formName.trim(),
      relationship: formRelationship.trim(),
      phone: formPhone.trim(),
    };
    if (editingContact) {
      updateContact(editingContact.id, data);
    } else {
      addContact(data);
    }
    setModalVisible(false);
  };

  const handleDelete = (id: string) => {
    Alert.alert('연락처 삭제', '정말 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => removeContact(id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>긴급 도움</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <EmergencyBanner />

        <AddictionCenterCard />

        <EmergencyCallCard
          variant="primary"
          label="자살예방상담전화"
          phoneNumber="1393"
          description="24시간 · 무료 · 익명 상담"
          icon="call"
        />

        <EmergencyCallCard
          variant="dark"
          label="응급 의료"
          phoneNumber="119"
          icon="medkit"
        />

        {/* 내가 등록한 연락처 헤더 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabelText}>내가 등록한 연락처</Text>
          <Pressable
            onPress={openAdd}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add" size={16} color={colors.sageDark} />
            <Text style={styles.addBtnText}>추가</Text>
          </Pressable>
        </View>

        {ssoContacts.length > 0 ? (
          ssoContacts.map((contact) => (
            <SSOContactCard
              key={contact.id}
              contact={contact}
              onEdit={() => openEdit(contact)}
              onDelete={() => handleDelete(contact.id)}
            />
          ))
        ) : (
          <Pressable
            onPress={openAdd}
            style={({ pressed }) => [styles.emptyState, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="person-add-outline" size={20} color={colors.textTertiary} />
            <Text style={styles.emptyText}>가족·보호자 연락처를 추가해보세요</Text>
          </Pressable>
        )}

        <View style={{ height: spacing.lg }} />

        <SectionLabel>지금 할 수 있는 것</SectionLabel>
        <View style={styles.tilesRow}>
          <SelfHelpTile
            icon="cloud-outline"
            iconBg="sage"
            title="호흡 가이드"
            subtitle="4-7-8 호흡법"
            onPress={() => setActiveTip(BREATH_TIP)}
          />
          <SelfHelpTile
            icon="footsteps-outline"
            iconBg="coral"
            title="그라운딩"
            subtitle="5-4-3-2-1 기법"
            onPress={() => setActiveTip(GROUND_TIP)}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <TipModal tip={activeTip} onClose={() => setActiveTip(null)} />

      {/* 연락처 추가/수정 모달 */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setModalVisible(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalWrapper}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingContact ? '연락처 수정' : '연락처 추가'}
            </Text>

            <Text style={styles.fieldLabel}>이름 *</Text>
            <TextInput
              style={styles.input}
              value={formName}
              onChangeText={setFormName}
              placeholder="이름을 입력하세요"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>관계</Text>
            <TextInput
              style={styles.input}
              value={formRelationship}
              onChangeText={setFormRelationship}
              placeholder="예: 가족, 친구, 상담사"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>전화번호 *</Text>
            <TextInput
              style={styles.input}
              value={formPhone}
              onChangeText={(text) => setFormPhone(formatPhone(text))}
              placeholder="010-0000-0000"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              returnKeyType="done"
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.cancelBtnText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.saveBtnText}>저장</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  scroll: { paddingBottom: 40 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingBottom: 10,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  addBtnText: { fontSize: 12, fontWeight: '600', color: colors.sageDark },
  emptyState: {
    marginHorizontal: spacing.xl,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  tilesRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: 10,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.xxl,
    paddingTop: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.borderSoft,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});
