// BERT WordPiece 토크나이저 — 학습 때 쓴 Hugging Face `tokenizers` 설정과 같은 결과를 내도록 옮긴 것(CTX-CLS-S5).
// 대상 설정(KcELECTRA-small-v2022 의 tokenizer.json): BertNormalizer(clean_text · handle_chinese_chars ·
// lowercase=false · strip_accents=없음) → BertPreTokenizer(공백·문장부호 분리) → WordPiece('##', 단어 최대 100자).
// 문장 쌍 = [CLS] 문맥 [SEP] 대상 턴 [SEP], 길이 초과는 문맥 쪽을 뒤에서 자른다(학습의 truncation="only_first").
// 일치 여부는 Python 출력과 비교하는 테스트로 확인한다(parity.test.ts).

export interface Vocab {
  readonly ids: ReadonlyMap<string, number>
  readonly unk: number
  readonly cls: number
  readonly sep: number
  readonly pad: number
}

export interface EncodedPair {
  inputIds: number[]
  attentionMask: number[]
  tokenTypeIds: number[]
  /** 대상 턴만으로 최대 길이를 넘어 대상 턴 끝을 잘랐는가(학습에서는 일어나지 않던 경우). */
  targetTruncated: boolean
}

const MAX_WORD_CHARS = 100

/** vocab.txt(한 줄에 토큰 하나, 줄 번호 = id) → 어휘. */
export function parseVocab(text: string): Vocab {
  const ids = new Map<string, number>()
  text.split('\n').forEach((line, i) => {
    const tok = line.replace(/\r$/, '')
    if (tok !== '' && !ids.has(tok)) ids.set(tok, i)
  })
  const need = (t: string) => {
    const id = ids.get(t)
    if (id === undefined) throw new Error(`어휘에 ${t} 가 없다`)
    return id
  }
  return { ids, unk: need('[UNK]'), cls: need('[CLS]'), sep: need('[SEP]'), pad: need('[PAD]') }
}

const isWhitespace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || /\p{Zs}/u.test(c)
const isControl = (c: string) => c !== '\t' && c !== '\n' && c !== '\r' && /\p{C}/u.test(c)
function isPunctuation(c: string): boolean {
  const cp = c.codePointAt(0)!
  if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) return true
  return /\p{P}/u.test(c)
}
function isChineseChar(cp: number): boolean {
  return (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0x2a700 && cp <= 0x2b73f) || (cp >= 0x2b740 && cp <= 0x2b81f) || (cp >= 0x2b820 && cp <= 0x2ceaf) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x2f800 && cp <= 0x2fa1f)
}

/** BertNormalizer(lowercase·악센트 제거 없음) + BertPreTokenizer → 단어 목록. */
export function preTokenize(text: string): string[] {
  let s = ''
  for (const c of text) {
    const cp = c.codePointAt(0)!
    if (cp === 0 || cp === 0xfffd || isControl(c)) continue
    // 정규화의 공백 + 사전 분리의 공백(Rust char::is_whitespace — 줄·문단 구분자 포함)
    if (isWhitespace(c) || /[\p{Zl}\p{Zp}]/u.test(c)) s += ' '
    else if (isChineseChar(cp)) s += ` ${c} `
    else s += c
  }
  const words: string[] = []
  for (const chunk of s.split(' ')) {
    if (!chunk) continue
    let cur = ''
    for (const c of chunk) {
      if (isPunctuation(c)) {
        if (cur) words.push(cur)
        words.push(c)
        cur = ''
      } else cur += c
    }
    if (cur) words.push(cur)
  }
  return words
}

/** 단어 하나 → WordPiece id(가장 긴 앞부분부터, 이어지는 조각은 '##'). 못 나누면 [UNK] 하나. */
export function wordPiece(word: string, vocab: Vocab): number[] {
  const chars = Array.from(word)
  if (chars.length > MAX_WORD_CHARS) return [vocab.unk]
  const out: number[] = []
  let start = 0
  while (start < chars.length) {
    let end = chars.length
    let found: number | undefined
    while (start < end) {
      const piece = (start > 0 ? '##' : '') + chars.slice(start, end).join('')
      found = vocab.ids.get(piece)
      if (found !== undefined) break
      end--
    }
    if (found === undefined) return [vocab.unk]
    out.push(found)
    start = end
  }
  return out
}

export function tokenize(text: string, vocab: Vocab): number[] {
  return preTokenize(text).flatMap(w => wordPiece(w, vocab))
}

/** 문장 쌍 인코딩. 패딩은 하지 않는다(한 건씩 추론). */
export function encodePair(context: string, target: string, vocab: Vocab, maxLen: number): EncodedPair {
  let a = tokenize(context, vocab)
  let b = tokenize(target, vocab)
  let targetTruncated = false
  const room = maxLen - 3
  if (b.length > room) { b = b.slice(0, room); targetTruncated = true }
  if (a.length + b.length > room) a = a.slice(0, room - b.length)
  const inputIds = [vocab.cls, ...a, vocab.sep, ...b, vocab.sep]
  const tokenTypeIds = [...new Array(a.length + 2).fill(0), ...new Array(b.length + 1).fill(1)]
  return { inputIds, attentionMask: new Array(inputIds.length).fill(1), tokenTypeIds, targetTruncated }
}
