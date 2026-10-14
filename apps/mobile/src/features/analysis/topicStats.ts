// 주제별 분석 집계 — 전부 실집계다. 근거가 없으면 null(화면은 '—')로 둔다.
import { assessEngagement } from '@giokon/core';

interface AnalysisLike {
  topicOutcomes: readonly { topic: string; elderTurns: number }[];
  interestKeywords: readonly string[];
  metrics: { elderTurns: number; participation: number };
}
interface LogLike {
  turns: readonly { speaker: string; text: string }[];
}

/** 주요 키워드 최대 개수(화면 한 줄 기준). */
const KEYWORD_LIMIT = 8;

export interface TopicStats {
  /** 언급 빈도 — 상세 대상 주제의 어르신 발화 수 합. 주제가 없으면 0. */
  mentions: number;
  /** "긍정 반응률" 자리 → 실제로 세는 값: 어르신 발화 중 활발히 응답한 비율(%). 발화가 없으면 null. */
  engagedRate: number | null;
  /** 세션 평균 시간(분). 세션이 없으면 null. */
  avgMinutes: number | null;
  /** 분석에서 모은 관심 키워드(중복 제거, 최대 8개). */
  keywords: string[];
}

export function topicStats(input: {
  focusTopic: string | undefined;
  analyses: readonly AnalysisLike[];
  logs?: readonly LogLike[];
  sessions: readonly { durationMinutes: number }[];
}): TopicStats {
  const { focusTopic, analyses, logs = [], sessions } = input;
  const mentions = focusTopic !== undefined
    ? analyses.reduce(
        (n, a) => n + (a.topicOutcomes.find((o) => o.topic === focusTopic)?.elderTurns ?? 0),
        0,
      )
    : 0;
  const elderUtterances = logs.flatMap((l) => l.turns.filter((t) => t.speaker === 'Elderly'));
  const rich = elderUtterances.filter((t) => assessEngagement(t.text) === 'rich').length;
  // List logs intentionally omit transcripts. Saved participation uses the same
  // rich / elder-turn definition; weight it by its observed turn count.
  const observedTurns = analyses.reduce((n, a) => n + a.metrics.elderTurns, 0);
  const engagedRate = observedTurns
    ? Math.round((analyses.reduce((n, a) => n + a.metrics.participation * a.metrics.elderTurns, 0) / observedTurns) * 100)
    : elderUtterances.length ? Math.round((rich / elderUtterances.length) * 100) : null;
  const avgMinutes = sessions.length
    ? Math.round(sessions.reduce((n, s) => n + s.durationMinutes, 0) / sessions.length)
    : null;
  const keywords = [...new Set(analyses.flatMap((a) => a.interestKeywords))].slice(0, KEYWORD_LIMIT);
  return { mentions, engagedRate, avgMinutes, keywords };
}
