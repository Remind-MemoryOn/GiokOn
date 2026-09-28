import { describe, expect, it } from 'vitest'
import { parseRelaySafetySummary, relaySafetySummary, safetyEventDraftFor } from './conversation'
import { assessUtterance, caregiverAlertText, CRISIS_CAREGIVER_ALERT, DISTRESS_CAREGIVER_NOTE } from './safety'

const ABUSE = '아들이 자꾸 때려'

const CASES: [string, string][] = [
  ['자살 위기', '이제 그만 죽고 싶어'],
  ['응급', '숨이 안 쉬어져요'],
  ['학대', ABUSE],
  ['고통 신호', '자식들한테 짐만 되는 것 같아'],
  ['고통 + 중단 요청', '너무 힘들어서 그만하고 싶어'],
  ['중단 요청만', '오늘은 그만하고 싶어'],
  ['거부', '싫어 안 할래'],
  ['평범한 말', '옛날에 시장에서 장사를 했지'],
]

describe('relaySafetySummary — 중계가 앱에 보내는 판정 요약(T25.14)', () => {
  it.each(CASES)('%s: 요약은 기록 초안이 있을 때만 있고, 수준·분류·문구가 초안과 같다', (_, text) => {
    const a = assessUtterance(text)
    const draft = safetyEventDraftFor(a, text)
    const summary = relaySafetySummary(a)
    expect(summary === null).toBe(draft === null)
    if (!draft || !summary) return
    expect(summary.level).toBe(draft.level)
    expect(summary.categories).toEqual(draft.categories)
    expect(caregiverAlertText(summary.alert)).toBe(draft.caregiverAlert)
  })

  it('위기 3종·고통 신호가 각각 종류별 안내로 이어진다', () => {
    expect(caregiverAlertText(relaySafetySummary(assessUtterance('이제 그만 죽고 싶어'))!.alert)).toBe(CRISIS_CAREGIVER_ALERT.self_harm)
    expect(caregiverAlertText(relaySafetySummary(assessUtterance('숨이 안 쉬어져요'))!.alert)).toBe(CRISIS_CAREGIVER_ALERT.medical_emergency)
    expect(caregiverAlertText(relaySafetySummary(assessUtterance(ABUSE))!.alert)).toBe(CRISIS_CAREGIVER_ALERT.abuse)
    expect(caregiverAlertText(relaySafetySummary(assessUtterance('자식들한테 짐만 되는 것 같아'))!.alert)).toBe(DISTRESS_CAREGIVER_NOTE)
  })

  it('요약에는 원문·매칭 단어가 들어가지 않는다', () => {
    const text = '이제 그만 죽고 싶어'
    const summary = relaySafetySummary(assessUtterance(text))!
    expect(Object.keys(summary).sort()).toEqual(['alert', 'categories', 'level'])
    const json = JSON.stringify(summary)
    expect(json).not.toContain('죽고')
    for (const term of assessUtterance(text).matchedTerms) expect(json).not.toContain(term)
  })
})

describe('parseRelaySafetySummary — 받은 요약 검증', () => {
  it('정상 요약은 그대로 받는다', () => {
    const summary = relaySafetySummary(assessUtterance('숨이 안 쉬어져요'))!
    expect(parseRelaySafetySummary(JSON.parse(JSON.stringify(summary)))).toEqual(summary)
    expect(parseRelaySafetySummary({ level: 'watch', categories: [], alert: 'distress' })).toEqual({ level: 'watch', categories: [], alert: 'distress' })
  })

  it.each([
    ['없음', undefined],
    ['배열', []],
    ['모르는 수준', { level: 'high', categories: [], alert: 'distress' }],
    ['모르는 알림', { level: 'crisis', categories: ['self_harm'], alert: 'fire' }],
    ['모르는 분류', { level: 'crisis', categories: ['theft'], alert: 'self_harm' }],
    ['중복 분류', { level: 'crisis', categories: ['abuse', 'abuse'], alert: 'abuse' }],
    ['분류가 배열 아님', { level: 'crisis', categories: 'abuse', alert: 'abuse' }],
    ['여분 칸(원문)', { level: 'crisis', categories: ['self_harm'], alert: 'self_harm', excerpt: '죽고 싶어' }],
  ])('%s → 버린다', (_, value) => {
    expect(parseRelaySafetySummary(value)).toBeNull()
  })
})
