// ─── 알코올컷! 자연 테마 ──────────────────────────────────────────────────────
// 기반: 자연 컨셉 (딥그린 #2A7A69 + 오렌지 #F4A261 포인트)
// 이전 coral → 딥그린(primary), 이전 sage → 오렌지(갈망·응급 포인트)

export const colors = {
  // ── 메인 액션: 딥그린 ──────────────────────────────────────────────────────
  coral: '#2A7A69',          // 구 coral(주 액션색) → 이제 딥그린
  coralDark: '#1F5145',      // 어두운 딥그린
  coralSoft: '#E1F0EC',      // 밝은 그린 배경
  coralSofter: '#E1F0EC',
  coralSoftBg: '#E1F0EC',

  // ── 갈망·응급 포인트: 오렌지 ──────────────────────────────────────────────
  sage: '#F4A261',           // 구 sage(보조색) → 이제 오렌지
  sageSoft: '#FDF1E7',       // 오렌지 밝은 배경
  sageDark: '#2A7A69',       // 구 sageDark(진한 초록) → 이제 딥그린(primary 와 동일)

  // 오렌지 계열 추가 토큰
  orangeDark: '#C46A2A',     // 갈망 슬라이더 값 색
  orangeDeep: '#9C5A24',     // 오렌지 배경 위 텍스트
  orangeAlt: '#E08A3C',      // 119 버튼 배경
  orangeBorder: '#F4D9C2',   // 오렌지 카드 테두리
  orangeFade: '#FCEADB',     // 119 서브텍스트

  // ── 그린 계열 추가 토큰 ──────────────────────────────────────────────────
  primaryMuted: '#A9D2C7',   // 진행 중 단계 테두리 / 그린 배경 위 보조 텍스트
  primarySoft: '#BFE0D7',    // 그린 배경 위 서브텍스트

  // ── 세션 카드 (다크 그린) ─────────────────────────────────────────────────
  dark: '#2A7A69',           // 구 near-black → 이제 딥그린
  darkSoft: '#3D9080',       // 딥그린 내부 밝은 그린

  // ── 배경 / 서피스 ─────────────────────────────────────────────────────────
  background: '#F7F8F7',     // 구 따뜻한 베이지 → 쿨 그레이
  surface: '#FFFFFF',        // 카드 흰색
  surfaceWhite: '#FFFFFF',
  surfaceDim: '#FBFBFA',     // 비활성 카드 배경

  // ── 텍스트 ────────────────────────────────────────────────────────────────
  textPrimary: '#1F2A26',    // 주 텍스트
  textSecondary: '#5F5E5A',  // 보조 텍스트
  textTertiary: '#888780',   // 3차 텍스트
  textQuaternary: '#A6A59E', // 매우 흐린 텍스트
  textDisabled: '#6F6E69',   // 비활성 텍스트
  textOnDark: '#FFFFFF',
  textOnDarkMuted: '#A9D2C7', // 그린 배경 위 흐린 텍스트

  // ── 테두리 ────────────────────────────────────────────────────────────────
  border: '#EDEEEE',
  borderSoft: '#EDEEEE',
  borderLight: '#E3E5E1',    // 타임라인 연결선 등 더 옅은 테두리
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  card: 16,
  lg: 20,
  pill: 999,
} as const;

export const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
};

export const Fonts = {
  rounded: 'System',
  mono: 'SpaceMono',
};

export const Colors = {
  light: {
    text: '#1F2A26',
    background: '#F7F8F7',
    tint: '#2A7A69',
    icon: '#5F5E5A',
    tabIconDefault: '#888780',
    tabIconSelected: '#2A7A69',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#fff',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#fff',
  },
};
