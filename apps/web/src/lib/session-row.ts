// 세션 행(881×140)의 공용 실측값 — 세션 목록(178:877)·대화 분석 목록(228:4628) 공통.
// 컴포넌트는 `components/session-row.tsx`. (상수를 분리한 건 react-refresh 규칙 때문이다.)

export const ROW_H = 140;
export const ROW_PITCH = 180;

/** 소요 시간 — 설계값(분)이 있으면 그것을, 끝난 세션은 실제 초를 분으로. 없으면 만들지 않는다. */
export function durationLabel(minutes: number | null, seconds: number | null): string | null {
  if (seconds != null) return `${Math.max(1, Math.round(seconds / 60))}분`;
  if (minutes != null) return `${minutes}분`;
  return null;
}
