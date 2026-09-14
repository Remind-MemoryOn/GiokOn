import { describe, expect, it } from 'vitest'
import { validateGeneratedSession, renderSessionJournal } from './generated-session'

const turns = [{ id: 'log-1', speaker: 'Elderly', text: '어릴 때 어머니와 시장에 가는 것이 즐거웠어요.' }]
const claim = { text: '어머니와 시장에 갔던 기억을 이야기했습니다.', evidence: [{ turnId: 'log-1', quote: '어머니와 시장' }] }
const valid = () => ({ summary: [structuredClone(claim)], topics: [{ name: '가족과 시장', ...structuredClone(claim) }], journal: [structuredClone(claim)] })

describe('LLM session output boundary', () => {
  it('accepts grounded sections and identifies the journal as an unconfirmed conversation draft', () => {
    const result = validateGeneratedSession(valid(), turns)
    expect(result.summary[0].evidence[0].turnId).toBe('log-1')
    expect(renderSessionJournal(result)).toContain('담당자 확인 전')
    expect(renderSessionJournal(result)).toContain('회상 대화')
  })
  it('rejects invented source IDs', () => {
    const data = valid(); data.journal[0].evidence[0].turnId = 'other-session'
    expect(() => validateGeneratedSession(data, turns)).toThrow()
  })
  it('rejects invented quotes and AI speech used as elder evidence', () => {
    const data = valid(); data.summary[0].evidence[0].quote = '식사를 모두 드셨다'
    expect(() => validateGeneratedSession(data, turns)).toThrow()
    expect(() => validateGeneratedSession(valid(), [{ ...turns[0], speaker: 'AI' }])).toThrow()
  })
  it('rejects provider-generated numeric metrics and missing grounding', () => {
    expect(() => validateGeneratedSession({ ...valid(), responseRate: 100 }, turns)).toThrow()
    const data = valid(); data.journal[0].evidence = []
    expect(() => validateGeneratedSession(data, turns)).toThrow()
  })
  it('rejects empty, excessive and malformed output', () => {
    expect(() => validateGeneratedSession(null, turns)).toThrow()
    const data = valid(); data.summary[0].text = '가'.repeat(801)
    expect(() => validateGeneratedSession(data, turns)).toThrow()
    expect(() => validateGeneratedSession({ ...valid(), journal: [] }, turns)).toThrow()
  })
  it('rejects efficacy or clinical conclusions in generated claims', () => {
    const data = valid(); data.summary[0].text = '인지 기능이 향상되었습니다.'
    expect(() => validateGeneratedSession(data, turns)).toThrow()
  })
})
