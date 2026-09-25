import { describe, expect, it } from 'vitest';
import { clockLabel } from './format';

// 로컬 시각 기준 — new Date(y, m, d, h, min) 의 ISO 를 넘겨 시간대와 무관하게 고정한다.
const at = (h: number, min: number) => new Date(2026, 8, 25, h, min).toISOString();

describe('clockLabel', () => {
  it('자정·정오 경계를 12 로 표기한다', () => {
    expect(clockLabel(at(0, 0))).toBe('오전 12:00');
    expect(clockLabel(at(12, 0))).toBe('오후 12:00');
  });

  it('분은 두 자리, 시는 앞자리 0 없이', () => {
    expect(clockLabel(at(9, 5))).toBe('오전 9:05');
    expect(clockLabel(at(11, 59))).toBe('오전 11:59');
    expect(clockLabel(at(13, 30))).toBe('오후 1:30');
    expect(clockLabel(at(23, 7))).toBe('오후 11:07');
  });
});
