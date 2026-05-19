import { ScrollView, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { useSobriety } from '@/context/SobrietyContext';
import { GreetingHeader } from '@/components/home/GreetingHeader';
import { SobrietyCounterCard } from '@/components/home/SobrietyCounterCard';
import { ProgramProgressCard } from '@/components/home/ProgramProgressCard';
import { TodaySessionCard } from '@/components/home/TodaySessionCard';
import { QuickActions } from '@/components/home/QuickActions';
import { TodayCheckinCard } from '@/components/home/TodayCheckinCard';
import { InsightCard } from '@/components/home/InsightCard';

export default function HomeScreen() {
  const { days, bestStreak, goal } = useSobriety();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <GreetingHeader name="지훈" />

        <SobrietyCounterCard days={days} bestStreak={bestStreak} goal={goal} />

        <ProgramProgressCard
          currentWeek={3}
          totalWeeks={12}
          weekTitle="음주 갈망 다스리기"
        />

        <TodaySessionCard
          sessionNumber={7}
          title="트리거 인식하기"
          duration="약 15분"
        />

        <QuickActions />

        <TodayCheckinCard />

        <InsightCard days={days} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 8 },
});
