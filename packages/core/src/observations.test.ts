import { describe, expect, it } from 'vitest'
import { analyzeSession } from './analysis'
import {
  computeAxisObservations,
  computeMonthlyAxisTrend,
  computeMonthlyTopicTrend,
  computeOverall,
  computeParticipation,
  computeEmotionSplit,
  computeParticipationDetail,
  computeTopicDetail,
  computeTopicShares,
  axisAverage,
  describeSessionTraits,
  observationSummary,
  withinObservationPeriod,
} from './observations'
import { DEFAULT_APPEARANCE } from './types'
import type { SessionAnalysis } from './analysis'
import type { ChronicleEntry, ConversationTurn, ElderProfile, Session } from './types'

describe('withinObservationPeriod', () => {
  it('관찰 집계와 같은 90일 열린 하한을 쓰고 잘못된 날짜를 제외한다', () => {
    const now = new Date('2026-05-01T00:00:00Z')
    expect(withinObservationPeriod('2026-01-31T00:00:00Z', 3, now)).toBe(false)
    expect(withinObservationPeriod('2026-01-31T00:00:00.001Z', 3, now)).toBe(true)
    expect(withinObservationPeriod('2025-12-01T00:00:00Z', 3, now)).toBe(false)
    expect(withinObservationPeriod('2025-12-01T00:00:00Z', 6, now)).toBe(true)
    expect(withinObservationPeriod('invalid', 3, now)).toBe(false)
  })
})

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

  it('대화 기록이 없으면 연대기만으로 분포를 만들지 않는다(관찰 아님)', () => {
    const chronicles: ChronicleEntry[] = [
      { id: 'c1', elderId: 'e1', topic: '주요 기억', content: '시장 이야기', keywords: [], source: 'Caregiver', recordedAt: '', updatedAt: '' },
    ]
    expect(computeTopicShares(chronicles, [])).toEqual([])
  })

  it('관찰되지 않은 연대기 주제는 목록에 새로 추가하지 않는다', () => {
    const chronicles: ChronicleEntry[] = [
      { id: 'c1', elderId: 'e1', topic: '노래', content: '', keywords: [], source: 'Caregiver', recordedAt: '', updatedAt: '' },
    ]
    const shares = computeTopicShares(chronicles, [analysis])
    expect(shares.map((s) => s.label)).not.toContain('노래')
  })
})

