/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
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
        warm: {
          50:  '#fffaf3',
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
        sans: ['"Pretendard"', '"Apple SD Gothic Neo"', '"Noto Sans KR"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'elder-sm':   ['22px', '34px'],
        'elder-base': ['28px', '42px'],
        'elder-lg':   ['36px', '52px'],
        'elder-xl':   ['44px', '60px'],
        'elder-2xl':  ['56px', '72px'],
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
        'soft':  '0 2px 8px rgba(220, 122, 44, 0.08), 0 1px 3px rgba(15, 23, 42, 0.04)',
        'warm':  '0 8px 24px rgba(224, 142, 81, 0.18), 0 2px 6px rgba(224, 142, 81, 0.08)',
        'mic':   '0 12px 32px rgba(220, 80, 50, 0.25), 0 4px 12px rgba(220, 80, 50, 0.15)',
      },
    },
  },
  plugins: [],
}
