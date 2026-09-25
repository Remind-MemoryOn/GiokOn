// 인지 효과 분석 요약 — 관찰 근거에서만 등급·문장을 만든다(디자인의 예시 문장은 쓰지 않는다).
import type { AxisObservation, ObservationAxis } from '@giokon/core';

/** 레이더·범례 표시 순서(Figma 배치와 동일). */
export const AXIS_ORDER: ObservationAxis[] = ['recall', 'emotion', 'participation', 'focus', 'expression'];

/** 표시 순서대로 5축을 채운다. 측정이 없는 축은 값·변화 모두 null. */
export function orderAxes(axes: readonly AxisObservation[]): AxisObservation[] {
  const byAxis = new Map<ObservationAxis, AxisObservation>(axes.map((a) => [a.axis, a]));
  return AXIS_ORDER.map((k) => byAxis.get(k) ?? { axis: k, value: null, delta: null });
}

export interface ObservationSummary {
  /** 측정된 축의 평균 변화량(%p, 반올림). 비교할 이전 기간이 없으면 null. */
  avgDelta: number | null;
  grade: string | null;
  summarySentence: string;
}

/**
 * 종합 평가 — 측정된 축의 평균 변화량으로 등급을 매긴다(임의 문구 금지).
 * `subject` 는 이전 기간 기록이 없을 때 문장 앞에 붙는 대상("김순자 어르신의" / "담당 어르신의").
 */
export function summarizeObservations(ordered: readonly AxisObservation[], subject: string): ObservationSummary {
  const deltas = ordered.map((a) => a.delta).filter((d): d is number => d !== null);
  const avgDelta = deltas.length
    ? Math.round(deltas.reduce((n, d) => n + d, 0) / deltas.length)
    : null;
  const measured = ordered.filter((a) => a.value !== null).length;
  return { avgDelta, grade: gradeOf(avgDelta), summarySentence: sentenceOf(measured, avgDelta, subject) };
}

function gradeOf(avgDelta: number | null): string | null {
  if (avgDelta === null) return null;
  if (avgDelta >= 10) return '매우 긍정적';
  if (avgDelta > 0) return '긍정적';
  if (avgDelta === 0) return '변화 없음';
  return '주의 관찰';
}

function sentenceOf(measured: number, avgDelta: number | null, subject: string): string {
  if (measured === 0) return '아직 관찰된 기록이 없어요. 대화가 쌓이면 지표를 보여드려요.';
  if (avgDelta === null) {
    return `${subject} 관찰 지표 ${measured}개를 측정했어요. 비교할 이전 기간 기록이 아직 없어요.`;
  }
  return `관찰 지표 ${measured}개 기준으로 직전 동일 기간 대비 평균 ${avgDelta > 0 ? '+' : ''}${avgDelta}%p 변화가 관찰됐어요.`;
}
