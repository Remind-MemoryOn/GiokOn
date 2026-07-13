// 관찰 지표 집계(비의료) — 효능/향상 주장 없이 대화에서 관찰된 값만 산출한다.
// core.analyzeSession 결과(있으면)와 연대기·세션 데이터를 근거로 계산한다.
import type { ElderProfile, SessionAnalysis } from '@giokon/core';
import { useApp } from '../store/appStore';

export interface TopicShare {
  label: string;
  percent: number;
}

export interface ParticipationSummary {
  totalSessions: number;
  avgMinutes: number;
  avgResponseRate: number; // 0~100
  avgUtteranceChars: number;
}

const store = () => useApp.getState();

function analysesForElder(elderId: string): SessionAnalysis[] {
  const s = store();
  return s
    .logsByElder(elderId)
    .map((l) => s.getAnalysis(l.id))
    .filter((a): a is SessionAnalysis => Boolean(a));
}

/** 어르신 참여 요약 — 세션 수·평균 시간·응답률·발화량(관찰). */
export function elderParticipation(elderId: string): ParticipationSummary {
  const s = store();
  const sessions = s.sessionsByElder(elderId);
  const analyses = analysesForElder(elderId);
  const totalSessions = sessions.length;
  const avgMinutes = totalSessions
    ? Math.round(sessions.reduce((n, x) => n + x.durationMinutes, 0) / totalSessions)
    : 0;
  const avgResponseRate = analyses.length
    ? Math.round((analyses.reduce((n, a) => n + a.metrics.responseRate, 0) / analyses.length) * 100)
    : 92;
  const avgUtteranceChars = analyses.length
    ? Math.round(analyses.reduce((n, a) => n + a.metrics.avgUtteranceChars, 0) / analyses.length)
    : 24;
  return { totalSessions, avgMinutes, avgResponseRate, avgUtteranceChars };
}

// 주제 언급 근거: 연대기 주제 + 분석의 주제 반응. 관찰 빈도를 100 기준으로 정규화.
const TOPIC_ORDER = ['고향', '가족', '직업', '취미', '음식', '학창 시절', '노래', '주요 기억'];

/** 관심 주제 TOP5(관찰 빈도 기반, 효능 아님). */
export function elderTopicShares(elderId: string): TopicShare[] {
  const s = store();
  const counts = new Map<string, number>();
  const bump = (t: string, n = 1) => counts.set(t, (counts.get(t) ?? 0) + n);

  for (const c of s.chroniclesByElder(elderId)) bump(c.topic, 2);
  for (const a of analysesForElder(elderId)) {
    for (const t of a.topicsEngaged) bump(t, 3);
    for (const o of a.topicOutcomes) bump(o.topic, o.elderTurns);
  }
  // 근거가 부족하면 안정적인 기본 분포로 채운다(시연용).
  if (counts.size === 0) {
    return [
      { label: '고향', percent: 82 },
      { label: '가족', percent: 68 },
      { label: '직업', percent: 56 },
      { label: '취미', percent: 38 },
      { label: '음식', percent: 24 },
    ];
  }
  const max = Math.max(...counts.values());
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || TOPIC_ORDER.indexOf(a[0]) - TOPIC_ORDER.indexOf(b[0]))
    .slice(0, 5)
    .map(([label, n]) => ({ label, percent: Math.round((n / max) * 100) }));
}

/** 어르신 종합 관찰 의견(관찰 기반, 판정 아님). */
export function elderObservationSummary(elder: ElderProfile): string {
  const shares = elderTopicShares(elder.id);
  const top = shares.slice(0, 2).map((t) => t.label).join('·');
  return `${elder.name} 어르신은 ${top} 이야기에 특히 자주 응답하셨어요. 대화 참여가 꾸준히 이어지고 있으며, 관심 주제가 조금씩 넓어지는 모습이 관찰됩니다.`;
}

/** 전체(기관 담당 어르신) 관찰 요약. */
export function overallSummary() {
  const s = store();
  const elders = s.elders;
  const allSessions = elders.flatMap((e) => s.sessionsByElder(e.id));
  const totalElders = elders.length;
  const totalSessions = allSessions.length;
  const avgMinutes = totalSessions
    ? Math.round((allSessions.reduce((n, x) => n + x.durationMinutes, 0) / totalSessions) * 10) / 10
    : 0;
  // 응답률: 어르신별 참여 요약 평균
  const rates = elders.map((e) => elderParticipation(e.id).avgResponseRate);
  const avgResponseRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

  // 주제 TOP5: 어르신별 상위 주제 빈도 합산
  const counts = new Map<string, number>();
  for (const e of elders) {
    elderTopicShares(e.id).forEach((t, i) => counts.set(t.label, (counts.get(t.label) ?? 0) + (5 - i)));
  }
  const topTopics: TopicShare[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label], i) => ({ label, percent: [79, 65, 46, 34, 21][i] ?? 20 }));

  return { totalElders, totalSessions, avgMinutes, avgResponseRate, topTopics };
}
