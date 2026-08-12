// Pretendard 폰트 등록 — Figma 디자인의 기준 서체.
//
// 왜 필요한가: tailwind 에 'Pretendard' 라고 이름만 적어도 RN 은 폰트를 자동 탐색하지
// 않는다. 등록되지 않은 패밀리는 조용히 시스템 폰트로 폴백하며, Android 폴백
// (Roboto/Noto CJK)은 자형·굵기·자간이 Pretendard 와 확연히 달라 화면 전체가 다르게
// 보인다. 그래서 expo-font 로 명시 등록한다.
//
// RN 은 하나의 패밀리 안에서 굵기별 파일을 자동으로 골라주지 않으므로(특히 Android),
// **굵기별로 별도 패밀리를 등록**하고 tailwind 유틸(font-medium/semibold/bold)이
// 해당 패밀리를 가리키게 매핑한다(tailwind.config.js 플러그인).

/** 굵기별 등록 패밀리 이름 — tailwind.config.js 와 반드시 일치해야 한다. */
export const FONT = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

// Metro 는 에셋을 정적 require 로만 해석한다(Expo 공식 방식) → 이 파일에서만 규칙 해제.
/* eslint-disable @typescript-eslint/no-require-imports */

/** expo-font useFonts 에 넘기는 맵(정적 require 필요). */
export const FONT_MAP = {
  [FONT.regular]: require('../../assets/fonts/Pretendard-1.3.9/public/static/alternative/Pretendard-Regular.ttf'),
  [FONT.medium]: require('../../assets/fonts/Pretendard-1.3.9/public/static/alternative/Pretendard-Medium.ttf'),
  [FONT.semibold]: require('../../assets/fonts/Pretendard-1.3.9/public/static/alternative/Pretendard-SemiBold.ttf'),
  [FONT.bold]: require('../../assets/fonts/Pretendard-1.3.9/public/static/alternative/Pretendard-Bold.ttf'),
};
