// 집계 기간 — 분석 화면의 "최근 3개월 ∨" pill 이 고르는 값.
//
// Figma 는 pill 을 그려만 뒀고 동작이 없었다(사용자 지적 2026-08-13 "클릭조차 안 됨").
// 화면마다 고를 수 있는 폭이 달라서(전체 분석은 '전체 기간'이 기본, 인지 효과 분석은
// 직전 동일 기간과 비교하므로 최소 3개월) 옵션 목록을 화면별로 둔다.

/** 최근 N개월. null = 전체 기간(자르지 않음). */
export type PeriodMonths = number | null;

export interface PeriodOption {
  label: string;
  months: PeriodMonths;
}

/** 전체 분석 — 기본은 전체 기간. */
export const OVERALL_PERIODS: PeriodOption[] = [
  { label: '전체 기간', months: null },
  { label: '최근 12개월', months: 12 },
  { label: '최근 6개월', months: 6 },
  { label: '최근 3개월', months: 3 },
  { label: '최근 1개월', months: 1 },
];

/** 인지 효과 분석 — 직전 동일 기간과 비교하므로 3개월 이상만. */
export const TREND_PERIODS: PeriodOption[] = [
  { label: '최근 3개월', months: 3 },
  { label: '최근 6개월', months: 6 },
  { label: '최근 12개월', months: 12 },
];

/** 주제별 분석 — 월별 추이 길이. */
export const TOPIC_PERIODS: PeriodOption[] = [
  { label: '최근 3개월', months: 3 },
  { label: '최근 6개월', months: 6 },
  { label: '최근 12개월', months: 12 },
];

/** 기간 시작 시각(ISO). null(전체 기간)이면 undefined. */
export function periodStart(months: PeriodMonths, now = new Date()): string | undefined {
  if (months === null) return undefined;
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.toISOString();
}

/** 기간 안의 항목만 남긴다(기간이 전체면 그대로). */
export function withinPeriod<T>(items: T[], at: (x: T) => string, months: PeriodMonths): T[] {
  const from = periodStart(months);
  if (!from) return items;
  return items.filter((x) => at(x) >= from);
}
