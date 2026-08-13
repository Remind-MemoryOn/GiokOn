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

/**
 * "최근 대화" 표시 — 오늘이면 '오늘', 어제면 '어제', 그 외 'M월 D일'.
 * 기록이 없으면 '없음'(Figma 디자인에도 '없음' 상태가 존재한다).
 * ⚠️ 예시 날짜를 만들지 않는다 — 반드시 실제 세션 시각을 넘긴다.
 */
export function lastTalkLabel(iso: string | null | undefined): string {
  if (!iso) return '없음';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '없음';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** "2026년 6월 24일 (수)" — Figma 대화 기록 날짜 제목 형식(core 의 `2026.06.24` 와 다름). */
export function longKoreanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

/**
 * 성별 표기 — DB enum('female'/'male') → 화면 문구. 미입력이면 null(표기 생략).
 * ⚠️ 값이 없을 때 임의로 채우지 않는다.
 */
export function genderLabel(g: 'female' | 'male' | undefined | null): string | null {
  if (g === 'female') return '여성';
  if (g === 'male') return '남성';
  return null;
}
