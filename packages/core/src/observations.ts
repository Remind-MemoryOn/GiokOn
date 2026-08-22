// 관찰 지표 집계(비의료) — 순수함수. 세션·분석·연대기를 인자로 받아 계산한다(플랫폼 무관).
// 앱/웹 공용. 목업이든 라이브든 동일 계산(호출부에서 데이터만 주입). 효능/향상 판정이 아니라
// 대화에서 관찰된 값(참여·응답률·발화량·주제 반응)만 산출한다.
//
// ⚠️ 실서비스 원칙 — **근거 없는 값을 만들어내지 않는다**:
//   측정 근거(세션·분석)가 없으면 숫자를 채우지 않고 `null` / 빈 배열을 반환한다.
//   화면은 이를 "아직 관찰된 기록이 없어요" 같은 빈 상태로 표시해야 한다.
//   (0 과 null 은 다르다 — 0회 관찰과 "측정 불가"를 구분한다. 어르신 개인에 대한
//   관찰 기록을 임의값으로 표시하는 것은 비의료·정부심사 기준에서 특히 위험하다.)

import type { ChronicleEntry, ConversationTurn, ElderProfile, Session } from './types'
import { readEmotion, type SessionAnalysis } from './analysis'

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
 * 관심 주제 TOP5 — **대화에서 실제로 관찰된 반응**만 센다.
 *
 * ⚠️ 연대기(chronicles)는 요양보호사가 입력해 둔 *후보* 주제일 뿐 관찰 결과가 아니다.
 * 예전 구현은 연대기 주제에 가중치 2를 줬는데, 그러면 **대화를 한 번도 하지 않은
 * 어르신에게 "주요 기억 100%" 같은 분포가 표시**된다(사용자 지적 2026-08-13).
 * 관찰 기록이 없는데 관찰값을 그리는 것이므로 실서비스 원칙 위반 → 세션 분석이
 * 하나도 없으면 빈 배열을 돌려주고, 있을 때만 연대기를 **동점 정렬 보조**로 쓴다.
 *
 * 근거가 없으면 **빈 배열**(화면은 빈 상태 표시) — 예시 분포를 만들지 않는다.
 */
export function computeTopicShares(
  chronicles: ChronicleEntry[],
  analyses: SessionAnalysis[],
): TopicShare[] {
  if (analyses.length === 0) return []
  const counts = new Map<string, number>()
  const bump = (t: string, n = 1) => counts.set(t, (counts.get(t) ?? 0) + n)
  for (const a of analyses) {
    for (const t of a.topicsEngaged) bump(t, 3)
    for (const o of a.topicOutcomes) bump(o.topic, o.elderTurns)
  }
  // 연대기는 **이미 관찰된 주제**에만 소량 가산한다(없던 주제를 만들어내지 않는다).
  for (const c of chronicles) if (counts.has(c.topic)) bump(c.topic, 2)
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

// ─────────────────────────────────────────────────────────────
// 관찰 5축 + 기간 대비 변화 (Figma "인지 효과 분석" 화면)
// ─────────────────────────────────────────────────────────────
//
// Figma 는 "기억 회상력 23% ▲향상" 처럼 **인지 기능 향상 수치**를 그렸지만, 그 값을
// 계산할 근거(임상 기준선·검사 도구)가 우리 데이터에 없다. 사용자 확정(2026-08-13)에 따라
// 5축을 **우리가 실제로 세는 값**으로 재정의하고, "향상률"은 같은 길이의 **직전 기간 대비
// 실제 변화량**으로 계산한다. 근거가 없으면 null(화면은 '—').
//
// 축 정의(전부 대화에서 직접 관찰한 값):
//   recall(기억 회상력)   = 회상이 이어진 주제 비율 = engaged / (engaged + low)
//   emotion(정서 안정감)  = 안정 톤(bright·calm·mixed) 세션 비율
//   participation(대화 참여도) = 풍부한 발화 비율 평균(metrics.participation)
//   focus(집중력)         = 응답률 평균(metrics.responseRate)
//   expression(언어 표현력) = 평균 발화 길이 / 기준 60자 (100 상한)

/** 언어 표현력 정규화 기준(자). 100% = 평균 발화가 이 길이일 때. */
export const EXPRESSION_REFERENCE_CHARS = 60

export type ObservationAxis = 'recall' | 'emotion' | 'participation' | 'focus' | 'expression'

export const OBSERVATION_AXES: ObservationAxis[] = [
  'recall',
  'emotion',
  'participation',
  'focus',
  'expression',
]

export interface AxisObservation {
  axis: ObservationAxis
  /** 0~100. 측정 근거(분석)가 없으면 null. */
  value: number | null
  /** 직전 동일 길이 기간 대비 변화량(%p). 비교 근거가 없으면 null. */
  delta: number | null
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 100) : null
}

