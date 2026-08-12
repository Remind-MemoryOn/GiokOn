// 지표 표시 포맷 — 실서비스 원칙: **근거 없는 값을 만들어내지 않는다.**
//
// 집계 함수(@giokon/core observations)는 측정 근거가 없으면 null 을 반환한다.
// 화면은 이 헬퍼로 null 을 '—'(미측정)으로 표시해야 한다. 템플릿 문자열에 null 을
// 그대로 끼우면 "null분"처럼 렌더되므로 반드시 이 헬퍼를 경유한다.

/** 미측정 표시 문자. */
export const NO_VALUE = '—';

/**
 * 숫자 지표 + 단위. 값이 null/undefined 면 '—'.
 *   metric(12, '분') → '12분' · metric(null, '분') → '—'
 */
export function metric(value: number | null | undefined, suffix = ''): string {
  return value === null || value === undefined ? NO_VALUE : `${value}${suffix}`;
}
