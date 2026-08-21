// @giokon/theme — 디자인 토큰 단일 소스 (웹 Tailwind + 모바일 NativeWind 공용)
//
// 두 디자인 트랙이 각자의 토큰을 갖는다.
//   - `palette`/`figma`/`elderFontSize` … 어르신 대화 앱(apps/mobile) — 파일 nLfWkg2H7dFfDH1pehcH5I
//   - `webPalette`/`webTokens`          … 관리 웹(apps/web) — 파일 4iU6Zw4MhLAMZWlnPFgsCI (2026-08 전면 교체)
// 두 파일 모두 Figma Variables 를 쓰지 않아 **fill 실측값**을 토큰으로 승격했다.
// 어르신 화면 접근성 기본값(본문 ≥ 18pt, 터치 타깃 ≥ 60px)을 토큰에 내장한다.

// ── 색 팔레트 ──────────────────────────────────────────────────────────
export const palette = {
  // 브랜드(요양보호사 웹 주조색)
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
  // 어르신 화면 전용 따뜻한 톤 + 웹 인증 화면 배경·강조
  warm: {
    50: '#fffaf3',
    100: '#fef3e2',
    200: '#fbe2c4',
    300: '#f6cda0',
    400: '#eeb077',
    500: '#e08e51',
    600: '#c87436',
    700: '#a35a2a',
    // 800: 700 까지의 감쇠비(≈0.78~0.82)를 이어 확정. 대비 6.6:1(AA).
    800: '#854621',
  },
  cream: {
    50: '#fffefb',
    100: '#fff8ed',
    200: '#fcefd9',
  },
} as const

// ── Figma 앱 디자인에서 추출·확정한 토큰 (파일 nLfWkg2H7dFfDH1pehcH5I, 2026-07-13) ──
// 어르신 대화 앱(Expo)의 단일 소스. 값은 Figma 디자인 컨텍스트에서 직접 추출했다
// (raw hex — 이 파일은 Figma Variables를 거의 쓰지 않아 fill 값을 그대로 정합).
export const figma = {
  color: {
    accent: '#e9822b', // 브랜드 주황(버튼·워드마크·강조)
    accentPressed: '#c86f22',
    cardTint: '#fdf8f2', // 카드 배경 rgba(233,130,43,0.07) 불투명 근사
    aiCard: '#fdf3ea', // 대화 AI 질문 카드 배경
    field: '#f4f4f4', // 입력 필드 채움(Figma 로그인 실측)
    surface: '#ffffff',
    textPrimary: '#1a1a1a',
    textSecondary: '#7b7c7c',
    border: '#cccdce',
    positive: '#3fa34d', // 감정/관찰 긍정 표시
    danger: '#d8503c', // 위기 배너
    gradientEnd: '#f4c398', // 스플래쉬 하단 그라데이션 종단(실측 샘플링)
  },
  // Figma 실측: 입력·버튼 라운드는 5(기존 10은 근사값이었음).
  radius: { card: 10, button: 5, input: 5, pill: 999 },
  // 화면 표준 폭(디자인 프레임 393px 기준). 모바일은 반응형이지만 카드 여백 근거로 사용.
  frameWidth: 393,
} as const

// ── 관리 웹 디자인 토큰 (Figma 4iU6Zw4MhLAMZWlnPFgsCI, 2026-08-18 전면 교체) ──
// 실측 출처: 로그인 `15:443` · 대시보드 `118:300` 의 get_design_context.
// 화면↔노드 맵과 절차는 docs/runbooks/figma-web-extraction.md.
export const webPalette = {
  // 브랜드 주황 — 앱과 같은 계열(#e9822b).
  //   soft = 사이드바 활성 배경(20% 틴트, `198:572` 실측)
  //   tint = 배지·태그 배경(10% 틴트, `195:344`·`198:905` 실측) — 다른 상태색과 같은 농도
  accent: {
    DEFAULT: '#e9822b',
    soft: '#e9822b33',
    tint: '#e9822b1a',
  },
  // 텍스트 계층: 제목=black, 본문=#404040, 보조=#7b7c7c, 뱃지 회색=#6e6e6e
  ink: {
    900: '#000000',
    700: '#404040',
    500: '#7b7c7c',
    400: '#6e6e6e',
  },
  // 선: 카드 테두리·리스트 구분선 #d9d9d9, 로그인 구분선 #707070
  line: {
    DEFAULT: '#d9d9d9',
    strong: '#707070',
  },
  // 상태색 — 각 10% 틴트를 배경으로 쓴다(뱃지·배너).
  alert: { DEFAULT: '#ff0004', soft: '#ff000408', line: '#ff000480' },
  info: { DEFAULT: '#1cb2d0', soft: '#1cb2d01a' },
  chronicle: { DEFAULT: '#d5379b', soft: '#d5379b1a' },
  live: { DEFAULT: '#60bd66', soft: '#60bd661a' },
  mute: { DEFAULT: '#f2f1f1', strong: '#efefef', pale: '#f5f5f5', field: '#d9d9d94d' },
  // 연대기 출처 태그 — AI 자동은 accent, 사람이 쓴 것은 이 분홍(어르신 상세 195:351 실측).
  manual: { DEFAULT: '#e92b90', soft: '#e92b901a' },
  // 소셜 로그인 브랜드 고정색
  naver: { DEFAULT: '#48b034' },
  kakao: { DEFAULT: '#f4df2a' },
} as const

