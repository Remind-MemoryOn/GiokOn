// 관찰 지표 집계(비의료) — 순수함수. 세션·분석·연대기를 인자로 받아 계산한다(플랫폼 무관).
// 앱/웹 공용. 목업이든 라이브든 동일 계산(호출부에서 데이터만 주입). 효능/향상 판정이 아니라
// 대화에서 관찰된 값(참여·응답률·발화량·주제 반응)만 산출한다.
//
// ⚠️ 실서비스 원칙 — **근거 없는 값을 만들어내지 않는다**:
//   측정 근거(세션·분석)가 없으면 숫자를 채우지 않고 `null` / 빈 배열을 반환한다.
//   화면은 이를 "아직 관찰된 기록이 없어요" 같은 빈 상태로 표시해야 한다.
//   (0 과 null 은 다르다 — 0회 관찰과 "측정 불가"를 구분한다. 어르신 개인에 대한
//   관찰 기록을 임의값으로 표시하는 것은 비의료·정부심사 기준에서 특히 위험하다.)

import type { ChronicleEntry, ElderProfile, Session } from './types'
import type { SessionAnalysis } from './analysis'

export interface TopicShare {
  label: string
  percent: number
}

export interface ParticipationSummary {
  totalSessions: number
  /** 근거(세션)가 없으면 null. */
  avgMinutes: number | null
  /** 0~100. 근거(분석)가 없으면 null. */
  avgResponseRate: number | null
  /** 근거(분석)가 없으면 null. */
  avgUtteranceChars: number | null
}

export interface OverallObservations {
  totalElders: number
  totalSessions: number
  /** 근거가 없으면 null. */
  avgMinutes: number | null
  /** 근거가 없으면 null. */
  avgResponseRate: number | null
  /** 근거가 없으면 빈 배열. */
  topTopics: TopicShare[]
}

const TOPIC_ORDER = ['고향', '가족', '직업', '취미', '음식', '학창 시절', '노래', '주요 기억']

/**
 * 어르신 참여 요약(관찰) — 세션 수·평균 시간·응답률·발화량.
 * 근거가 없는 항목은 null(화면에서 빈 상태로 표시) — 임의값을 만들지 않는다.
 */
export function computeParticipation(
  sessions: Session[],
  analyses: SessionAnalysis[],
): ParticipationSummary {
  const totalSessions = sessions.length
  const avgMinutes = totalSessions
    ? Math.round(sessions.reduce((n, x) => n + x.durationMinutes, 0) / totalSessions)
    : null
  const avgResponseRate = analyses.length
    ? Math.round((analyses.reduce((n, a) => n + a.metrics.responseRate, 0) / analyses.length) * 100)
    : null
  const avgUtteranceChars = analyses.length
    ? Math.round(analyses.reduce((n, a) => n + a.metrics.avgUtteranceChars, 0) / analyses.length)
    : null
  return { totalSessions, avgMinutes, avgResponseRate, avgUtteranceChars }
}

/**
 * 관심 주제 TOP5(관찰 빈도 기반). 근거: 연대기 주제 + 분석의 주제 반응.
 * 근거가 없으면 **빈 배열**(화면은 빈 상태 표시) — 예시 분포를 만들지 않는다.
 */
export function computeTopicShares(
  chronicles: ChronicleEntry[],
  analyses: SessionAnalysis[],
): TopicShare[] {
  const counts = new Map<string, number>()
  const bump = (t: string, n = 1) => counts.set(t, (counts.get(t) ?? 0) + n)
  for (const c of chronicles) bump(c.topic, 2)
  for (const a of analyses) {
    for (const t of a.topicsEngaged) bump(t, 3)
    for (const o of a.topicOutcomes) bump(o.topic, o.elderTurns)
  }
  if (counts.size === 0) return []
  const max = Math.max(...counts.values())
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || TOPIC_ORDER.indexOf(a[0]) - TOPIC_ORDER.indexOf(b[0]))
    .slice(0, 5)
    .map(([label, n]) => ({ label, percent: Math.round((n / max) * 100) }))
}

/**
 * 어르신 종합 관찰 의견(관찰 기반, 판정 아님).
 * 근거(주제 반응)가 없으면 **null** — 관찰하지 않은 내용을 서술하지 않는다.
 * (실 AI 연동 시에는 이 자리를 LLM 요약으로 대체한다.)
 */
export function observationSummary(elderName: string, shares: TopicShare[]): string | null {
  if (shares.length === 0) return null
  const top = shares
    .slice(0, 2)
    .map((t) => t.label)
    .join('·')
  return `${elderName} 어르신은 ${top} 이야기에 특히 자주 응답하셨어요. 대화 참여가 꾸준히 이어지고 있으며, 관심 주제가 조금씩 넓어지는 모습이 관찰됩니다.`
}

/** 담당 어르신 전체 관찰 요약(대시보드·전체 분석). */
export function computeOverall(
  profiles: ElderProfile[],
  sessions: Session[],
  analyses: SessionAnalysis[],
): OverallObservations {
  const totalElders = profiles.length
  const totalSessions = sessions.length
  const avgMinutes = totalSessions
    ? Math.round((sessions.reduce((n, x) => n + x.durationMinutes, 0) / totalSessions) * 10) / 10
    : null
  const avgResponseRate = analyses.length
    ? Math.round((analyses.reduce((n, a) => n + a.metrics.responseRate, 0) / analyses.length) * 100)
    : null
  const topTopics = computeTopicShares([], analyses)
  return { totalElders, totalSessions, avgMinutes, avgResponseRate, topTopics }
}
