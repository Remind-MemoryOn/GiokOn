/** @type {import('tailwindcss').Config} */
// 색·타이포 토큰은 @giokon/theme(단일 소스, src/index.ts의 `figma`/`palette`)를 미러한다.
// (tailwind.config는 CommonJS라 TS 소스를 직접 require할 수 없어 웹과 동일하게 값을 정합한다.)
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#e9822b', pressed: '#c86f22' },
        card: '#fdf8f2', // 카드 배경(주황 7% 틴트 근사)
        aicard: '#fdf3ea', // 대화 AI 질문 카드
        ink: '#1a1a1a', // 본문 진한 텍스트
        muted: '#7b7c7c', // 보조 텍스트
        line: '#cccdce', // 보더/입력
        positive: '#3fa34d',
        danger: '#d8503c',
        brand: {
          50: '#fdf7f0',
          100: '#fbeede',
          200: '#f6d8b3',
          300: '#efbb81',
          400: '#e89a52',
          500: '#dc7a2c',
          600: '#c06223',
          700: '#9c4d20',
          800: '#7d3f20',
          900: '#65351d',
        },
        warm: {
          50: '#fffaf3',
          100: '#fef3e2',
          200: '#fbe2c4',
          300: '#f6cda0',
          400: '#eeb077',
          500: '#e08e51',
          600: '#c87436',
          700: '#a35a2a',
        },
        cream: {
          50: '#fffefb',
          100: '#fff8ed',
          200: '#fcefd9',
        },
      },
      fontFamily: {
        sans: ['Pretendard', 'System'],
      },
      // 어르신 화면 대형 타이포(접근성 ≥18pt) — 단위 px
      fontSize: {
        'elder-sm': '22px',
        'elder-base': '28px',
        'elder-lg': '36px',
        'elder-xl': '44px',
      },
      borderRadius: {
        card: '10px',
      },
    },
  },
  plugins: [],
};
