// 화면 폭 대응 — Figma 는 폭 393 한 가지로 그려져 있다(콘텐츠 = 좌 29 · 폭 336 · 우 28).
//
// 기기 폭이 다르면(폭 360 휴대폰·패드) 고정 폭 336 카드는 오른쪽이 잘리거나 왼쪽에 몰리고,
// 왼쪽 좌표로 둔 오른쪽 아이콘은 엉뚱한 자리에 간다(사용자 지적 2026-10-15). 규칙:
//   · 카드·입력·버튼처럼 가로로 펼쳐지는 요소 = 콘텐츠 폭(기기 폭 − 57)
//   · 카드 안 오른쪽 요소(화살표·휴지통·값) = 카드 오른쪽 끝 기준(right)
//   · 가운데 요소(로고·그림·차트) = 가운데 정렬
// 393 폭에서는 콘텐츠 폭이 336 이라 Figma 와 같은 자리다.
import { useWindowDimensions } from 'react-native';

/** Figma 프레임 폭. */
export const FRAME_W = 393;
/** Figma 콘텐츠 좌·우 여백. */
export const GUTTER_LEFT = 29;
export const GUTTER_RIGHT = 28;
/** Figma 콘텐츠 폭(393 − 29 − 28). */
export const FRAME_CONTENT_W = FRAME_W - GUTTER_LEFT - GUTTER_RIGHT;

/** 기기 폭 → 콘텐츠 폭. */
export function contentWidthFor(screenWidth: number): number {
  return Math.max(0, Math.round(screenWidth) - GUTTER_LEFT - GUTTER_RIGHT);
}

/**
 * 기기 폭에 맞춘 콘텐츠 폭과 Figma 대비 증감.
 * `extra` 는 Figma 336 기준 고정 폭(구분선·막대·차트 축 등)에 더해 같은 비율로 늘리는 데 쓴다.
 */
export function useContentWidth(): { contentW: number; extra: number } {
  const { width } = useWindowDimensions();
  const contentW = contentWidthFor(width);
  return { contentW, extra: contentW - FRAME_CONTENT_W };
}
