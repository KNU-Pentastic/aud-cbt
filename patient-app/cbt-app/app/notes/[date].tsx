import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRef, useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNoteStore, makeDateLabel } from '@/store/useNoteStore';
import { confirmAsync } from '@/lib/confirm';
import { colors, spacing } from '@/constants/theme';

export default function NoteEditorScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const { notes, saveNote, deleteNote } = useNoteStore();

  const existing = notes[date];

  const [dateLabel, setDateLabel] = useState(
    existing?.dateLabel ?? makeDateLabel(date)
  );
  const [content, setContent] = useState(existing?.content ?? '');
  const [saved, setSaved] = useState(true);

  const contentRef = useRef<TextInput>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => contentRef.current?.focus(), 120);
    return () => {
      clearTimeout(t);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const scheduleSave = (newContent: string, newLabel: string) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (newContent.trim() || existing) {
        saveNote(date, { content: newContent, dateLabel: newLabel });
      }
      setSaved(true);
    }, 500);
  };

  const handleContentChange = (text: string) => {
    setContent(text);
    scheduleSave(text, dateLabel);
  };

  const handleLabelChange = (text: string) => {
    setDateLabel(text);
    scheduleSave(content, text);
  };

  const handleDelete = async () => {
    const ok = await confirmAsync('노트 삭제', '이 노트를 삭제할까요?', {
      confirmText: '삭제',
      destructive: true,
    });
    if (!ok) return;
    deleteNote(date);
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.savedLabel}>{saved ? '저장됨' : '저장 중...'}</Text>
        <View style={styles.headerRight}>
          {existing && (
            <Pressable onPress={handleDelete} hitSlop={12}>
              <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          )}
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.doneBtn}
          >
            <Text style={styles.doneBtnText}>완료</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.editorArea}>
          {/* 첫째 줄: 날짜 (수정 가능) */}
          <TextInput
            style={styles.dateInput}
            value={dateLabel}
            onChangeText={handleLabelChange}
            selectTextOnFocus={false}
            returnKeyType="next"
            onSubmitEditing={() => contentRef.current?.focus()}
          />

          {/* 구분선 */}
          <View style={styles.divider} />

          {/* 둘째 줄~: 본문 */}
          <TextInput
            ref={contentRef}
            style={styles.contentInput}
            value={content}
            onChangeText={handleContentChange}
            multiline
            placeholder="오늘 있었던 일을 자유롭게 기록해 보세요."
            placeholderTextColor={colors.textTertiary}
            textAlignVertical="top"
            scrollEnabled
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  savedLabel: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  doneBtn: {
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.sageDark,
  },
  editorArea: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingBottom: 20,
  },
  dateInput: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSoft,
    marginBottom: 16,
  },
  contentInput: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    lineHeight: 28,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});
