import { describe, expect, it } from 'vitest';
import { durationLabel, expressLabel, focusLabel, lengthLabel, summaryBullets } from './traits';

describe('durationLabel', () => {
  it('formats minutes and seconds, clamps negatives, and is empty without an end', () => {
    expect(durationLabel('2026-09-25T10:00:00Z', '2026-09-25T10:12:05Z')).toBe('12분 5초');
    expect(durationLabel('2026-09-25T10:00:00Z', '2026-09-25T09:59:00Z')).toBe('0분 0초');
    expect(durationLabel('2026-09-25T10:00:00Z')).toBe('—');
  });
});

describe('trait thresholds', () => {
  it.each([[0.5, '높음'], [0.49, '보통'], [0.25, '보통'], [0.24, '낮음']])('focus %f → %s', (v, label) => {
    expect(focusLabel(v)).toBe(label);
  });
  it.each([[30, '높음'], [29, '보통'], [15, '보통'], [14, '낮음']])('expression %i → %s', (v, label) => {
    expect(expressLabel(v)).toBe(label);
  });
  it.each([[15, '긺'], [14, '보통'], [8, '보통'], [7, '짧음'], [1, '짧음'], [0, '—']])('length %i → %s', (v, label) => {
    expect(lengthLabel(v)).toBe(label);
  });
});

describe('summaryBullets', () => {
  it('splits on sentence ends and drops blanks', () => {
    expect(summaryBullets('고향 이야기를 하셨어요. 노래도 부르셨어요!  다음엔?')).toEqual([
      '고향 이야기를 하셨어요.', '노래도 부르셨어요!', '다음엔?',
    ]);
    expect(summaryBullets('   ')).toEqual([]);
  });
});