/** 한 묶음(기간)의 5축 값. 분석이 없으면 전부 null. */
function axisValues(analyses: SessionAnalysis[]): Record<ObservationAxis, number | null> {
  if (analyses.length === 0) {
    return { recall: null, emotion: null, participation: null, focus: null, expression: null }
  }
  let engaged = 0
  let low = 0
  let stable = 0
  let participation = 0
  let focus = 0
  let chars = 0
  for (const a of analyses) {
    engaged += a.topicsEngaged.length
    low += a.topicsLow.length
    if (a.emotionTone === 'bright' || a.emotionTone === 'calm' || a.emotionTone === 'mixed') stable += 1
    participation += a.metrics.participation
    focus += a.metrics.responseRate
    chars += a.metrics.avgUtteranceChars
  }
  const n = analyses.length
  return {
    recall: ratio(engaged, engaged + low),
    emotion: ratio(stable, n),
    participation: Math.round((participation / n) * 100),
    focus: Math.round((focus / n) * 100),
    expression: Math.min(100, Math.round((chars / n / EXPRESSION_REFERENCE_CHARS) * 100)),
  }
}

/** ISO 문자열을 `YYYY-MM` 으로. */
function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/**
 * 최근 `months` 개월을 최근 기간 / 직전 기간으로 나눠 5축 값과 변화량을 계산한다.
 * `now` 는 테스트 주입용(기본 현재 시각).
 */
export function computeAxisObservations(
  analyses: (SessionAnalysis & { at: string })[],
  months = 3,
  now = new Date(),
): AxisObservation[] {
  const span = months * 30 * 86400000
  const end = now.getTime()
  const recent: SessionAnalysis[] = []
  const previous: SessionAnalysis[] = []
  for (const a of analyses) {
    const t = new Date(a.at).getTime()
    if (Number.isNaN(t)) continue
    if (t > end - span) recent.push(a)
    else if (t > end - span * 2) previous.push(a)
  }
  const cur = axisValues(recent)
  const prev = axisValues(previous)
  return OBSERVATION_AXES.map((axis) => {
    const value = cur[axis]
    const before = prev[axis]
    return {
      axis,
      value,
      delta: value === null || before === null ? null : value - before,
    }
  })
}

export interface MonthlyAxisSeries {
  axis: ObservationAxis
  /** 월별 값(0~100). 기록이 없는 달은 null. */
  points: (number | null)[]
}

export interface MonthlyAxisTrend {
  /** `YYYY-MM` 오름차순. */
  months: string[]
  series: MonthlyAxisSeries[]
}

