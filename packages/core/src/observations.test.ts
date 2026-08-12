import { describe, expect, it } from 'vitest'
import { analyzeSession } from './analysis'
import {
  computeOverall,
  computeParticipation,
  computeTopicShares,
  observationSummary,
} from './observations'
import { DEFAULT_APPEARANCE } from './types'
import type { ChronicleEntry, ConversationTurn, ElderProfile, Session } from './types'

const elder: ElderProfile = {
  id: 'e1', name: '이순자', birthYear: 1945, hometown: '전주', family: '딸 둘',
  job: '식당 운영', hobbies: '텃밭', avatarColor: '#fff',
  appearance: DEFAULT_APPEARANCE, createdAt: '', updatedAt: '',
}

let seq = 0
const ai = (topic: string, text = '...'): ConversationTurn => ({
  id: 'a' + ++seq, speaker: 'AI', text, timestamp: '', topic,
})
const el = (text: string, kw?: string[]): ConversationTurn => ({
  id: 'e' + ++seq, speaker: 'Elderly', text, timestamp: '', extractedKeywords: kw,
})

const turns: ConversationTurn[] = [
  ai('고향'), el('전주 남부시장에서 국밥집을 삼십 년 했었지 새벽마다 북적였어', ['고향', '시장']),
  ai('고향'), el('그 동네가 참 정겨웠어 사람들이 다 이웃 같았지', ['고향']),
  ai('가족'), el('딸들이 착하게 잘 컸어 지금도 고마운 일이야', ['가족']),
  ai('음식'), el('글쎄'),
]
const analysis = analyzeSession(elder, turns)

const session = (durationMinutes: number): Session => ({
  id: 's' + ++seq, title: '회상 대화', therapyType: 'reminiscence', durationMinutes,
  elderId: 'e1', createdAt: '', updatedAt: '',
})

describe('computeParticipation', () => {
  it('세션 평균 시간과 분석 기반 응답률·발화량을 집계한다', () => {
    const p = computeParticipation([session(10), session(20)], [analysis])
    expect(p.totalSessions).toBe(2)
    expect(p.avgMinutes).toBe(15)
    expect(p.avgResponseRate).toBeGreaterThan(0)
    expect(p.avgResponseRate).toBeLessThanOrEqual(100)
    expect(p.avgUtteranceChars).toBeGreaterThan(0)
  })

  it('근거가 없으면 숫자를 만들어내지 않고 null 을 반환한다(실서비스 원칙)', () => {
    const p = computeParticipation([], [])
    expect(p).toEqual({
      totalSessions: 0,
      avgMinutes: null,
      avgResponseRate: null,
      avgUtteranceChars: null,
    })
  })

  it('세션은 있고 분석이 없으면 시간만 계산하고 분석 지표는 null', () => {
    const p = computeParticipation([session(10)], [])
    expect(p.avgMinutes).toBe(10)
    expect(p.avgResponseRate).toBeNull()
    expect(p.avgUtteranceChars).toBeNull()
  })
})

describe('computeTopicShares', () => {
  it('연대기·분석에서 관찰 빈도로 TOP5를 만들고 최댓값을 100%로 정규화한다', () => {
    const chronicles: ChronicleEntry[] = [
      { id: 'c1', elderId: 'e1', topic: '고향', content: '', keywords: [], source: 'Caregiver', recordedAt: '', updatedAt: '' },
    ]
    const shares = computeTopicShares(chronicles, [analysis])
    expect(shares.length).toBeGreaterThan(0)
    expect(shares.length).toBeLessThanOrEqual(5)
    expect(Math.max(...shares.map((s) => s.percent))).toBe(100)
    expect(shares[0].label).toBe('고향') // 연대기+분석 반응이 가장 큼
  })

  it('근거가 없으면 예시 분포를 만들지 않고 빈 배열을 반환한다(실서비스 원칙)', () => {
    expect(computeTopicShares([], [])).toEqual([])
  })
})

describe('observationSummary', () => {
  it('상위 2개 주제를 근거로 관찰 문장을 만든다(효능 표현 없음)', () => {
    const s = observationSummary('이순자', [{ label: '고향', percent: 100 }, { label: '가족', percent: 60 }])
    expect(s).toContain('이순자 어르신')
    expect(s).toContain('고향·가족')
    expect(s).not.toMatch(/향상|효과|개선|\d+%/)
  })

  it('근거가 없으면 문장을 만들지 않고 null(관찰하지 않은 내용 서술 금지)', () => {
    expect(observationSummary('이순자', [])).toBeNull()
  })
})

describe('computeOverall', () => {
  it('어르신 수·세션 수·평균 시간·응답률·주제를 전체로 집계한다', () => {
    const o = computeOverall([elder], [session(10), session(20)], [analysis])
    expect(o.totalElders).toBe(1)
    expect(o.totalSessions).toBe(2)
    expect(o.avgMinutes).toBe(15)
    expect(o.avgResponseRate).toBeGreaterThan(0)
    expect(o.topTopics.length).toBeGreaterThan(0)
  })

  it('데이터가 없으면 집계값은 null, 주제는 빈 배열(실서비스 원칙)', () => {
    const o = computeOverall([], [], [])
    expect(o).toMatchObject({
      totalElders: 0,
      totalSessions: 0,
      avgMinutes: null,
      avgResponseRate: null,
    })
    expect(o.topTopics).toEqual([])
  })
})
