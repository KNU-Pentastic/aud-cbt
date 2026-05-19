import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { colors, spacing, radius } from '@/constants/theme';

type Props = { days: number };

const SOJU_PRICE = 4500;
const SOJU_CALORIES = 360;
const TOTAL = 3;
// const SLIDE_WIDTH = 353;

export function InsightCard({ days }: Props) {
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  // const slideAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const sentences = [
    `금주 ${days}일 동안 소주값으로 ${(days * SOJU_PRICE).toLocaleString()}원을 아꼈어요!`,
    `숙취 없이 일어난 개운한 아침 ${days}일차예요!`,
    `소주 1병 기준 약 ${(SOJU_CALORIES * days).toLocaleString()}kcal를 참아낸 ${days}일이에요!`,
  ];

  // --- 슬라이드 전환 (주석 처리) ---
  // const slideTo = (direction: 'left' | 'right', newIdx: number) => {
  //   const exitTo = direction === 'left' ? -SLIDE_WIDTH : SLIDE_WIDTH;
  //   const enterFrom = direction === 'left' ? SLIDE_WIDTH : -SLIDE_WIDTH;
  //   Animated.timing(slideAnim, {
  //     toValue: exitTo,
  //     duration: 160,
  //     useNativeDriver: true,
  //   }).start(() => {
  //     idxRef.current = newIdx;
  //     setIdx(newIdx);
  //     slideAnim.setValue(enterFrom);
  //     Animated.timing(slideAnim, {
  //       toValue: 0,
  //       duration: 160,
  //       useNativeDriver: true,
  //     }).start();
  //   });
  // };

  // --- PanResponder 슬라이드 제스처 (주석 처리) ---
  // const panResponder = useRef(
  //   PanResponder.create({
  //     onMoveShouldSetPanResponderCapture: (_, gs) =>
  //       Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 4,
  //     onMoveShouldSetPanResponder: (_, gs) =>
  //       Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 4,
  //     onStartShouldSetPanResponder: () => true,
  //     onPanResponderMove: (_, gs) => {
  //       slideAnim.setValue(gs.dx * 0.35);
  //     },
  //     onPanResponderRelease: (_, gs) => {
  //       const cur = idxRef.current;
  //       if (Math.abs(gs.dx) <= 4 && Math.abs(gs.dy) <= 4) {
  //         slideTo('left', (cur + 1) % TOTAL);
  //       } else if (gs.dx < -8) {
  //         slideTo('left', (cur + 1) % TOTAL);
  //       } else if (gs.dx > 8) {
  //         slideTo('right', (cur - 1 + TOTAL) % TOTAL);
  //       } else {
  //         Animated.spring(slideAnim, {
  //           toValue: 0,
  //           useNativeDriver: true,
  //           tension: 200,
  //           friction: 18,
  //         }).start();
  //       }
  //     },
  //     onPanResponderTerminate: () => {
  //       Animated.spring(slideAnim, {
  //         toValue: 0,
  //         useNativeDriver: true,
  //         tension: 200,
  //         friction: 18,
  //       }).start();
  //     },
  //   })
  // ).current;

  const flipTo = (newIdx: number) => {
    // 위→아래 방향 90도 (카드 위가 앞쪽으로 접힘)
    Animated.timing(rotateAnim, {
      toValue: 90,
      duration: 200,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      idxRef.current = newIdx;
      setIdx(newIdx);
      // 반대편(-90)에서 올라오도록 설정 후 0으로 복귀
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
          {/* 인덱스 닷 (주석 처리)
          <View style={styles.dots}>
            {sentences.map((_, i) => (
              <View key={i} style={[styles.dot, i === idx && styles.dotActive]} />
            ))}
          </View>
          */}
        </View>
        <Text style={styles.sentence}>{sentences[idx]}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
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
  cardWrapper: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  // dots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  // dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border },
  // dotActive: { width: 10, height: 4, borderRadius: 2, backgroundColor: colors.coral },
  // sentenceClip: { overflow: 'hidden' },
  sentence: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19,
  },
});
