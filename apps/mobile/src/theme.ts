// 인라인 스타일·아이콘 색에 쓰는 상수(단일 소스 @giokon/theme의 figma 토큰 재노출).
// className(NativeWind)로 표현 가능한 건 className을 우선 쓰고, StatusBar/SVG/애니메이션
// 등 값이 필요한 곳에서만 이 상수를 쓴다.
import { figma } from '@giokon/theme';

export const C = figma.color;
export const RADIUS = figma.radius;
