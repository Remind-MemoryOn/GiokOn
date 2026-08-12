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
        field: '#f4f4f4', // 입력 필드 채움(Figma 실측)
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
        // expo-font 로 등록한 실제 패밀리명(src/lib/fonts.ts FONT 와 일치).
        // 기본(굵기 미지정) 텍스트도 Pretendard 로 렌더된다.
        sans: ['Pretendard-Regular'],
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
        // Figma 실측: 입력·버튼 라운드 5
        input: '5px',
        btn: '5px',
      },
    },
  },
  plugins: [
    // 굵기 유틸 → Pretendard 굵기별 패밀리 매핑.
    // RN(특히 Android)은 fontWeight 만으로 패밀리 내 굵기 파일을 골라주지 않으므로,
    // font-medium/semibold/bold 가 등록된 별도 패밀리를 직접 가리키게 한다.
    // (fontWeight 도 함께 유지 — iOS 렌더링·접근성 정보에 유용)
    require('tailwindcss/plugin')(({ addUtilities }) => {
      addUtilities({
        '.font-normal': { fontFamily: 'Pretendard-Regular', fontWeight: '400' },
        '.font-medium': { fontFamily: 'Pretendard-Medium', fontWeight: '500' },
        '.font-semibold': { fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
        '.font-bold': { fontFamily: 'Pretendard-Bold', fontWeight: '700' },
        // Figma 에 ExtraBold 사용처가 있으면 Bold 로 근사(등록 파일 최소화).
        '.font-extrabold': { fontFamily: 'Pretendard-Bold', fontWeight: '700' },
      });
    }),
  ],
};
