import { View, Text, Pressable, SectionList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNoteStore, getSections, makeTodayKey, DailyNote } from '@/store/useNoteStore';
import { colors, spacing, radius } from '@/constants/theme';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dayAndWeekday(dateKey: string): { day: string; weekday: string } {
  const [y, m, d] = dateKey.split('-').map(Number);
  return {
    day: String(d),
    weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()],
  };
}

function NoteItem({
  note,
  isToday,
  onPress,
}: {
  note: DailyNote;
  isToday: boolean;
  onPress: () => void;
}) {
  const { day, weekday } = dayAndWeekday(note.date);
  const preview = note.content.trim().split('\n')[0] || '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <View style={styles.dateCol}>
        <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>{day}</Text>
        <Text style={[styles.weekdayLabel, isToday && styles.weekdayToday]}>{weekday}</Text>
      </View>
      <View style={styles.itemDivider} />
      <View style={styles.previewCol}>
        {preview ? (
          <Text style={styles.previewText} numberOfLines={2}>
            {preview}
          </Text>
        ) : (
          <Text style={styles.previewEmpty}>내용 없음</Text>
        )}
      </View>
    </Pressable>
  );
}

export default function NotesListScreen() {
  const router = useRouter();
  const notes = useNoteStore((s) => s.notes);
  const sections = getSections(notes);
  const todayKey = makeTodayKey();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>생각 노트</Text>
        <Pressable
          onPress={() => router.push(`/notes/${todayKey}` as any)}
          style={({ pressed }) => [styles.todayBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="add" size={16} color={colors.sageDark} />
          <Text style={styles.todayBtnText}>오늘</Text>
        </Pressable>
      </View>

      {sections.length === 0 ? (
        <Pressable
          onPress={() => router.push(`/notes/${todayKey}` as any)}
          style={({ pressed }) => [styles.emptyState, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="journal-outline" size={36} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>아직 기록이 없어요</Text>
          <Text style={styles.emptySubtitle}>오늘의 생각을 첫 번째로 남겨보세요</Text>
        </Pressable>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.date}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <NoteItem
              note={item}
              isToday={item.date === todayKey}
              onPress={() => router.push(`/notes/${item.date}` as any)}
            />
          )}
          SectionSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  todayBtnText: { fontSize: 12, fontWeight: '600', color: colors.sageDark },

  // 섹션 헤더
  sectionHeader: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },

  // 노트 아이템
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    gap: 16,
  },
  itemPressed: { opacity: 0.7 },
  dateCol: { width: 32, alignItems: 'center' },
  dayNum: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 26,
  },
  dayNumToday: { color: colors.coral },
  weekdayLabel: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },
  weekdayToday: { color: colors.coral },
  itemDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
    backgroundColor: colors.borderSoft,
  },
  previewCol: { flex: 1 },
  previewText: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  previewEmpty: { fontSize: 12, color: colors.textTertiary, fontStyle: 'italic' },

  // 빈 상태
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 60,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  emptySubtitle: { fontSize: 12, color: colors.textTertiary },
});
