import { describe, expect, it } from 'vitest';
import type { AxisObservation } from '@giokon/core';
import { AXIS_ORDER, orderAxes, summarizeObservations } from './summary';

const ax = (axis: AxisObservation['axis'], value: number | null, delta: number | null): AxisObservation => ({ axis, value, delta });

describe('orderAxes', () => {
  it('returns all five axes in display order, filling missing ones with nulls', () => {
    const ordered = orderAxes([ax('focus', 40, 5), ax('recall', 70, -2)]);
    expect(ordered.map((a) => a.axis)).toEqual(AXIS_ORDER);
    expect(ordered[0]).toEqual(ax('recall', 70, -2));
    expect(ordered[1]).toEqual(ax('emotion', null, null));
    expect(ordered[3]).toEqual(ax('focus', 40, 5));
  });
});

describe('summarizeObservations', () => {
  const subject = '김순자 어르신의';

  it('without any measurement shows the empty sentence and no grade', () => {
    expect(summarizeObservations(orderAxes([]), subject)).toEqual({
      avgDelta: null, grade: null,
      summarySentence: '아직 관찰된 기록이 없어요. 대화가 쌓이면 지표를 보여드려요.',
    });
  });

  it('with values but no previous period names the subject', () => {
    expect(summarizeObservations(orderAxes([ax('recall', 50, null), ax('focus', 30, null)]), subject)).toEqual({
      avgDelta: null, grade: null,
      summarySentence: '김순자 어르신의 관찰 지표 2개를 측정했어요. 비교할 이전 기간 기록이 아직 없어요.',
    });
  });

  it('averages measured deltas (rounded) and signs the sentence', () => {
    const s = summarizeObservations(orderAxes([ax('recall', 50, 3), ax('emotion', 60, 4), ax('focus', null, null)]), subject);
    expect(s.avgDelta).toBe(4); // 3.5 → 4
    expect(s.grade).toBe('긍정적');
    expect(s.summarySentence).toBe('관찰 지표 2개 기준으로 직전 동일 기간 대비 평균 +4%p 변화가 관찰됐어요.');
  });

  it.each([
    [10, '매우 긍정적'], [9, '긍정적'], [1, '긍정적'], [0, '변화 없음'], [-1, '주의 관찰'],
  ])('grade for average %i is %s', (delta, grade) => {
    const s = summarizeObservations(orderAxes([ax('recall', 50, delta)]), subject);
    expect(s.grade).toBe(grade);
  });

  it('writes negative averages without a plus sign', () => {
    expect(summarizeObservations(orderAxes([ax('recall', 50, -6)]), subject).summarySentence)
      .toBe('관찰 지표 1개 기준으로 직전 동일 기간 대비 평균 -6%p 변화가 관찰됐어요.');
  });
});
