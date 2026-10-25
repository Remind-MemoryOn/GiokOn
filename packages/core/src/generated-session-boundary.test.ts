import { describe, expect, it } from 'vitest'
import { validateGeneratedSession } from './generated-session'

const turns = [{ id: 'elder-1', speaker: 'Elderly', text: '시장에 갔어요. 어머니와 함께 갔어요.' }]
const claim = () => ({ text: '시장에 갔던 이야기를 했습니다.', evidence: [{ turnId: 'elder-1', quote: '시장에 갔어요.' }] })
const valid = () => ({ summary: [claim()], topics: [], journal: [claim()] })

describe('generation parser branch and collection boundaries', () => {
  it.each([null, [], 'text', { text: '시장', evidence: [] }, { text: '시장', evidence: null }])('rejects malformed claims without silently dropping them: %j', item => {
    expect(() => validateGeneratedSession({ ...valid(), journal: [item] }, turns)).toThrow()
  })

  it.each(['', ' ', '관찰\u0000내용', '가'.repeat(801)])('rejects empty, control-character and oversized sentences', text => {
    expect(() => validateGeneratedSession({ ...valid(), journal: [{ ...claim(), text }] }, turns)).toThrow('INVALID_GENERATION_TEXT')
  })

  it('accepts exact limits and rejects an excess item in every collection', () => {
    const data = { summary: Array.from({ length: 3 }, claim), topics: Array.from({ length: 5 }, () => ({ ...claim(), name: '가'.repeat(60) })), journal: Array.from({ length: 5 }, claim), participantResponse: Array.from({ length: 3 }, claim), opinion: Array.from({ length: 2 }, claim), guardianText: '가'.repeat(300) }
    expect(validateGeneratedSession(data, turns).journal).toHaveLength(5)
    for (const key of ['summary', 'topics', 'journal', 'participantResponse', 'opinion'] as const) {
      expect(() => validateGeneratedSession({ ...data, [key]: [...data[key], data[key][0]] }, turns)).toThrow('INVALID_GENERATION_SECTIONS')
    }
    expect(() => validateGeneratedSession({ ...data, guardianText: '가'.repeat(301) }, turns)).toThrow('INVALID_GENERATION_TEXT')
  })

  it('checks every evidence item and each topic name, including the final item', () => {
    const four = Array.from({ length: 4 }, () => ({ turnId: 'elder-1', quote: '시장에 갔어요.' }))
    expect(validateGeneratedSession({ ...valid(), journal: [{ ...claim(), evidence: four }] }, turns).journal[0].evidence).toHaveLength(4)
    expect(() => validateGeneratedSession({ ...valid(), journal: [{ ...claim(), evidence: [...four, four[0]] }] }, turns)).toThrow('MISSING_EVIDENCE')
    expect(() => validateGeneratedSession({ ...valid(), journal: [{ ...claim(), evidence: [...four.slice(0, 3), { turnId: 'elder-1', quote: '존재하지 않는 인용' }] }] }, turns)).toThrow('INVALID_EVIDENCE')
    expect(() => validateGeneratedSession({ ...valid(), topics: [{ ...claim(), name: '인지 기능 향상' }] }, turns)).toThrow('UNSUPPORTED_CONCLUSION')
    expect(() => validateGeneratedSession({ ...valid(), topics: [{ ...claim(), name: '가'.repeat(61) }] }, turns)).toThrow('INVALID_GENERATION_TEXT')
  })

  it('does not mutate the supplied data while trimming validated text', () => {
    const data = valid(); data.journal[0].text = '  시장 이야기  '
    const snapshot = structuredClone(data)
    expect(validateGeneratedSession(data, turns).journal[0].text).toBe('시장 이야기')
    expect(data).toEqual(snapshot)
  })
})
