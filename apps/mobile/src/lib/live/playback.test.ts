import { describe, it, expect } from 'vitest';
import { playableChunks } from './playback';

describe('playableChunks — 검열된 원음 재생 차단', () => {
  it('가드를 통과하면(채택 = 원문) 원음을 그대로 재생한다', () => {
    const cache = new Map([['전주에서 뭐가 기억에 남으세요?', ['aaa', 'bbb']]]);
    expect(playableChunks(cache, '전주에서 뭐가 기억에 남으세요?', '전주에서 뭐가 기억에 남으세요?')).toEqual([
      'aaa',
      'bbb',
    ]);
  });

  it('가드가 막으면(채택 ≠ 원문) 빈 배열 — 스피커로 나가지 않는다', () => {
    const cache = new Map([['어르신은 치매입니다.', ['위험한오디오']]]);
    expect(playableChunks(cache, '어르신은 치매입니다.', '오늘은 어떤 이야기를 나눠볼까요?')).toEqual([]);
  });

  it('막힌 원음은 캐시에서 버린다 — "다시 듣기"로도 되살아나지 않는다', () => {
    const cache = new Map([['그 약을 끊으세요', ['위험한오디오']]]);
    playableChunks(cache, '그 약을 끊으세요', '오늘은 어떤 이야기를 나눠볼까요?');
    expect(cache.has('그 약을 끊으세요')).toBe(false);
  });

  it('오디오가 없는 질문은 빈 배열(재생 대신 기기 TTS 로 넘어간다)', () => {
    expect(playableChunks(new Map(), '질문', '질문')).toEqual([]);
  });
});
