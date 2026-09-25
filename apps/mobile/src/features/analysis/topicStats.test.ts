import { describe, expect, it } from 'vitest';
import { assessEngagement } from '@giokon/core';
import { topicStats } from './topicStats';

const analysis = (outcomes: [string, number][], keywords: string[]) => ({
  topicOutcomes: outcomes.map(([topic, elderTurns]) => ({ topic, elderTurns })),
  interestKeywords: keywords,
});

describe('topicStats', () => {
  it('is empty without data', () => {
    expect(topicStats({ focusTopic: undefined, analyses: [], logs: [], sessions: [] }))
      .toEqual({ mentions: 0, engagedRate: null, avgMinutes: null, keywords: [] });
  });

  it('sums the focus topic mentions across analyses only', () => {
    const analyses = [analysis([['고향', 3], ['가족', 9]], []), analysis([['고향', 2]], []), analysis([], [])];
    expect(topicStats({ focusTopic: '고향', analyses, logs: [], sessions: [] }).mentions).toBe(5);
    expect(topicStats({ focusTopic: undefined, analyses, logs: [], sessions: [] }).mentions).toBe(0);
  });

  it('rates engaged elder utterances only, rounded', () => {
    const rich = '어릴 때 부산 바닷가에서 친구들이랑 매일 수영하고 조개도 캐고 놀았지요';
    const short = '네';
    expect(assessEngagement(rich)).toBe('rich');
    expect(assessEngagement(short)).not.toBe('rich');
    const logs = [
      { turns: [{ speaker: 'Elderly', text: rich }, { speaker: 'AI', text: rich }, { speaker: 'Elderly', text: short }] },
      { turns: [{ speaker: 'Elderly', text: short }] },
    ];
    expect(topicStats({ focusTopic: undefined, analyses: [], logs, sessions: [] }).engagedRate).toBe(33);
  });

  it('averages session minutes (rounded) and dedupes keywords up to 8', () => {
    const analyses = [
      analysis([], ['노래', '고향', '가족', '시장', '꽃']),
      analysis([], ['고향', '바다', '학교', '친구', '기차', '편지']),
    ];
    const stats = topicStats({
      focusTopic: undefined, analyses, logs: [],
      sessions: [{ durationMinutes: 10 }, { durationMinutes: 13 }],
    });
    expect(stats.avgMinutes).toBe(12); // 11.5 → 12
    expect(stats.keywords).toEqual(['노래', '고향', '가족', '시장', '꽃', '바다', '학교', '친구']);
  });
});
