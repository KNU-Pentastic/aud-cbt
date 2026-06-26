import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { colors, spacing, radius } from '@/constants/theme';

type Props = { days: number };

const SOJU_PRICE = 4500;
const SOJU_CALORIES = 360;
const TOTAL = 3;

export function InsightCard({ days }: Props) {
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const sentences = [
    `금주 ${days}일 동안 소주값으로 ${(days * SOJU_PRICE).toLocaleString()}원을 아꼈어요!`,
    `숙취 없이 일어난 개운한 아침 ${days}일차예요!`,
    `소주 1병 기준 약 ${(SOJU_CALORIES * days).toLocaleString()}kcal를 참아낸 ${days}일이에요!`,
  ];

  const flipTo = (newIdx: number) => {
    Animated.timing(rotateAnim, {
      toValue: 90,
      duration: 200,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      idxRef.current = newIdx;
      setIdx(newIdx);
      rotateAnim.setValue(-90);
      Animated.timing(rotateAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  };

  const handlePress = () => {
    flipTo((idxRef.current + 1) % TOTAL);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      flipTo((idxRef.current + 1) % TOTAL);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const rotateX = rotateAnim.interpolate({
    inputRange: [-90, 0, 90],
    outputRange: ['-90deg', '0deg', '90deg'],
  });

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        { transform: [{ perspective: 800 }, { rotateX }] },
      ]}
    >
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.topRow}>
          <Text style={styles.label}>오늘의 기록</Text>
          <View style={styles.dotRow}>
            {Array.from({ length: TOTAL }).map((_, i) => (
              <View key={i} style={[styles.dot, i === idx && styles.dotActive]} />
            ))}
          </View>
        </View>
        <Text style={styles.sentence}>{sentences[idx]}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: spacing.xl,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 13,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  label: {
    fontSize: 10,
    color: colors.textTertiary,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  dotRow: { flexDirection: 'row', gap: 3 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dotActive: { width: 10, backgroundColor: colors.coral },
  sentence: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19,
  },
});
