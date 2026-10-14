import { describe, expect, it } from 'vitest'
import type { SessionAnalysisRow } from '../database.types'
import { parseSessionAnalysis } from './analyses'

const historic = {
  version: 'v1.0', summary: '고향 이야기를 나눴어요.', emotionTone: 'calm',
  metrics: { elderTurns: 2, aiTurns: 2, responseRate: 1, participation: 0.5, avgUtteranceChars: 20 },
  topicsEngaged: ['고향'], topicsLow: [],
  topicOutcomes: [{ topic: '고향', reaction: 'engaged', elderTurns: 2 }],
  interestKeywords: [], recommendedTopics: ['고향'],
}
const row = (analysis: unknown) => ({ analysis }) as SessionAnalysisRow

describe('parseSessionAnalysis', () => {
  it('preserves valid historic analysis without newer optional fields', () => {
    expect(parseSessionAnalysis(row(historic))).toBe(historic)
  })

  it.each([
    { ...historic, metrics: null },
    { ...historic, metrics: [] },
    { ...historic, metrics: { ...historic.metrics, responseRate: '1' } },
    { ...historic, metrics: { ...historic.metrics, avgUtteranceChars: undefined } },
    { summary: historic.summary, metrics: historic.metrics },
    { ...historic, topicsEngaged: null },
    { ...historic, topicsLow: {} },
    { ...historic, interestKeywords: [null] },
    { ...historic, recommendedTopics: undefined },
    { ...historic, topicOutcomes: [null] },
    { ...historic, topicOutcomes: [{ topic: '고향', reaction: 'engaged' }] },
    { ...historic, emotionTone: { toString: null } },
    { ...historic, topicOutcomes: [{ ...historic.topicOutcomes[0], excerpt: {} }] },
  ])('rejects unusable stored JSON instead of passing it to charts: %#', analysis => {
    expect(parseSessionAnalysis(row(analysis))).toBeNull()
  })
})