/** 최근 `months` 개월의 달 키 배열(오름차순). */
function monthKeys(months: number, now: Date): string[] {
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

function groupByMonth(
  analyses: (SessionAnalysis & { at: string })[],
  keys: string[],
): Map<string, SessionAnalysis[]> {
  const byMonth = new Map<string, SessionAnalysis[]>()
  for (const a of analyses) {
    const k = monthKey(a.at)
    if (!keys.includes(k)) continue
    const list = byMonth.get(k)
    if (list) list.push(a)
    else byMonth.set(k, [a])
  }
  return byMonth
}

/**
 * 관찰 5축의 월별 추이(Figma "지표별 변화 추이").
 * 기록이 없는 달은 null → 화면에서 점·선을 잇지 않는다.
 */
export function computeMonthlyAxisTrend(
  analyses: (SessionAnalysis & { at: string })[],
  months = 3,
  now = new Date(),
): MonthlyAxisTrend {
  const keys = monthKeys(months, now)
  const byMonth = groupByMonth(analyses, keys)
  return {
    months: keys,
    series: OBSERVATION_AXES.map((axis) => ({
      axis,
      points: keys.map((k) => {
        const list = byMonth.get(k)
        if (!list || list.length === 0) return null
        return axisValues(list)[axis]
      }),
    })),
  }
}

export interface MonthlyTopicSeries {
  label: string
  /** 월별 점유율(0~100). 해당 월에 기록이 없으면 null(점을 찍지 않는다). */
  points: (number | null)[]
}

export interface MonthlyTopicTrend {
  /** `YYYY-MM` 오름차순. */
  months: string[]
  /** 상위 주제별 시계열(최대 5). 근거가 없으면 빈 배열. */
  series: MonthlyTopicSeries[]
}

/**
 * 월별 관심 주제 점유율 추이(Figma 주제별 분석의 꺾은선).
 * 세션 시각으로 월을 나누고 그 달의 분석만으로 주제 점유율을 계산한다.
 * 기록이 없는 달은 null → 화면에서 점·선을 잇지 않는다(값을 만들지 않는다).
 */
export function computeMonthlyTopicTrend(
  analyses: (SessionAnalysis & { at: string })[],
  months = 6,
  now = new Date(),
): MonthlyTopicTrend {
  const keys = monthKeys(months, now)
  const byMonth = groupByMonth(analyses, keys)
  // 전체 기간 상위 주제를 시계열 대상으로 고정한다(월마다 다른 주제가 나오면 비교 불가).
  const overall = computeTopicShares([], analyses)
  if (overall.length === 0) return { months: keys, series: [] }
  const series = overall.map((t) => ({
    label: t.label,
    points: keys.map((k) => {
      const list = byMonth.get(k)
      if (!list || list.length === 0) return null
      const shares = computeTopicShares([], list)
      return shares.find((s) => s.label === t.label)?.percent ?? 0
    }),
  }))
  return { months: keys, series }
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

export interface TopicDetail {
  topic: string
  /** 그 주제가 등장한 세션 수(관찰). */
  mentions: number
  /** 등장 중 호응(engaged) 비율 0~100. 등장이 없으면 null. */
  positiveRate: number | null
  /** 그 주제를 다룬 세션의 평균 길이(초). 근거가 없으면 null. */
  avgSeconds: number | null
  /** 직전 동일 길이 기간 대비 변화(%p·%). 비교 근거가 없으면 null. */
  delta: { mentions: number | null; positiveRate: number | null; avgSeconds: number | null }
}

function topicSlice(
  rows: { analysis: SessionAnalysis; seconds: number | null }[],
  topic: string,
): { mentions: number; positiveRate: number | null; avgSeconds: number | null } {
  let mentions = 0
  let engaged = 0
  let secondsSum = 0
  let secondsN = 0
  for (const r of rows) {
    const outcome = r.analysis.topicOutcomes.find((o) => o.topic === topic)
    const inEngaged = r.analysis.topicsEngaged.includes(topic)
    if (!outcome && !inEngaged) continue
    mentions += 1
    if (outcome ? outcome.reaction === 'engaged' : inEngaged) engaged += 1
    if (r.seconds != null) {
      secondsSum += r.seconds
      secondsN += 1
    }
  }
  return {
    mentions,
    positiveRate: mentions > 0 ? Math.round((engaged / mentions) * 100) : null,
    avgSeconds: secondsN > 0 ? Math.round(secondsSum / secondsN) : null,
  }
}

/**
 * 한 주제의 상세 관찰(Figma 분석 "주제별 상세 분석" 3칸).
 *
 * 최근 `months` 개월과 **직전 같은 길이 기간**을 나눠 언급 빈도·호응률·평균 대화 시간과
 * 그 변화를 낸다. 근거가 없는 항목은 null — 화면은 `—` 로 둔다(값을 만들지 않는다).
 */
export function computeTopicDetail(
  rows: { analysis: SessionAnalysis; at: string; seconds: number | null }[],
  topic: string,
  months = 3,
  now = new Date(),
): TopicDetail {
  const span = months * 30 * 86400000
  const end = now.getTime()
  const recent: { analysis: SessionAnalysis; seconds: number | null }[] = []
  const previous: { analysis: SessionAnalysis; seconds: number | null }[] = []
  for (const r of rows) {
    const t = new Date(r.at).getTime()
    if (Number.isNaN(t)) continue
    if (t > end - span) recent.push(r)
    else if (t > end - span * 2) previous.push(r)
  }
  const a = topicSlice(recent, topic)
  const b = topicSlice(previous, topic)
  const diff = (x: number | null, y: number | null) => (x == null || y == null ? null : x - y)
  return {
    topic,
    ...a,
    delta: {
      mentions: previous.length === 0 ? null : a.mentions - b.mentions,
      positiveRate: diff(a.positiveRate, b.positiveRate),
      avgSeconds: diff(a.avgSeconds, b.avgSeconds),
    },
  }
}

export interface ParticipationDetail {
  /** 기간 안 세션 수(관찰). */
  totalSessions: number
  /** 세션 평균 길이(초). 길이를 아는 세션이 없으면 null. */
  avgSeconds: number | null
  /** 평균 응답률 0~100. 분석이 없으면 null. */
  avgResponseRate: number | null
  /** 직전 동일 길이 기간 대비 변화. 비교 근거가 없으면 null. */
  delta: {
    totalSessions: number | null
    avgSeconds: number | null
    avgResponseRate: number | null
  }
}

function participationSlice(
  rows: { analysis: SessionAnalysis | null; seconds: number | null }[],
): Omit<ParticipationDetail, 'delta'> {
  let secondsSum = 0
  let secondsN = 0
  let rateSum = 0
  let rateN = 0
  for (const r of rows) {
    if (r.seconds != null) {
      secondsSum += r.seconds
      secondsN += 1
    }
    // 분석이 아직 없는 세션도 '대화 횟수'에는 든다 — 응답률만 빠진다.
    if (r.analysis) {
      rateSum += r.analysis.metrics.responseRate
      rateN += 1
    }
  }
  return {
    totalSessions: rows.length,
    avgSeconds: secondsN > 0 ? Math.round(secondsSum / secondsN) : null,
    avgResponseRate: rateN > 0 ? Math.round((rateSum / rateN) * 100) : null,
  }
}

/**
 * 한 어르신의 참여 관찰 + 직전 기간 대비 변화(Figma 개인별 종합 분석 "종합 대화 참여도" 3칸).
 *
 * 행 하나 = 대화 한 번. 분석이 아직 없는 세션은 `analysis: null` 로 넣으면 횟수·평균
 * 길이에는 들어가고 응답률 평균에서만 빠진다.
 *
 * `computeTopicDetail` 과 같은 방식으로 최근 `months` 개월과 **직전 같은 길이 기간**을
 * 나눈다. 근거가 없는 항목은 null — 화면은 `—`·"비교 근거 없음" 으로 둔다.
 */
export function computeParticipationDetail(
  rows: { analysis: SessionAnalysis | null; at: string; seconds: number | null }[],
  months = 3,
  now = new Date(),
): ParticipationDetail {
  const span = months * 30 * 86400000
  const end = now.getTime()
  const recent: { analysis: SessionAnalysis | null; seconds: number | null }[] = []
  const previous: { analysis: SessionAnalysis | null; seconds: number | null }[] = []
  for (const r of rows) {
    const t = new Date(r.at).getTime()
    if (Number.isNaN(t)) continue
    if (t > end - span) recent.push(r)
    else if (t > end - span * 2) previous.push(r)
  }
  const a = participationSlice(recent)
  const b = participationSlice(previous)
  const diff = (x: number | null, y: number | null) => (x == null || y == null ? null : x - y)
  return {
    ...a,
    delta: {
      totalSessions: previous.length === 0 ? null : a.totalSessions - b.totalSessions,
      avgSeconds: diff(a.avgSeconds, b.avgSeconds),
      avgResponseRate: diff(a.avgResponseRate, b.avgResponseRate),
    },
  }
}

/**
 * 관찰 5축 평균(0~100). 축 하나라도 값이 있으면 그 값들의 평균, 없으면 null.
 * "전체 평균 대비" 비교의 양쪽에 같은 잣대를 쓰기 위한 단일 수치다.
 */
export function axisAverage(axes: AxisObservation[]): number | null {
  const vs = axes.map((a) => a.value).filter((v): v is number => v != null)
  if (vs.length === 0) return null
  return Math.round(vs.reduce((n, v) => n + v, 0) / vs.length)
}

/** 감정 분포 3묶음 — Figma 대화 분석 상세의 막대(밝음·차분·그리움). */
export interface EmotionSplit {
  /** 밝음(bright) — `mixed` 는 밝음·그리움이 섞인 것이라 절반씩 나눈다. */
  bright: number
  /** 차분(calm·quiet). */
  calm: number
  /** 그리움(longing) + `mixed` 의 절반. */
  longing: number
  /** 센 어르신 발화 수. 0 이면 위 셋은 전부 0 이고 화면은 빈 상태로 둔다. */
  turns: number
}

export const EMOTION_SPLIT_LABEL: Record<'bright' | 'calm' | 'longing', string> = {
  bright: '밝음',
  calm: '차분',
  longing: '그리움',
}

/**
 * 한 세션의 감정 분포(%). **어르신 발화마다** 같은 규칙(`readEmotion`)을 돌려 센다.
 *
 * ⚠️ 시안은 "긍정/보통/부정" 이라고 썼지만 우리가 재는 것은 **말투 묶음**이지 정서의
 * 좋고 나쁨이 아니다 — 관찰하지 않은 값(가치 판단)을 만들지 않으려고 관찰한 이름
 * (밝음·차분·그리움)을 그대로 쓴다.
 * 반올림 뒤 합이 100 이 되도록 가장 큰 묶음에 나머지를 준다.
 */
export function computeEmotionSplit(turns: ConversationTurn[]): EmotionSplit {
  const elderTurns = turns.filter((t) => t.speaker === 'Elderly' && t.text.trim())
  if (elderTurns.length === 0) return { bright: 0, calm: 0, longing: 0, turns: 0 }
  let bright = 0
  let calm = 0
  let longing = 0
  for (const t of elderTurns) {
    const tone = readEmotion(t.text)
    if (tone === 'bright') bright += 1
    else if (tone === 'longing') longing += 1
    else if (tone === 'mixed') {
      bright += 0.5
      longing += 0.5
    } else calm += 1
  }
  const n = elderTurns.length
  const pct = { bright: Math.round((bright / n) * 100), calm: Math.round((calm / n) * 100), longing: Math.round((longing / n) * 100) }
  const rest = 100 - (pct.bright + pct.calm + pct.longing)
  if (rest !== 0) {
    const top = (Object.keys(pct) as (keyof typeof pct)[]).reduce((a, b) => (pct[a] >= pct[b] ? a : b))
    pct[top] += rest
  }
  return { ...pct, turns: n }
}

/** 관찰 밴드 — 값이 없으면 null(화면은 `—`). */
export type ObservationBand = '높음' | '보통' | '낮음'

export interface SessionTraits {
  /** 가장 많이 관찰된 말투 묶음과 비율. 발화가 없으면 null. */
  topEmotion: { key: 'bright' | 'calm' | 'longing'; label: string; percent: number } | null
  /** 대화 집중도 — 참여도 지표 밴드. */
  focus: ObservationBand | null
  /** 표현 빈도 — 평균 발화 길이 밴드. */
  expression: ObservationBand | null
  /** 대화 길이 — 세션 길이 밴드(`긴 편`·`보통`·`짧은 편`). */
  length: '긴 편' | '보통' | '짧은 편' | null
}

/**
 * 대화 특성 4칸(Figma 대화 분석 상세).
 *
 * 밴드 경계는 **표시용 구간**이며 판정이 아니다: 참여도 0.7/0.4, 평균 발화 길이
 * `EXPRESSION_REFERENCE_CHARS`(60)/30자, 세션 길이 15분/7분.
 * 근거가 없는 칸은 null 로 두고 화면에서 `—` 로 표시한다.
 */
export function describeSessionTraits(
  analysis: SessionAnalysis | null,
  split: EmotionSplit,
  seconds: number | null,
): SessionTraits {
  const band = (v: number, high: number, mid: number): ObservationBand =>
    v >= high ? '높음' : v >= mid ? '보통' : '낮음'
  const keys = ['bright', 'calm', 'longing'] as const
  const top = split.turns === 0 ? null : keys.reduce((a, b) => (split[a] >= split[b] ? a : b))
  return {
    topEmotion: top ? { key: top, label: EMOTION_SPLIT_LABEL[top], percent: split[top] } : null,
    focus: analysis ? band(analysis.metrics.participation, 0.7, 0.4) : null,
    expression: analysis ? band(analysis.metrics.avgUtteranceChars, EXPRESSION_REFERENCE_CHARS, 30) : null,
    length: seconds == null ? null : seconds >= 900 ? '긴 편' : seconds >= 420 ? '보통' : '짧은 편',
  }
}
