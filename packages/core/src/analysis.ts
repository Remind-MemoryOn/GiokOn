// @giokon/core — 세션 자동 요약·분석 도메인 (M16)
//
// 대화가 끝나면 "어떤 주제가 호응이 좋았고 저조했는지", 참여 정도, 관심 주제,
// 다음에 다뤄볼 주제를 산출한다. 앱(대화 종료)·웹(대시보드)·Edge Function이 공용.
//
// ⚠️ 비의료 락다운: "치료 효과·인지 향상 N%" 같은 **효능 주장 금지**. 오직 대화에서
// 직접 관찰되는 **행동 지표**(참여·응답·발화량·주제 반응·관심 변화)만 산출한다.
// 내부적으로 '인지활동'을 돕는 게 목적이지만, 산출물은 판정이 아니라 관찰 기록이다.

import { assessEngagement } from './safety'
import type { ChronicleEntry, ConversationTurn, ElderProfile, EmotionTone } from './types'

export const ANALYSIS_VERSION = 'v1.0'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 주제별 반응: 어르신이 얼마나 호응했는지(관찰). */
export type TopicReaction = 'engaged' | 'neutral' | 'low'

export interface TopicOutcome {
  topic: string
  reaction: TopicReaction
  /** 해당 주제에서의 어르신 발화 수. */
  elderTurns: number
  /** 대표 발화 발췌(있으면). */
  excerpt?: string
}

/** 관찰 지표 — 전부 대화에서 직접 센 값(효능 주장 아님). */
export interface ObservationMetrics {
  /** 어르신 발화 수. */
  elderTurns: number
  /** AI 질문 수. */
  aiTurns: number
  /** 응답률: AI 질문 대비 어르신이 (침묵 아닌) 응답한 비율 0~1. */
  responseRate: number
  /** 참여도: 풍부한(rich) 발화 비율 0~1. */
  participation: number
  /** 평균 발화 길이(글자). */
  avgUtteranceChars: number
}

export interface SessionAnalysis {
  version: string
  /** 한두 문장 요약(관찰 기반, 판정 아님). */
  summary: string
  /** 정서 톤(관찰). */
  emotionTone: EmotionTone
  metrics: ObservationMetrics
  /** 호응이 좋았던 주제(reaction=engaged). */
  topicsEngaged: string[]
  /** 반응이 저조했던 주제(reaction=low). */
  topicsLow: string[]
  /** 주제별 상세. */
  topicOutcomes: TopicOutcome[]
  /** 이번 대화에서 관찰된 관심 키워드(빈도순). */
  interestKeywords: string[]
  /** 다음 세션에 다뤄볼 추천 주제. */
  recommendedTopics: string[]
  /**
   * 대화에 걸린 시간(분). `analyzeSession` 은 대화 전문만 받아 시각을 모르므로
   * **세션을 끝내는 쪽이 붙인다**(앱 `finishSession`). 근거가 없으면 없는 채로 둔다 —
   * 보호자 화면은 `—` 로 보여 준다.
   */
  durationMinutes?: number
}

// ── 정서 톤(관찰) — ai.ts와 동일 원칙의 경량 판독 ──
const LONGING = ['그립', '보고싶', '그리워', '예전', '돌아가', '아버지', '어머니', '남편', '아내']
const BRIGHT = ['좋아', '재미', '웃', '행복', '예뻤', '맛있', '신났', '기뻤', '고마워']
const CALM = ['편안', '조용', '천천히', '그냥', '잔잔']

export function readEmotion(text: string): EmotionTone {
  const longing = LONGING.some((k) => text.includes(k))
  const bright = BRIGHT.some((k) => text.includes(k))
  const calm = CALM.some((k) => text.includes(k))
  if (longing && bright) return 'mixed'
  if (longing) return 'longing'
  if (bright) return 'bright'
  if (calm) return 'calm'
  if (!text.trim()) return 'quiet'
  return 'calm'
}

/** 각 어르신 발화를 직전 AI 주제에 귀속시킨다. */
function turnsByTopic(turns: ConversationTurn[]): Map<string, ConversationTurn[]> {
  const map = new Map<string, ConversationTurn[]>()
  let topic: string | undefined
  for (const t of turns) {
    if (t.speaker === 'AI') {
      if (t.topic) topic = t.topic
    } else if (t.speaker === 'Elderly' && topic) {
      const arr = map.get(topic) ?? []
      arr.push(t)
      map.set(topic, arr)
    }
  }
  return map
}

// 안전·마무리 등 회상 주제가 아닌 메타 주제는 분석에서 제외.
const NON_CONTENT_TOPICS = new Set(['안전', '마무리'])

function reactionOf(elderTurns: ConversationTurn[]): TopicReaction {
  if (elderTurns.length === 0) return 'low'
  const scores = elderTurns.map((t) => assessEngagement(t.text))
  const rich = scores.filter((s) => s === 'rich').length
  const lowish = scores.filter((s) => s === 'low' || s === 'silent').length
  if (rich >= 1 && rich >= lowish) return 'engaged'
  if (lowish > rich && lowish >= elderTurns.length / 2) return 'low'
  return 'neutral'
}

/**
 * 세션 대화 전문으로부터 관찰 기반 요약·분석을 만든다.
 * @param chronicle 관심 주제 추천에 쓰는 연대기(선택)
 */
