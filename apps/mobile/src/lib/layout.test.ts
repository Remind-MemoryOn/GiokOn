import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ useWindowDimensions: () => ({ width: 393, height: 852 }) }));

import { contentWidthFor, FRAME_CONTENT_W } from './layout';

describe('콘텐츠 폭(기기 폭 대응)', () => {
  it('Figma 393 폭에서는 336 이다', () => {
    expect(FRAME_CONTENT_W).toBe(336);
    expect(contentWidthFor(393)).toBe(336);
  });
  it('좁은 휴대폰·패드에서는 좌 29 · 우 28 여백을 뺀 폭이다', () => {
    expect(contentWidthFor(360)).toBe(303);
    expect(contentWidthFor(800)).toBe(743);
  });
});
