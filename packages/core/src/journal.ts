// @giokon/core — 요양일지 AI 초안 (M19.2 — mock, 실 LLM 은 Edge Function 대체)
//
// 원문(구어 전사·사진 메모·타이핑)을 받아 구조화된 일지 초안을 만든다.
// ⚠️ 초안은 반드시 요양보호사 확인·수정 후 저장한다(자동 저장 금지 — F-25).
// ⚠️ 비의료: 관찰 기록 보조일 뿐 진단·의학적 판정을 만들지 않는다.
// 실 AI 연동 시 같은 시그니처의 Edge Function 호출로 무변경 교체한다.

export type JournalDraftSource = 'photo' | 'voice' | 'typed'

export interface JournalDraftInput {
  elderName: string
  source: JournalDraftSource
  /** 음성 전사·사진에서 옮긴 메모·직접 입력 원문. */
  rawText: string
  /** YYYY-MM-DD(생략 시 호출자가 날짜를 관리). */
  date?: string
}

/** 관찰 카테고리(비의료 — 일상 돌봄 관찰 항목).
 * 건강 신호는 놓치면 안 되므로 최우선 매칭한다(예: "기침하며 물을 드셨다"
 * 는 식사가 아니라 건강 관찰로). 이후는 일상 순서. */
const CATEGORIES: Array<{ label: string; keywords: string[] }> = [
  { label: '건강 관찰', keywords: ['혈압', '체온', '약', '복용', '기침', '통증', '아프', '병원', '어지럽'] },
  { label: '식사', keywords: ['식사', '아침', '점심', '저녁', '드셨', '드심', '반찬', '국', '밥', '간식', '음료', '물'] },
  { label: '수면·휴식', keywords: ['주무', '낮잠', '수면', '휴식', '누워', '잠'] },
  { label: '활동', keywords: ['산책', '운동', '체조', '프로그램', '활동', '걷', '외출', '놀이'] },
  { label: '기분·표정', keywords: ['기분', '웃', '밝', '표정', '즐거', '좋아하', '싫어', '짜증', '우울'] },
  { label: '방문·소통', keywords: ['방문', '가족', '보호자', '전화', '면회', '대화'] },
]

const SOURCE_LABEL: Record<JournalDraftSource, string> = {
  photo: '사진 기록',
  voice: '음성 입력',
  typed: '직접 입력',
}

function splitSentences(raw: string): string[] {
  return raw
    .split(/(?<=[.!?다요음됨함])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function categorize(sentence: string): string {
  for (const c of CATEGORIES) {
    if (c.keywords.some((k) => sentence.includes(k))) return c.label
  }
  return '기타 관찰'
}

/**
 * 원문 → 구조화 일지 초안(텍스트). 문장을 관찰 카테고리로 묶어 정리한다.
 * 반환값은 편집 가능한 초안이며, 저장 전 반드시 사람 확인을 거친다.
 */
export function buildJournalDraft(input: JournalDraftInput): string {
  const raw = input.rawText.trim()
  if (!raw) {
    throw new Error('일지 원문이 비어 있습니다')
  }

  const sentences = splitSentences(raw)
  const byCategory = new Map<string, string[]>()
  for (const s of sentences) {
    const cat = categorize(s)
    const arr = byCategory.get(cat) ?? []
    arr.push(s)
    byCategory.set(cat, arr)
  }

  const lines: string[] = []
  lines.push(`[${input.elderName} 어르신 요양일지${input.date ? ` · ${input.date}` : ''}]`)
  lines.push(`입력 방식: ${SOURCE_LABEL[input.source]}`)
  lines.push('')

  // 카테고리 순서 고정(정의 순), 기타는 마지막.
  for (const c of CATEGORIES) {
    const items = byCategory.get(c.label)
    if (!items || items.length === 0) continue
    lines.push(`■ ${c.label}`)
    for (const item of items) lines.push(`- ${item}`)
    lines.push('')
  }
  const etc = byCategory.get('기타 관찰')
  if (etc && etc.length > 0) {
    lines.push('■ 기타 관찰')
    for (const item of etc) lines.push(`- ${item}`)
    lines.push('')
  }

  lines.push('※ AI가 정리한 초안입니다. 내용을 확인·수정한 뒤 저장해 주세요.')
  return lines.join('\n')
}
