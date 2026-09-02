/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── 신규 웹 디자인 토큰 (Figma 4iU6Zw4MhLAMZWlnPFgsCI, 1440 실측) ──
        // ⚠️ @giokon/theme 의 `webPalette` 미러다. tailwind.config 는 TS 를 import 할 수
        //    없어 값을 정합하며, `pnpm check:design` 이 두 곳의 동일성을 강제한다.
        accent: {
          DEFAULT: '#e9822b',
          soft: '#e9822b33',
          tint: '#e9822b1a',
        },
        ink: {
          900: '#000000',
          700: '#404040',
          // 시안 #7b7c7c 는 흰 배경 대비 4.18:1 → KWCAG 4.5:1 미달. 명도만 7% 낮춘 값
          // (틴트 카드 위에서도 4.5 를 넘긴다 — theme/index.ts 주석 참조).
          500: '#727373',
          400: '#6e6e6e',
        },
        line: {
          DEFAULT: '#d9d9d9',
          strong: '#707070',
          soft: '#e3e3e3',
          mid: '#cccdce',
        },
        alert: { DEFAULT: '#ff0004', soft: '#ff000408', line: '#ff000480' },
        info: { DEFAULT: '#1cb2d0', soft: '#1cb2d01a' },
        chronicle: { DEFAULT: '#d5379b', soft: '#d5379b1a' },
        live: { DEFAULT: '#60bd66', soft: '#60bd661a' },
        mute: { DEFAULT: '#f2f1f1', strong: '#efefef', pale: '#f5f5f5', field: '#d9d9d94d' },
        // 요양일지 태그(207:1147 실측) — 공개 관리·보호자 화면의 '요양일지' 배지에도 쓴다.
        journal: { DEFAULT: '#5d2b99', soft: '#5d2b991a' },
        manual: { DEFAULT: '#e92b90', soft: '#e92b901a' },
        naver: { DEFAULT: '#48b034' },
        kakao: { DEFAULT: '#f4df2a' },

        // ── 구 디자인 잔여 토큰 — 화면 이관이 끝나면 제거한다 ──
        brand: {
          50:  '#fdf7f0',
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
        // 어르신 화면 전용 따뜻한 톤 (Netlify 참고 사이트 기반)
        // ⚠️ 값은 @giokon/theme(palette) 단일 소스의 미러다 — tailwind.config 는
        //    TS 소스를 직접 import 할 수 없어 값을 정합하고, `pnpm check:design`
        //    이 두 곳의 동일성을 기계 검증한다.
        warm: {
          50:  '#fffaf3',
          100: '#fef3e2',
          200: '#fbe2c4',
          300: '#f6cda0',
          400: '#eeb077',
          500: '#e08e51',
          600: '#c87436',
          700: '#a35a2a',
          800: '#854621',
        },
        cream: {
          50: '#fffefb',
          100: '#fff8ed',
          200: '#fcefd9',
        },
      },
      fontFamily: {
        sans: ['"Pretendard"', '"Apple SD Gothic Neo"', '"Noto Sans KR"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // 신규 웹 디자인 타이포 실측 (webTokens.fontSize 미러)
        'w-page':    ['30px', '70px'],
        'w-section': ['25px', '70px'],
        'w-stat':    ['35px', '35px'],
        'w-cta':     ['24px', 'normal'],
        'w-nav':     ['22px', '30px'],
        'w-body':    ['20px', '28px'],
        'w-sub':     ['18px', '28px'],
        'w-label':   ['16px', '35px'],
        'elder-sm':   ['22px', '34px'],
        'elder-base': ['28px', '42px'],
        'elder-lg':   ['36px', '52px'],
        'elder-xl':   ['44px', '60px'],
        'elder-2xl':  ['56px', '72px'],
      },
      borderRadius: {
        'pill': '100px',
        'avatar': '63px',
      },
      spacing: {
        'mic': '160px',
        'mic-sm': '128px',
      },
      keyframes: {
        pulseRing: {
          '0%':   { transform: 'scale(1)', opacity: '0.55' },
          '100%': { transform: 'scale(1.7)', opacity: '0' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.6' },
          '50%':      { transform: 'scale(1.06)', opacity: '1' },
        },
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        gentleBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        'pulse-ring':  'pulseRing 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'breathe':     'breathe 2.4s ease-in-out infinite',
        'fade-in-up':  'fadeInUp 0.3s ease-out both',
        'gentle-bounce': 'gentleBounce 1.4s ease-in-out infinite',
      },
      boxShadow: {
        // 신규 웹 디자인 그림자 실측 (webTokens.shadow 미러)
        'topbar': '1px 1px 10px 0px rgba(108,101,101,0.13)',
        'card':   '1px 1px 8px 0px rgba(106,106,106,0.25)',
        'chip':   '1px 1px 10px 0px rgba(0,0,0,0.05)',
        'bubble': '1px 1px 8px 0px rgba(0,0,0,0.15)',
        'soft':  '0 2px 8px rgba(220, 122, 44, 0.08), 0 1px 3px rgba(15, 23, 42, 0.04)',
        'warm':  '0 8px 24px rgba(224, 142, 81, 0.18), 0 2px 6px rgba(224, 142, 81, 0.08)',
        'mic':   '0 12px 32px rgba(220, 80, 50, 0.25), 0 4px 12px rgba(220, 80, 50, 0.15)',
      },
    },
  },
  plugins: [],
}
