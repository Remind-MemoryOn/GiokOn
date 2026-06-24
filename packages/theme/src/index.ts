// @giokon/theme — 디자인 토큰 단일 소스 (웹 Tailwind + 모바일 NativeWind 공용)
//
// Figma Variables와 1:1로 맞춘다. 어르신 화면 접근성 기본값을 토큰에 내장한다.
// 색 팔레트는 Figma 핸드오프 후 M4에서 확정한다(여기서는 임의 색 정의 금지).

export const tokens = {
  // 어르신 화면 접근성 기준 — 본문 ≥ 18pt, 터치 타깃 ≥ 60px
  a11y: {
    minBodyFontPt: 18,
    minTouchTargetPx: 60,
  },
  // 타이포 스케일 (어르신 대형 단계 포함) — 단위 px
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

export type Tokens = typeof tokens
