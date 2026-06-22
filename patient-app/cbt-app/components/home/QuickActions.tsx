import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, radius } from '@/constants/theme';

type Action = {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  href: string;
};

const actions: Action[] = [
  {
    id: 'craving',
    label: '갈망 대화',
    subtitle: '언제든 바로',
    icon: 'chatbubble-ellipses-outline',
    href: '/chat/new?kind=craving',
  },
  {
    id: 'notes',
    label: '생각 노트',
    subtitle: '기록하기',
    icon: 'create-outline',
    href: '/notes',
  },
];

export function QuickActions() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          onPress={() => router.push(action.href as any)}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        >
          <Ionicons name={action.icon} size={19} color={colors.coral} />
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
    gap: 8,
    marginBottom: 10,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    gap: 5,
  },
  tilePressed: { opacity: 0.6 },
  label: { fontSize: 12, fontWeight: '500', color: colors.textPrimary },
  subtitle: { fontSize: 10, color: colors.textTertiary },
});
