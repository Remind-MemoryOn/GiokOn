import { describe, expect, it } from 'vitest'
import { calibrate, contextText, validateHeads } from './classifier.ts'
import { encodePair, parseVocab, preTokenize, tokenize } from './tokenizer.ts'

const VOCAB = parseVocab(['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]', '죽', '##고', '싶', '##어', ',', '그', '##만', '!', '漢', '어', '##르', '##신', ':'].join('\n'))

describe('WordPiece 토크나이저(BertNormalizer · BertPreTokenizer 동작)', () => {
  it('공백·문장부호로 나누고, 이어지는 조각은 ##', () => {
    expect(preTokenize('죽고  싶어,그만!')).toEqual(['죽고', '싶어', ',', '그만', '!'])
    expect(tokenize('죽고 싶어, 그만!', VOCAB)).toEqual([5, 6, 7, 8, 9, 10, 11, 12])
  })
  it('나눌 수 없는 단어는 통째로 [UNK]', () => {
    expect(tokenize('죽다', VOCAB)).toEqual([VOCAB.unk])
  })
  it('제어 문자는 지우고 줄바꿈·탭은 공백, 한자는 따로 뗀다, 대소문자는 그대로', () => {
    expect(preTokenize('a\u0007b\tc\nD漢e')).toEqual(['ab', 'c', 'D', '漢', 'e'])
  })
  it('100자 넘는 단어는 [UNK]', () => {
    expect(tokenize('죽'.repeat(101), VOCAB)).toEqual([VOCAB.unk])
  })
  it('문장 쌍 = [CLS] 문맥 [SEP] 대상 [SEP], 넘치면 문맥 뒤를 자른다', () => {
    const e = encodePair('그만 그만 그만', '죽고', VOCAB, 7)
    expect(e.inputIds).toEqual([2, 10, 11, 3, 5, 6, 3])
    expect(e.tokenTypeIds).toEqual([0, 0, 0, 0, 1, 1, 1])
    expect(e.attentionMask).toEqual([1, 1, 1, 1, 1, 1, 1])
    expect(e.targetTruncated).toBe(false)
  })
  it('대상 턴만으로 넘치면 대상 끝을 자르고 표시한다', () => {
    const e = encodePair('그만', '죽고 죽고 죽고', VOCAB, 6)
    expect(e.inputIds).toEqual([2, 3, 5, 6, 5, 3])
    expect(e.targetTruncated).toBe(true)
  })
})

describe('보정·문맥·heads.json 검사', () => {
  it('다중 축은 시그모이드, 한 값 축은 소프트맥스(온도로 나눈 뒤)', () => {
    expect(calibrate([0], 2, true)[0]).toBeCloseTo(0.5)
    expect(calibrate([2], 2, true)[0]).toBeCloseTo(1 / (1 + Math.exp(-1)))
    const p = calibrate([1, 1, 1], 1, false)
    p.forEach(v => expect(v).toBeCloseTo(1 / 3))
  })
  it('문맥 형식은 학습과 같다', () => {
    expect(contextText([{ speaker: 'ai', text: '안녕하세요?' }, { speaker: 'elder', text: '응' }])).toBe('AI: 안녕하세요? / 어르신: 응')
    expect(contextText([])).toBe('(문맥 없음)')
  })
  it('축·라벨·온도가 core 와 다르면 불러오지 않는다', () => {
    const heads = {
      content: ['crisis_appeal', 'acute_distress', 'sadness_grief', 'physical_discomfort', 'refusal', 'rest_request', 'reminiscence', 'daily', 'confusion', 'unknown'],
      crisisCategory: ['self_harm', 'medical_emergency', 'abuse', 'none', 'unknown'],
      subject: ['self', 'other', 'unknown'], tense: ['present', 'recent', 'past', 'future', 'unknown'],
      mode: ['direct', 'quote', 'hypothetical', 'negated', 'idiom', 'unknown'], intent: ['continue', 'switch', 'rest', 'end', 'unknown'],
      interpretability: ['sufficient', 'insufficient', 'conflict', 'out_of_scope'],
    }
    const temperatures = Object.fromEntries(Object.keys(heads).map(k => [k, 1.5]))
    expect(() => validateHeads({ heads, temperatures, max_len: 128 })).not.toThrow()
    expect(() => validateHeads({ heads: { ...heads, tense: ['present', 'past', 'future', 'unknown'] }, temperatures, max_len: 128 })).toThrow()
    expect(() => validateHeads({ heads, temperatures: { ...temperatures, mode: 0 }, max_len: 128 })).toThrow()
  })
})