export function analyzeSession(
  elder: ElderProfile,
  turns: ConversationTurn[],
  chronicle: ChronicleEntry[] = [],
): SessionAnalysis {
  const elderTurns = turns.filter((t) => t.speaker === 'Elderly')
  const aiTurns = turns.filter((t) => t.speaker === 'AI')
  const answered = elderTurns.filter((t) => assessEngagement(t.text) !== 'silent').length
  const rich = elderTurns.filter((t) => assessEngagement(t.text) === 'rich').length
  const totalChars = elderTurns.reduce((n, t) => n + t.text.trim().length, 0)

  const metrics: ObservationMetrics = {
    elderTurns: elderTurns.length,
    aiTurns: aiTurns.length,
    responseRate: aiTurns.length > 0 ? round2(answered / aiTurns.length) : 0,
    participation: elderTurns.length > 0 ? round2(rich / elderTurns.length) : 0,
    avgUtteranceChars: elderTurns.length > 0 ? Math.round(totalChars / elderTurns.length) : 0,
  }

  const byTopic = turnsByTopic(turns)
  const topicOutcomes: TopicOutcome[] = []
  for (const [topic, ts] of byTopic) {
    if (NON_CONTENT_TOPICS.has(topic)) continue
    const reaction = reactionOf(ts)
    const excerpt = ts.find((t) => assessEngagement(t.text) === 'rich')?.text ?? ts[0]?.text
    topicOutcomes.push({
      topic,
      reaction,
      elderTurns: ts.length,
      excerpt: excerpt ? excerpt.trim().slice(0, 80) : undefined,
    })
  }
  topicOutcomes.sort((a, b) => b.elderTurns - a.elderTurns)

  const topicsEngaged = topicOutcomes.filter((t) => t.reaction === 'engaged').map((t) => t.topic)
  const topicsLow = topicOutcomes.filter((t) => t.reaction === 'low').map((t) => t.topic)

  // 관심 키워드 — AI가 추출한 키워드 빈도.
  const kw = new Map<string, number>()
  for (const t of elderTurns) {
    for (const k of t.extractedKeywords ?? []) kw.set(k, (kw.get(k) ?? 0) + 1)
  }
  const interestKeywords = [...kw.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k)

  const emotionTone = readEmotion(elderTurns.map((t) => t.text).join(' '))

  return {
    version: ANALYSIS_VERSION,
    summary: buildSummary(elder, metrics, topicsEngaged, topicsLow, emotionTone),
    emotionTone,
    metrics,
    topicsEngaged,
    topicsLow,
    topicOutcomes,
    interestKeywords,
    recommendedTopics: recommendNextTopics(elder, chronicle, topicsEngaged, topicsLow),
  }
}

function buildSummary(
  elder: ElderProfile,
  m: ObservationMetrics,
  engaged: string[],
  low: string[],
  tone: EmotionTone,
): string {
  if (m.elderTurns === 0) {
    return `${elder.name} 어르신이 이번 대화에서는 말씀이 많지 않으셨어요.`
  }
  const parts: string[] = []
  if (engaged.length > 0) {
    parts.push(`${engaged.slice(0, 2).join('·')} 이야기에 특히 호응이 좋으셨어요`)
  } else {
    parts.push(`${elder.name} 어르신과 ${m.elderTurns}번 이야기를 나눴어요`)
  }
  if (low.length > 0) parts.push(`${low.slice(0, 2).join('·')} 주제는 반응이 뜸했어요`)
  const toneWord: Record<EmotionTone, string> = {
    bright: '전반적으로 밝은 분위기였어요',
    longing: '지난날을 그리워하는 마음이 느껴졌어요',
    calm: '차분하게 이야기 나누셨어요',
    mixed: '즐거움과 그리움이 함께 묻어났어요',
    quiet: '조용히 함께 시간을 보내셨어요',
  }
  parts.push(toneWord[tone])
  return parts.join('. ') + '.'
}

// ── 다음 주제 추천 ──
/**
 * 연대기·세션이 다루는 표준 주제. 웹 "연대기 추가/상세"의 유형 드롭다운과 다음 주제
 * 추천이 같은 목록을 써야 화면과 추천이 어긋나지 않는다.
 * (`주요 기억` 은 프로필 폼이 관리하는 별도 주제라 여기 넣지 않는다.)
 */
export const CHRONICLE_TOPICS = ['고향', '가족', '직업', '취미', '음식', '학창 시절', '노래']
const ALL_TOPICS = CHRONICLE_TOPICS

/**
 * 다음 세션 추천 주제. 호응이 좋았던 주제 + 아직 안 다룬 프로필 기반 주제를 우선,
 * 저조했던 주제는 뒤로 미룬다.
 */
export function recommendNextTopics(
  elder: ElderProfile,
  chronicle: ChronicleEntry[],
  engaged: string[] = [],
  low: string[] = [],
): string[] {
  const lowSet = new Set(low)
  const result: string[] = []
  const push = (t: string) => {
    if (t && !result.includes(t) && !lowSet.has(t)) result.push(t)
  }

  // 1) 이번에 호응 좋았던 주제를 이어간다.
  engaged.forEach(push)
  // 2) 최근 연대기 주제(실제로 최근에 나눈 관심사).
  for (const c of chronicle.slice(0, 3)) push(c.topic)
  // 3) 프로필에 재료가 있는데 아직 안 나온 주제.
  if (elder.hometown) push('고향')
  if (elder.family) push('가족')
  if (elder.job) push('직업')
  if (elder.hobbies) push('취미')
  // 4) 남은 일반 주제로 채운다.
  ALL_TOPICS.forEach(push)

  return result.slice(0, 3)
}