describe('observationSummary', () => {
  it('한 세션의 주제 반응만으로 참여 지속·관심 확대 추세를 주장하지 않는다', () => {
    const single = analyzeSession(elder, [
      ai('고향'), el('전주 시장에서 이웃들과 즐겁게 이야기했던 기억이 나요'),
    ])
    const summary = observationSummary(elder.name, computeTopicShares([], [single]))
    expect(summary).toBe('이순자 어르신은 고향 이야기에 특히 자주 응답하셨어요.')
  })

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

// ── 관찰 5축 + 기간 대비 변화 / 월별 추이 (Figma 인지 효과 분석·주제별 분석) ──
describe('computeAxisObservations', () => {
  const at = (iso: string) => ({ ...analysis, at: iso })
  const now = new Date('2026-07-15T00:00:00Z')

  it('분석이 없으면 값·변화량을 만들지 않는다(전부 null)', () => {
    const axes = computeAxisObservations([], 3, now)
    expect(axes).toHaveLength(5)
    expect(axes.every((a) => a.value === null && a.delta === null)).toBe(true)
  })

  it('최근 기간만 있으면 값은 나오고 변화량은 null(비교 근거 없음)', () => {
    const axes = computeAxisObservations([at('2026-07-01T00:00:00Z')], 3, now)
    const focus = axes.find((a) => a.axis === 'focus')
    expect(focus?.value).not.toBeNull()
    expect(focus?.delta).toBeNull()
  })

  it('직전 기간이 있으면 변화량(%p)을 계산한다', () => {
    const axes = computeAxisObservations(
      [at('2026-07-01T00:00:00Z'), at('2026-02-01T00:00:00Z')],
      3,
      now,
    )
    // 같은 분석을 넣었으므로 변화량은 0(값이 없다는 뜻의 null 과 구분된다)
    for (const a of axes) if (a.value !== null) expect(a.delta).toBe(0)
  })

  it('언어 표현력은 기준 60자에 대한 비율이며 100을 넘지 않는다', () => {
    const long = {
      ...analysis,
      metrics: { ...analysis.metrics, avgUtteranceChars: 500 },
      at: '2026-07-01T00:00:00Z',
    }
    const axes = computeAxisObservations([long], 3, now)
    expect(axes.find((a) => a.axis === 'expression')?.value).toBe(100)
  })
})

describe('computeMonthlyTopicTrend', () => {
  const now = new Date('2026-06-15T00:00:00Z')

  it('근거가 없으면 빈 시계열(달 축은 유지)', () => {
    const t = computeMonthlyTopicTrend([], 6, now)
    expect(t.months).toHaveLength(6)
    expect(t.series).toEqual([])
  })

  it('기록이 있는 달만 점을 찍고 없는 달은 null', () => {
    const t = computeMonthlyTopicTrend([{ ...analysis, at: '2026-06-02T00:00:00Z' }], 6, now)
    expect(t.months[5]).toBe('2026-06')
    expect(t.series.length).toBeGreaterThan(0)
    expect(t.series[0].points[5]).not.toBeNull()
    expect(t.series[0].points[0]).toBeNull()
  })
})

describe('computeMonthlyAxisTrend', () => {
  const now = new Date('2026-06-15T00:00:00Z')

  it('기록 없는 달은 null, 있는 달만 값을 낸다', () => {
    const t = computeMonthlyAxisTrend([{ ...analysis, at: '2026-06-02T00:00:00Z' }], 3, now)
    expect(t.months).toEqual(['2026-04', '2026-05', '2026-06'])
    expect(t.series).toHaveLength(5)
    for (const s of t.series) {
      expect(s.points[0]).toBeNull()
      expect(s.points[1]).toBeNull()
    }
    expect(t.series.find((s) => s.axis === 'focus')?.points[2]).not.toBeNull()
  })
})

describe('computeTopicDetail', () => {
  const mk = (topic: string, reaction: 'engaged' | 'low'): SessionAnalysis => ({
    version: 'v1',
    summary: '',
    emotionTone: 'calm',
    metrics: { elderTurns: 5, aiTurns: 5, responseRate: 0.8, avgUtteranceChars: 40, participation: 0.7 },
    topicsEngaged: reaction === 'engaged' ? [topic] : [],
    topicsLow: reaction === 'low' ? [topic] : [],
    topicOutcomes: [{ topic, reaction, elderTurns: 3 }],
    interestKeywords: [],
    recommendedTopics: [],
  })
  const now = new Date('2026-08-01T00:00:00Z')
  const iso = (daysAgo: number) =>
    new Date(now.getTime() - daysAgo * 86400000).toISOString()

  it('등장 세션 수·호응률·평균 길이를 센다', () => {
    const d = computeTopicDetail(
      [
        { analysis: mk('가족', 'engaged'), at: iso(1), seconds: 600 },
        { analysis: mk('가족', 'low'), at: iso(2), seconds: 900 },
        { analysis: mk('고향', 'engaged'), at: iso(3), seconds: 300 },
      ],
      '가족',
      3,
      now,
    )
    expect(d.mentions).toBe(2)
    expect(d.positiveRate).toBe(50)
    expect(d.avgSeconds).toBe(750)
  })

  it('비교 근거가 없으면 변화를 만들지 않는다', () => {
    const d = computeTopicDetail(
      [{ analysis: mk('가족', 'engaged'), at: iso(1), seconds: null }],
      '가족',
      3,
      now,
    )
    expect(d.avgSeconds).toBeNull()
    expect(d.delta.mentions).toBeNull()
  })

  it('등장하지 않은 주제는 0회 · 비율 null(0회 관찰 ≠ 측정 불가)', () => {
    const d = computeTopicDetail(
      [{ analysis: mk('고향', 'engaged'), at: iso(1), seconds: 600 }],
      '가족',
      3,
      now,
    )
    expect(d.mentions).toBe(0)
    expect(d.positiveRate).toBeNull()
  })
})

describe('computeParticipationDetail · axisAverage', () => {
  const mk = (responseRate: number): SessionAnalysis => ({
    version: 'v1',
    summary: '',
    emotionTone: 'calm',
    metrics: { elderTurns: 5, aiTurns: 5, responseRate, avgUtteranceChars: 40, participation: 0.7 },
    topicsEngaged: [],
    topicsLow: [],
    topicOutcomes: [],
    interestKeywords: [],
    recommendedTopics: [],
  })
  const now = new Date('2026-08-01T00:00:00Z')
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString()

  it('세션 수·평균 길이·응답률과 직전 기간 대비 변화를 낸다', () => {
    const d = computeParticipationDetail(
      [
        { analysis: mk(0.9), at: iso(1), seconds: 600 },
        { analysis: mk(0.7), at: iso(2), seconds: 900 },
        // 직전 기간(3~6개월 전) 1건
        { analysis: mk(0.5), at: iso(120), seconds: 300 },
      ],
      3,
      now,
    )
    expect(d.totalSessions).toBe(2)
    expect(d.avgSeconds).toBe(750)
    expect(d.avgResponseRate).toBe(80)
    expect(d.delta.totalSessions).toBe(1)
    expect(d.delta.avgSeconds).toBe(450)
    expect(d.delta.avgResponseRate).toBe(30)
  })

  it('분석이 없는 세션도 횟수에는 들지만 응답률 평균에서는 빠진다', () => {
    const d = computeParticipationDetail(
      [
        { analysis: mk(0.9), at: iso(1), seconds: 600 },
        { analysis: null, at: iso(2), seconds: 300 },
      ],
      3,
      now,
    )
    expect(d.totalSessions).toBe(2)
    expect(d.avgSeconds).toBe(450)
    expect(d.avgResponseRate).toBe(90)
  })

  it('직전 기간 기록이 없으면 변화를 만들지 않는다', () => {
    const d = computeParticipationDetail([{ analysis: mk(0.9), at: iso(1), seconds: null }], 3, now)
    expect(d.avgSeconds).toBeNull()
    expect(d.delta.totalSessions).toBeNull()
    expect(d.delta.avgResponseRate).toBeNull()
  })

  it('축 평균은 값이 있는 축만 센다 — 전부 없으면 null', () => {
    expect(
      axisAverage([
        { axis: 'recall', value: 60, delta: null },
        { axis: 'emotion', value: 80, delta: null },
        { axis: 'focus', value: null, delta: null },
      ]),
    ).toBe(70)
    expect(axisAverage([{ axis: 'recall', value: null, delta: null }])).toBeNull()
  })
})

describe('computeEmotionSplit · describeSessionTraits', () => {
  const turn = (speaker: 'AI' | 'Elderly', text: string): ConversationTurn => ({
    id: 't' + ++seq, speaker, text, timestamp: '',
  })

  it('어르신 발화만 말투 묶음으로 세고 합을 100 으로 맞춘다', () => {
    const split = computeEmotionSplit([
      turn('AI', '고향 이야기 들려주세요'),
      turn('Elderly', '참 좋아 재미있었지'), // bright
      turn('Elderly', '그립네 예전 그 시절이'), // longing
      turn('Elderly', '그냥 조용히 지냈어'), // calm
    ])
    expect(split.turns).toBe(3)
    expect(split.bright + split.calm + split.longing).toBe(100)
    expect(split.bright).toBeGreaterThan(0)
  })

  it('발화가 없으면 값을 만들지 않는다', () => {
    const split = computeEmotionSplit([turn('AI', '안녕하세요')])
    expect(split).toEqual({ bright: 0, calm: 0, longing: 0, turns: 0 })
    const traits = describeSessionTraits(null, split, null)
    expect(traits.topEmotion).toBeNull()
    expect(traits.focus).toBeNull()
    expect(traits.expression).toBeNull()
    expect(traits.length).toBeNull()
  })

  it('대화 특성은 지표 밴드로 낸다', () => {
    const a: SessionAnalysis = {
      version: 'v1', summary: '', emotionTone: 'bright',
      metrics: { elderTurns: 5, aiTurns: 5, responseRate: 0.9, avgUtteranceChars: 70, participation: 0.8 },
      topicsEngaged: [], topicsLow: [], topicOutcomes: [], interestKeywords: [], recommendedTopics: [],
    }
    const split = computeEmotionSplit([turn('Elderly', '재미있었어 웃었지')])
    const t = describeSessionTraits(a, split, 1000)
    expect(t.focus).toBe('높음')
    expect(t.expression).toBe('높음')
    expect(t.length).toBe('긴 편')
    expect(t.topEmotion?.label).toBe('밝음')
    expect(t.topEmotion?.percent).toBe(100)
  })
})
