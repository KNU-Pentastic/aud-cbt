import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';

type Action = {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  iconColor: string;
  href?: string;
};

const actions: Action[] = [
  {
    id: 'workbook',
    label: '생각 노트',
    subtitle: '생각을 기록해요',
    icon: 'create-outline',
    iconBg: colors.sageSoft,
    iconColor: colors.sageDark,
    href: '/notes',
  },
  {
    id: 'craving',
    label: '갈망 대응',
    subtitle: 'AI와 즉시 대화',
    icon: 'pulse-outline',
    iconBg: colors.coralSofter,
    iconColor: colors.coral,
    href: '/chat/new?kind=craving',
  },
  {
    id: 'stats',
    label: '통계',
    subtitle: '회복 흐름 보기',
    icon: 'trending-up-outline',
    iconBg: colors.sageSoft,
    iconColor: colors.sageDark,
    href: '/progress',
  },
];

export function QuickActions() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          onPress={() => {
            if (action.href) {
              router.push(action.href as any);
            } else {
              console.log(action.id);
            }
          }}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        >
          <View style={[styles.iconBg, { backgroundColor: action.iconBg }]}>
            <Ionicons name={action.icon} size={16} color={action.iconColor} />
          </View>
          <Text style={styles.label}>{action.label}</Text>
          <Text style={styles.subtitle}>{action.subtitle}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: 10,
    marginBottom: spacing.md,
  },
  tile: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    alignItems: 'flex-start',
    gap: 6,
  },
  tilePressed: { opacity: 0.6 },
  iconBg: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: 10, color: colors.textSecondary },
});
