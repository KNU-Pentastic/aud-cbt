export const colors = {
  // Coral - 주요 액션 색
  coral: '#E08868',
  coralDark: '#C56F50',
  coralSoft: '#F8E0DA',
  coralSofter: '#FDF1EC',
  coralSoftBg: '#FAEAE4',

  // Sage - 보조 색
  sage: '#A4B89E',
  sageSoft: '#E5EDDF',
  sageDark: '#5C7355',

  // Dark - 오늘의 세션 카드용
  dark: '#1E2230',
  darkSoft: '#2E3242',

  // Surfaces
  background: '#F4EADF',
  surface: '#FCF7F0',
  surfaceWhite: '#FFFFFF',

  // Text
  textPrimary: '#2D2A26',
  textSecondary: '#7A746C',
  textTertiary: '#B0A99E',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: 'rgba(255, 255, 255, 0.65)',

  // Borders
  border: '#E8DDD0',
  borderSoft: '#F0E8DC',
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
  lg: 20,
  pill: 999,
} as const;

export const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
};

export const Fonts = {
  rounded: 'System',
  mono: 'SpaceMono',
};

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: '#0a7ea4',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#0a7ea4',
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
