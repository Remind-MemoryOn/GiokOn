import { describe, expect, it } from 'vitest'
import type { GeneratedSession } from './generated-session'
import { buildGuardianText, mapAnalysisToJournalFields, screenJournalDraft } from './program-journal'

const ev = [{ turnId: 'log-1', quote: '시장' }]
const result = (patch: Partial<GeneratedSession> = {}): GeneratedSession => ({
  summary: [{ text: '어머니와 시장에 갔던 기억을 이야기하셨습니다.', evidence: ev }],
  topics: [],
  journal: [{ text: '어린 시절 시장 이야기를 나누었다.', evidence: ev }, { text: '어머니에 대한 기억을 이어 말씀하셨다.', evidence: ev }],
  ...patch,
})

describe('mapAnalysisToJournalFields (T20.4)', () => {
  it('fills only grounded fields and leaves the human judgement fields empty', () => {
    const fields = mapAnalysisToJournalFields(result({ participantResponse: [{ text: '질문마다 길게 답하셨다.', evidence: ev }] }))
    expect(fields.activity_content).toBe('어린 시절 시장 이야기를 나누었다.\n어머니에 대한 기억을 이어 말씀하셨다.')
    expect(fields.participant_response).toBe('질문마다 길게 답하셨다.')
    expect(fields.opinion_collected).toBeNull() // 소감 근거가 없으면 만들지 않는다
    expect(fields.overall_evaluation).toBeNull()
    expect(fields.next_plan).toBeNull()
  })
  it('does not truncate an overlong section into an apparently complete record', () => {
    const long = { text: '가'.repeat(800), evidence: ev }
    expect(mapAnalysisToJournalFields(result({ participantResponse: [long, long, long] })).participant_response).toBeNull()
  })
})

describe('buildGuardianText (T20.4)', () => {
  it('prefers the generated guardian sentence, then the first summary sentence', () => {
    expect(buildGuardianText(result({ guardianText: '오늘 시장 이야기를 들려주셨어요.' }))).toBe('오늘 시장 이야기를 들려주셨어요.')
    expect(buildGuardianText(result())).toBe('어머니와 시장에 갔던 기억을 이야기하셨습니다.')
  })
  it('never forwards a judgemental sentence to the guardian', () => {
    expect(buildGuardianText(result({ summary: [{ text: '우울해 보이셨습니다.', evidence: ev }] }))).toBeNull()
  })
})

describe('screenJournalDraft (T20.4)', () => {
  it('clears only the offending field and always stays pending review', () => {
    const screened = screenJournalDraft({
      activity_content: '시장 이야기를 나누었다.', participant_response: '인지 저하가 의심된다.',
      opinion_collected: '재미있었다고 하셨다.', overall_evaluation: null, next_plan: null, guardian_text: '병원 진료를 권장합니다.',
    })
    expect(screened.fields.activity_content).toBe('시장 이야기를 나누었다.')
    expect(screened.fields.opinion_collected).toBe('재미있었다고 하셨다.')
    expect(screened.fields.participant_response).toBeNull()
    expect(screened.fields.guardian_text).toBeNull()
    expect(screened.cleared).toEqual(['participant_response', 'guardian_text'])
    expect(screened.status).toBe('pending_review')
  })
})