/** 웹 그림자·치수·타이포 — 1440 캔버스 실측. */
export const webTokens = {
  /** 디자인 캔버스 폭. 콘텐츠 치수의 기준. */
  frameWidth: 1440,
  layout: {
    topBarHeight: 122,
    sidebarWidth: 296, // 콘텐츠 열 시작(323) 직전까지
    sidebarItemGap: 79, // 대시보드 186 → 어르신 관리 265 → …
    sidebarActive: { width: 208, height: 57, radius: 10, left: 44 },
    contentLeft: 323,
    contentWidth: 1054, // 1440 - 323 - 63
    listInset: 52, // 카드 안 리스트 좌우 여백(375 - 323)
    authColumnWidth: 568,
  },
  radius: { card: 10, field: 10, button: 10, chip: 5, pill: 100, avatar: 63 },
  shadow: {
    topBar: '1px 1px 10px 0px rgba(108,101,101,0.13)',
    card: '1px 1px 8px 0px rgba(106,106,106,0.25)',
    chip: '1px 1px 10px 0px rgba(0,0,0,0.05)',
  },
  /** [fontSize, lineHeight] px — Figma 실측 그대로. */
  fontSize: {
    'w-page': ['30px', '70px'], // 페이지 제목 Bold
    'w-section': ['25px', '70px'], // 섹션 제목·어르신 이름 Bold
    'w-stat': ['35px', '35px'], // 통계 숫자 SemiBold
    'w-cta': ['24px', 'normal'], // 주 버튼 SemiBold
    'w-nav': ['22px', '30px'], // 사이드바·탑바·폼 라벨 SemiBold
    'w-body': ['20px', '28px'], // 본문·플레이스홀더
    'w-sub': ['18px', '28px'], // 뱃지·보조 설명
    'w-label': ['16px', '35px'], // 통계 라벨
  },
} as const

export const fontFamily = {
  sans: ['"Pretendard"', '"Apple SD Gothic Neo"', '"Noto Sans KR"', 'system-ui', 'sans-serif'],
} as const

// 어르신 화면 대형 타이포 [fontSize, lineHeight] (px) — 접근성 우선
export const elderFontSize = {
  'elder-sm': ['22px', '34px'],
  'elder-base': ['28px', '42px'],
  'elder-lg': ['36px', '52px'],
  'elder-xl': ['44px', '60px'],
  'elder-2xl': ['56px', '72px'],
} as const

// 마이크 버튼 등 대형 터치 타깃(≥ 60px 보장)
export const extraSpacing = {
  mic: '160px',
  'mic-sm': '128px',
} as const

export const boxShadow = {
  soft: '0 2px 8px rgba(220, 122, 44, 0.08), 0 1px 3px rgba(15, 23, 42, 0.04)',
  warm: '0 8px 24px rgba(224, 142, 81, 0.18), 0 2px 6px rgba(224, 142, 81, 0.08)',
  mic: '0 12px 32px rgba(220, 80, 50, 0.25), 0 4px 12px rgba(220, 80, 50, 0.15)',
} as const

export const keyframes = {
  pulseRing: {
    '0%': { transform: 'scale(1)', opacity: '0.55' },
    '100%': { transform: 'scale(1.7)', opacity: '0' },
  },
  breathe: {
    '0%, 100%': { transform: 'scale(1)', opacity: '0.6' },
    '50%': { transform: 'scale(1.06)', opacity: '1' },
  },
  fadeInUp: {
    '0%': { opacity: '0', transform: 'translateY(10px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },
  gentleBounce: {
    '0%, 100%': { transform: 'translateY(0)' },
    '50%': { transform: 'translateY(-4px)' },
  },
} as const

export const animation = {
  'pulse-ring': 'pulseRing 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  breathe: 'breathe 2.4s ease-in-out infinite',
  'fade-in-up': 'fadeInUp 0.3s ease-out both',
  'gentle-bounce': 'gentleBounce 1.4s ease-in-out infinite',
} as const

// ── 플랫폼 무관 시맨틱 토큰 (숫자 px) ──────────────────────────────────
// 모바일(NativeWind)·계산용. 웹은 아래 tailwindExtend를 직접 소비한다.
export const tokens = {
  // 어르신 화면 접근성 기준
  a11y: {
    minBodyFontPt: 18,
    minTouchTargetPx: 60,
  },
  // 타이포 스케일(어르신 대형 단계 포함) — 단위 px
  fontSize: {
    sm: 16,
    base: 18,
    lg: 22,
    xl: 28,
    '2xl': 36,
  },
  // 간격 스케일 — 단위 px
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 6,
    md: 12,
    lg: 20,
    full: 9999,
  },
} as const

// ── Tailwind theme.extend 소비 형태 ────────────────────────────────────
// T4.2(웹 어댑터)에서 `theme.extend = tailwindExtend`로 소비한다.
export const tailwindExtend = {
  colors: palette,
  fontFamily,
  fontSize: elderFontSize,
  spacing: extraSpacing,
  boxShadow,
  keyframes,
  animation,
} as const

export type Palette = typeof palette
export type Tokens = typeof tokens
export type TailwindExtend = typeof tailwindExtend
export type FigmaTokens = typeof figma
export type WebPalette = typeof webPalette
export type WebTokens = typeof webTokens
