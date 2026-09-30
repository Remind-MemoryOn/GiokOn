// 화면 폭 모드 — 1440 고정 캔버스 vs 반응형(감독 화면).
//
// 웹은 Figma 1440 시안을 절대좌표로 그린다. 창이 좁아지면 본문은 1440 그대로 넘치는데
// 머리줄·카드처럼 폭을 따라 줄어드는 부분만 좁아져 글자가 두 줄로 밀렸다(2026-09-27 사용자 신고 —
// 1024 폭에서 11곳, 휴대폰 폭에서 68곳). 사용자 결정(2026-09-27):
//   · PC — 캔버스를 1440 아래로 줄이지 않는다(body `min-width:1440px`). 좁은 창은 가로 스크롤.
//   · 휴대폰 — 뷰포트를 1440 으로 알려 브라우저가 페이지 전체를 화면에 맞춰 축소해 보여 준다(확대 가능).
//   · 감독 화면(`/caregiver/supervision`)은 휴대폰 우선 반응형이라 예외 — 기기 폭 그대로.
// 첫 화면은 index.html 의 인라인 스크립트가 같은 규칙으로 먼저 정한다(깜빡임 방지).
// 규칙을 바꾸면 두 곳을 함께 바꾼다.
import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const DESIGN_WIDTH = 1440;
const FIXED_VIEWPORT = `width=${DESIGN_WIDTH}`;
const FLUID_VIEWPORT = 'width=device-width, initial-scale=1.0';

/** 반응형(기기 폭)으로 그리는 경로. 나머지는 전부 1440 고정 캔버스. */
export function isFluidPath(pathname: string): boolean {
  return pathname === '/caregiver/supervision' || pathname.startsWith('/caregiver/supervision/');
}

/** 경로가 바뀔 때 `<html data-canvas>` 와 viewport 메타를 맞춘다. */
export function useViewportMode(): void {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    const fluid = isFluidPath(pathname);
    document.documentElement.dataset.canvas = fluid ? 'fluid' : 'fixed';
    const meta = document.querySelector('meta[name="viewport"]');
    const content = fluid ? FLUID_VIEWPORT : FIXED_VIEWPORT;
    if (meta && meta.getAttribute('content') !== content) meta.setAttribute('content', content);
  }, [pathname]);
}
