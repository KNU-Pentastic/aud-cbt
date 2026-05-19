import {
  View, Text, SectionList, Pressable, Linking, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ADDICTION_CENTERS, AddictionCenter } from '@/constants/addictionCenters';
import { colors, spacing, radius } from '@/constants/theme';

function CenterItem({ center }: { center: AddictionCenter }) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemName}>{center.name}</Text>
      <Text style={styles.itemAddress}>{center.address}</Text>
      <View style={styles.itemRow}>
        <Pressable
          onPress={() => Linking.openURL(`tel:${center.phone.replace(/-/g, '')}`)}
          style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="call-outline" size={12} color={colors.sageDark} />
          <Text style={styles.chipText}>{center.phone}</Text>
        </Pressable>
        {center.url && (
          <Pressable
            onPress={() => Linking.openURL(center.url!)}
            style={({ pressed }) => [styles.chip, styles.chipLink, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="globe-outline" size={12} color={colors.coral} />
            <Text style={[styles.chipText, styles.chipLinkText]}>홈페이지</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const sections = ADDICTION_CENTERS.map((r) => ({
  title: r.region,
  data: r.centers,
}));

export default function AddictionCentersScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>중독관리통합지원센터</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.name}
        renderItem={({ item }) => <CenterItem center={item} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />
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
  list: { paddingBottom: 40 },
  sectionHeader: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  item: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  itemAddress: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.sageSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.sageDark,
  },
  chipLink: {
    backgroundColor: colors.coralSofter,
  },
  chipLinkText: {
    color: colors.coral,
  },
  separator: {
    height: 8,
  },
});
