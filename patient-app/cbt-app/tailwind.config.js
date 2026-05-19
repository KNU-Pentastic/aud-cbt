/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Coral - 주요 액션 색
        coral: {
          DEFAULT: '#E08868',
          dark: '#C56F50',
          soft: '#F8E0DA',
          softer: '#FDF1EC',
        },
        // Sage - 보조 색
        sage: {
          DEFAULT: '#A4B89E',
          soft: '#E5EDDF',
          dark: '#5C7355',
        },
        // Navy - 오늘의 세션 카드용 다크
        navy: {
          DEFAULT: '#1E2230',
          soft: '#2E3242',
        },
        // 페이지 배경
        cream: '#F4EADF',
        // 카드 표면
        surface: '#FCF7F0',
        // 텍스트 색
        ink: {
          primary: '#2D2A26',
          secondary: '#7A746C',
          tertiary: '#B0A99E',
          inverse: '#FFFFFF',
          'inverse-muted': 'rgba(255, 255, 255, 0.65)',
        },
        // 보더 색
        line: {
          DEFAULT: '#E8DDD0',
          soft: '#F0E8DC',
        },
      },
    },
  },
  plugins: [],
};
