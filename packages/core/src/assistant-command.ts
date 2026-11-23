// @giokon/core — 요양보호사 대화창의 **자유 입력 해석**(규칙 기반, 2026-11-04 사용자 결정)
//
// "박희수 어르신 세션 대신 설계하는데, 대화 주제는 가족으로 하자." 처럼 버튼 없이 한 문장으로 말해도
// 업무·어르신·설계 값·공개 대상·답장 내용을 뽑는다. 결정(질문 답변):
//   - 지금은 규칙만 쓴다. 나중에 LLM 이 같은 모양(`CaregiverCommand`)을 돌려주도록 `CommandInterpreter` 로 자리를 둔다.
//   - '주제' 는 관련 키워드로 넣고, 제목이 없으면 '<주제> 이야기' 를 **제안**한다(확인 카드에서 보인다).
//   - 말하지 않은 값은 웹 '회상 세션 설계' 모달과 같은 기본값(목표 시간 = 기관 설정 · 기록일 = 오늘 ·
//     피해갈 내용 = 기관 기본값)으로 채우고, 필수인 어르신·제목·목표만 다시 묻는다.
// ⛔ 해석 결과는 **확인 카드**로만 이어진다 — 여기서도, 화면에서도 확인 전에는 아무것도 저장하지 않는다.
// 모두 결정론적 순수 함수다(모델 호출·네트워크 없음).

import { normalizeAsk, isSkip, PLAN_LIMITS, PLAN_MIN_MINUTES, type CaregiverTask, type ElderChoice, type PlanDraft } from './assistant'
import { SESSION_MAX_MINUTES } from './session-phase'

// ─────────────────────────────────────────────────────────────
// 날짜 — 문장 어디에 있어도 찾는다
// ─────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

function addDays(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

function validYmd(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date.toISOString().slice(0, 10)
}

/**
 * 문장 속 날짜 표현 → YYYY-MM-DD. 없으면 null.
 * direction = 'future'(세션 설계 — 연도·주 없는 표현은 앞으로) · 'past'(공개 관리 — 이미 있는 기록을 가리킨다).
 * 지원: 오늘·내일·모레·어제·그제/그저께 · (이번 주|다음 주|지난 주) X요일 · X요일 · M월 D일 · YYYY-MM-DD/YYYY.MM.DD.
 */
export function findDateMention(text: string, today: string, direction: 'future' | 'past'): string | null {
  if (Number.isNaN(new Date(`${today}T00:00:00Z`).getTime())) return null
  const t = text.replace(/\s+/g, ' ')
  const full = t.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/)
  if (full) return validYmd(Number(full[1]), Number(full[2]), Number(full[3]))
  const md = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (md) {
    const y = Number(today.slice(0, 4))
    const iso = validYmd(y, Number(md[1]), Number(md[2]))
    if (!iso) return null
    if (direction === 'future' && iso < today) return validYmd(y + 1, Number(md[1]), Number(md[2]))
    if (direction === 'past' && iso > today) return validYmd(y - 1, Number(md[1]), Number(md[2]))
    return iso
  }
  const wd = t.match(/(이번\s*주|다음\s*주|담주|지난\s*주|저번\s*주)?\s*([일월화수목금토])요일/)
  if (wd) {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
    const target = WEEKDAYS.indexOf(wd[2] as (typeof WEEKDAYS)[number])
    const which = (wd[1] ?? '').replace(/\s/g, '')
    if (which) {
      // 주는 월요일에 시작한다.
      const monday = addDays(today, -((dow + 6) % 7))
      const inWeek = addDays(monday, (target + 6) % 7)
      if (which === '이번주') return inWeek
      if (which === '다음주' || which === '담주') return addDays(inWeek, 7)
      return addDays(inWeek, -7)
    }
    const diff = direction === 'future' ? (target - dow + 7) % 7 : -((dow - target + 7) % 7)
    return addDays(today, diff)
  }
  if (/모레/.test(t)) return addDays(today, 2)
  if (/내일/.test(t)) return addDays(today, 1)
  if (/그저께|그제/.test(t)) return addDays(today, -2)
  if (/어제/.test(t)) return addDays(today, -1)
  if (/오늘/.test(t)) return today
  return null
}

// ─────────────────────────────────────────────────────────────
// 꼬리표 붙은 값 — "주제는 가족으로", "목표는 '…'", "키워드는 시장, 백설기"
// ─────────────────────────────────────────────────────────────

type SlotName = 'title' | 'goal' | 'topic' | 'content' | 'avoid' | 'keywords' | 'minutes' | 'date'

// 긴 꼬리표가 먼저다('목표 시간' > '목표', '피해갈 내용' > '내용').
const SLOT_LABELS: readonly [SlotName, readonly string[]][] = [
  ['minutes', ['목표 시간', '목표시간', '대화 시간', '진행 시간', '시간', '길이']],
  ['avoid', ['피해갈 내용', '피해 갈 내용', '피할 내용', '피할 주제', '피해갈 주제', '피할 이야기', '피해갈 이야기', '금지 주제', '금지어']],
  ['content', ['나눌 이야기', '나눌 내용', '대화 내용', '지침', '내용']],
  ['keywords', ['관련 키워드', '키워드']],
  ['title', ['세션 제목', '세션명', '제목']],
  ['goal', ['대화 목표', '목표', '목적']],
  ['topic', ['대화 주제', '이야기 주제', '회상 주제', '주제', '테마']],
  ['date', ['기록일', '진행일', '날짜', '일정']],
]

const LABEL_ALT = SLOT_LABELS.flatMap(([, ls]) => ls)
  .sort((a, b) => b.length - a.length)
  .map((l) => l.replace(/ /g, '\\s*'))
  .join('|')
// 꼬리표 + 조사(은·는·을·를·:) — 조사가 있어야 꼬리표로 본다(값 속의 '시간'·'내용' 같은 낱말과 구별).
const LABEL_RE = new RegExp(`(?:^|[\\s,.!?'"“”‘’])(${LABEL_ALT})\\s*(?:은|는|을|를|:|：)\\s*`, 'g')

const QUOTE_RE = /['"“‘「『]([^'"”’」』]+)['"”’」』]/

// 값 끝의 서술·조사를 떼어 낸다("가족으로 하자" → "가족").
const TAIL_VERB =
  /\s*(?:하자|해\s*줘요?|해\s*주세요|해\s*주시고|해요|해|할게요?|할래요?|합시다|하고|하며|하면서|하는데|정해\s*줘|정하자|정해|잡아\s*줘|잡자|잡아|바꿔\s*줘|바꿔|바꾸자|변경해\s*줘|변경|부탁해요?|부탁드려요|입니다|이에요|예요|이야|야|이고|이며|인데|이랑|이요|요)$/
const TAIL_PARTICLE = /\s*(?:으로|로)$/

function cleanValue(raw: string): string {
  const q = raw.match(QUOTE_RE)
  if (q && raw.trim().startsWith(q[0][0])) return q[1].trim()
  let v = raw.trim().replace(/[\s,.!?~…]+$/, '')
  for (let i = 0; i < 4; i++) {
    const next = v.replace(TAIL_VERB, '').replace(TAIL_PARTICLE, '').trim()
    if (next === v) break
    v = next
  }
  return v
}

function slotOf(label: string): SlotName {
  const n = label.replace(/\s/g, '')
  for (const [slot, ls] of SLOT_LABELS) if (ls.some((l) => l.replace(/\s/g, '') === n)) return slot
  return 'content'
}

interface LabelledSpan {
  slot: SlotName
  value: string
  start: number
  end: number
}

const LABEL_BEFORE_QUOTE = new RegExp(`(?:${LABEL_ALT})\\s*(?:은|는|을|를|:|：)\\s*$`)
const QUOTE_ALL = new RegExp(QUOTE_RE.source, 'g')

/** 꼬리표 바로 뒤가 아닌 따옴표 구간을 같은 길이의 공백으로 가리고, 그 안의 글을 따로 돌려준다. */
function maskFreeQuotes(text: string): { masked: string; quotes: string[] } {
  const quotes: string[] = []
  const masked = text.replace(QUOTE_ALL, (whole, inner: string, offset: number) => {
    if (LABEL_BEFORE_QUOTE.test(text.slice(0, offset))) return whole
    quotes.push(inner.trim())
    return ' '.repeat(whole.length)
  })
  return { masked, quotes }
}

/** 꼬리표 붙은 값을 모두 찾는다. 값은 다음 꼬리표 · 문장 끝 · (키워드·피해갈 내용이 아니면) 쉼표에서 끝난다. */
function labelledSpans(text: string): LabelledSpan[] {
  const marks: { slot: SlotName; labelStart: number; valueStart: number }[] = []
  LABEL_RE.lastIndex = 0
  for (let m = LABEL_RE.exec(text); m; m = LABEL_RE.exec(text)) {
    const labelStart = m.index + m[0].indexOf(m[1])
    marks.push({ slot: slotOf(m[1]), labelStart, valueStart: m.index + m[0].length })
  }
  const out: LabelledSpan[] = []
  marks.forEach((mk, i) => {
    const limit = i + 1 < marks.length ? marks[i + 1].labelStart : text.length
    let seg = text.slice(mk.valueStart, limit)
    const quoted = seg.match(QUOTE_RE)
    if (quoted && seg.trimStart().startsWith(quoted[0][0])) {
      seg = seg.slice(0, seg.indexOf(quoted[0]) + quoted[0].length)
    } else {
      const stop = mk.slot === 'keywords' || mk.slot === 'avoid' ? /[.!?](?=\s|$)|\n/ : /[,，.!?](?=\s|$)|,|\n/
      const cut = seg.search(stop)
      if (cut >= 0) seg = seg.slice(0, cut)
    }
    out.push({ slot: mk.slot, value: cleanValue(seg), start: mk.labelStart, end: mk.valueStart + seg.length })
  })
  return out
}

// ─────────────────────────────────────────────────────────────
// 해석 결과
// ─────────────────────────────────────────────────────────────

/** 설계 값 — undefined = 말하지 않음 · null = '없음'이라고 말함. */
export interface PlanSlots {
  title?: string
  goal?: string
  /** '대화 주제' — 관련 키워드로 들어가고, 제목이 없으면 '<주제> 이야기' 를 제안한다. */
  topic?: string
  minutes?: number
  plannedDate?: string
  content?: string | null
  /** 꼬리표로 정한 피해갈 내용(그 값으로 바꾼다). */
  avoid?: string | null
  /** "가족 갈등 얘기는 피하고" — 기존(기관 기본값 포함)에 더한다. */
  avoidAdd?: string[]
  keywords?: string[] | null
}

export interface ShareSlots {
  kind?: 'journal' | 'analysis'
  /** 가리키는 기록의 날짜(지난 날짜 방향으로 읽는다). */
  date?: string
  action?: 'publish' | 'revoke'
}

export interface ReplySlots {
  /** 문장에 이름이 나온 보호자(목록에서 찾은 것만). */
  guardians: ElderChoice[]
  /** 따옴표 안 또는 '…라고' 앞의 답장 본문. */
  body?: string
}

export interface CaregiverCommand {
  task: CaregiverTask | null
  /** 문장에 이름이 나온 어르신(0·1·여럿). */
  elders: ElderChoice[]
  /** "OOO 어르신" 이라 했는데 목록에 없는 이름. */
  unknownElder?: string
  plan: PlanSlots
  share: ShareSlots
  reply: ReplySlots
  /** 읽었지만 받을 수 없는 **설계** 값(범위·길이·지난 날짜) — 설계 중일 때 화면이 그대로 알린다. */
  problems: string[]
}

export interface CommandContext {
  elders: readonly ElderChoice[]
  /** 보호자 메시지 답장 대상 후보(이름이 문장에 나오면 고른다). */
  guardians?: readonly ElderChoice[]
  today: string
}

/**
 * 자유 입력 해석기의 모양. 지금은 규칙 기반 `parseCaregiverCommand` 하나다.
 * 나중에 LLM 보조를 붙일 때도 같은 결과를 돌려주게 해서(이름은 가린 채 보내고 결과에서 되돌린다)
 * 화면·확인 카드·검증은 그대로 쓴다.
 */
export type CommandInterpreter = (text: string, ctx: CommandContext) => CaregiverCommand | Promise<CaregiverCommand>

const TASK_WORDS: readonly [CaregiverTask, readonly string[]][] = [
  ['design', ['설계', '세션만들', '세션잡', '대화계획', '계획', '회상세션', '세션짜']],
  ['messages', ['답장', '메시지', '문의', '보호자연락']],
  ['share', ['공개', '비공개', '철회', '보호자에게보여']],
  ['todo', ['확인할일', '할일', '확인대기', '대기', '위기', '안전알림', '일지확인']],
]

function namesIn(text: string, list: readonly ElderChoice[]): ElderChoice[] {
  const n = normalizeAsk(text)
  const hits = list.filter((e) => {
    const k = normalizeAsk(e.name)
    return k.length > 0 && n.includes(k)
  })
  // '김영자' 와 '김영' 이 둘 다 맞으면 긴 이름만 남긴다.
  return hits.filter((e) => !hits.some((o) => o !== e && normalizeAsk(o.name).includes(normalizeAsk(e.name)) && o.name.length > e.name.length))
}

function dedupe(list: string[]): string[] {
  const out: string[] = []
  for (const k of list) if (k && !out.includes(k)) out.push(k)
  return out
}

function splitList(v: string): string[] {
  return dedupe(v.split(/[,，、/]|\s+(?:그리고|와|과|랑|하고)\s+/).map((k) => cleanValue(k).replace(/^#/, '')))
}

/** 규칙 기반 해석 — 문장 하나에서 업무와 값을 뽑는다. 모르는 부분은 비워 둔다(지어내지 않는다). */
export function parseCaregiverCommand(text: string, ctx: CommandContext): CaregiverCommand {
  const problems: string[] = []
  const plan: PlanSlots = {}
  // 꼬리표 바로 뒤가 아닌 따옴표(답장 본문 등)는 가린다 — 본문 속 '제목은'·'설계' 같은 낱말에 끌려가지 않게.
  const { masked, quotes } = maskFreeQuotes(text)
  const spans = labelledSpans(masked)

  // 꼬리표 값과 따옴표를 뺀 나머지에서 업무·날짜·분 등을 찾는다.
  let restNoQuote = masked
  for (const s of [...spans].sort((a, b) => b.start - a.start)) {
    restNoQuote = `${restNoQuote.slice(0, s.start)} ${restNoQuote.slice(s.end)}`
  }

  for (const s of spans) {
    const v = s.value
    switch (s.slot) {
      case 'title':
        if (!v) break
        if (v.length > PLAN_LIMITS.title) problems.push(`제목은 ${PLAN_LIMITS.title}자까지예요.`)
        else plan.title = v
        break
      case 'goal':
        if (!v) break
        if (v.length > PLAN_LIMITS.goal) problems.push(`목표는 ${PLAN_LIMITS.goal}자까지예요.`)
        else plan.goal = v
        break
      case 'topic':
        if (v && !isSkip(v)) plan.topic = v.replace(/\s*(?:이야기|얘기)$/, '') || v
        break
      case 'content':
        if (isSkip(v)) plan.content = null
        else if (v.length > PLAN_LIMITS.content) problems.push(`나눌 이야기는 ${PLAN_LIMITS.content}자까지예요.`)
        else if (v) plan.content = v
        break
      case 'avoid':
        if (isSkip(v) || /^없/.test(v)) plan.avoid = null
        else if (v.length > PLAN_LIMITS.avoid) problems.push(`피해갈 내용은 ${PLAN_LIMITS.avoid}자까지예요.`)
        else if (v) plan.avoid = v
        break
      case 'keywords':
        plan.keywords = isSkip(v) ? null : splitList(v)
        break
      case 'minutes': {
        const m = v.match(/(\d{1,2})/)
        if (!m) break
        const n = Number(m[1])
        if (n < PLAN_MIN_MINUTES || n > SESSION_MAX_MINUTES) problems.push(`목표 시간은 ${PLAN_MIN_MINUTES}~${SESSION_MAX_MINUTES}분이에요.`)
        else plan.minutes = n
        break
      }
      case 'date': {
        const iso = findDateMention(v, ctx.today, 'future')
        if (!iso) problems.push('날짜를 읽지 못했어요. \'내일\'·\'11월 5일\'·\'다음 주 월요일\'처럼 알려 주세요.')
        else plan.plannedDate = iso
        break
      }
    }
  }

  // 꼬리표 없는 표현.
  if (plan.minutes === undefined) {
    const m = restNoQuote.match(/(\d{1,2})\s*분/)
    if (m) {
      const n = Number(m[1])
      if (n < PLAN_MIN_MINUTES || n > SESSION_MAX_MINUTES) problems.push(`목표 시간은 ${PLAN_MIN_MINUTES}~${SESSION_MAX_MINUTES}분이에요.`)
      else plan.minutes = n
    }
  }
  // "가족 갈등 얘기는 피하고" · "병원 이야기는 빼 줘" — 앞 구절의 낱말을 피해갈 내용에 더한다.
  const avoidRe = /([^,.!?\n]+?)\s*(?:이야기|얘기|내용|주제|은|는|이|가)*\s*(?:은|는|을|를)?\s*(?:피하|피해|빼|제외|하지\s*말)/g
  const avoidAdd: string[] = []
  for (let m = avoidRe.exec(restNoQuote); m; m = avoidRe.exec(restNoQuote)) {
    // 구절 안의 마지막 의미 덩어리만(앞의 어르신 이름·업무 말은 뺀다).
    const words = m[1].trim().split(/\s+/).filter(
      (w) => !/어르신|세션|설계|대화|하는데|하고$|해서$/.test(w) && !ctx.elders.some((e) => normalizeAsk(w).startsWith(normalizeAsk(e.name))),
    )
    const phrase = words.slice(-3).join(' ').replace(/(?:이야기|얘기|내용|주제)$/, '').replace(/(?:은|는|을|를|이|가)$/, '').trim()
    if (phrase) avoidAdd.push(phrase)
  }
  if (avoidAdd.length) plan.avoidAdd = dedupe(avoidAdd)
  // "고향 이야기로 설계" — 꼬리표 없는 주제(피해갈 구절과 겹치지 않을 때만).
  if (plan.topic === undefined) {
    const m = restNoQuote.match(/([가-힣A-Za-z0-9]+)\s*(?:이야기|얘기)\s*(?:로|으로|를|을)(?=[\s,.!?]|$)/)
    if (m && !avoidAdd.some((a) => a.includes(m[1]))) plan.topic = m[1]
  }

  // 날짜 — 설계는 앞으로, 공개는 지난 기록 방향.
  const dateFuture = findDateMention(restNoQuote, ctx.today, 'future')
  if (plan.plannedDate === undefined && dateFuture) {
    if (dateFuture < ctx.today) problems.push('지난 날짜에는 설계할 수 없어요.')
    else plan.plannedDate = dateFuture
  }

  // 업무.
  const n = normalizeAsk(restNoQuote)
  let task: CaregiverTask | null = null
  for (const [t, words] of TASK_WORDS) {
    if (words.some((w) => n.includes(normalizeAsk(w)))) { task = t; break }
  }
  const hasPlan = spans.some((s) => s.slot !== 'date') || plan.topic !== undefined
  if (!task && hasPlan) task = 'design'

  // 어르신.
  const elders = namesIn(text, ctx.elders)
  let unknownElder: string | undefined
  if (!elders.length) {
    const m = text.match(/([가-힣]{2,4})\s*어르신/)
    if (m) unknownElder = m[1]
  }

  // 공개 관리.
  const share: ShareSlots = {}
  if (/일지/.test(restNoQuote)) share.kind = 'journal'
  else if (/대화|요약|분석|회상/.test(restNoQuote)) share.kind = 'analysis'
  if (/비공개|철회|내려|내리|숨기|숨겨|공개\s*취소|공개\s*해제/.test(restNoQuote)) share.action = 'revoke'
  else if (/공개/.test(restNoQuote)) share.action = 'publish'
  const datePast = findDateMention(restNoQuote, ctx.today, 'past')
  if (datePast) share.date = datePast

  // 답장.
  const guardians = namesIn(restNoQuote, ctx.guardians ?? []).filter((g) => !elders.some((e) => e.name === g.name))
  let body: string | undefined = quotes[0]
  if (!body) {
    const m = restNoQuote.match(/(?:에게|한테|께)\s+(.+?)\s*(?:이?라고|고)\s*(?:답장|보내|전해|답)/)
    if (m) body = m[1].trim()
  }

  return {
    task,
    elders,
    unknownElder,
    plan,
    share,
    reply: { guardians, body: body || undefined },
    problems: dedupe(problems),
  }
}

/** 설계에 쓸 값이 하나라도 있나(어르신 이름 포함). 진행 중 단계의 '답'과 '고치는 말'을 가른다. */
export function hasPlanSlots(cmd: CaregiverCommand): boolean {
  const p = cmd.plan
  return (
    p.title !== undefined || p.goal !== undefined || p.topic !== undefined || p.minutes !== undefined ||
    p.plannedDate !== undefined || p.content !== undefined || p.avoid !== undefined || p.avoidAdd !== undefined ||
    p.keywords !== undefined || cmd.elders.length === 1
  )
}

/** 꼬리표로 정한 값이 있나 — 단계 질문에 답하는 중에는 이것이 있어야 '고치는 말'로 읽는다. */
export function hasLabelledPlanSlots(text: string): boolean {
  return labelledSpans(text).length > 0
}

export interface MergeContext {
  today: string
  /** 기관 설정 목표 시간(분). 없으면 10. */
  orgTarget?: number | null
  defaultAvoid: readonly string[]
}

export interface MergeResult {
  draft: PlanDraft
  /** 사람에게 알릴 말 — 제안한 제목·기본값으로 채운 항목. */
  notes: string[]
}

/** 모달과 같은 새 세션 기본값(목표 시간 = 기관 설정 5~10 · 기록일 = 오늘 · 피해갈 내용 = 기관 기본값). */
export function planDefaults(ctx: MergeContext): Required<Pick<PlanDraft, 'minutes' | 'plannedDate' | 'content' | 'avoid' | 'keywords'>> {
  return {
    minutes: Math.min(SESSION_MAX_MINUTES, Math.max(PLAN_MIN_MINUTES, ctx.orgTarget ?? SESSION_MAX_MINUTES)),
    plannedDate: ctx.today,
    content: null,
    avoid: ctx.defaultAvoid.join(', ').slice(0, PLAN_LIMITS.avoid) || null,
    keywords: [],
  }
}

/**
 * 해석한 값을 설계 초안에 합친다.
 * fill = true(자유 입력으로 시작) → 말하지 않은 선택 항목을 모달 기본값으로 채운다 — 다시 묻는 것은 어르신·제목·목표뿐.
 * 주제는 키워드에 넣고, 제목이 비어 있으면 '<주제> 이야기' 를 제안한다.
 */
export function mergePlan(base: PlanDraft, cmd: CaregiverCommand, ctx: MergeContext, fill: boolean): MergeResult {
  const p = cmd.plan
  const d: PlanDraft = { ...base }
  const notes: string[] = []
  if (cmd.elders.length === 1) d.elder = cmd.elders[0]
  if (p.title !== undefined) d.title = p.title
  if (p.goal !== undefined) d.goal = p.goal
  if (p.minutes !== undefined) d.minutes = p.minutes
  if (p.plannedDate !== undefined) d.plannedDate = p.plannedDate
  if (p.content !== undefined) d.content = p.content
  if (p.keywords !== undefined) d.keywords = p.keywords ?? []

  const filled: string[] = []
  if (fill) {
    const def = planDefaults(ctx)
    if (d.minutes === undefined) { d.minutes = def.minutes; filled.push(`목표 시간 ${def.minutes}분`) }
    if (d.plannedDate === undefined) { d.plannedDate = def.plannedDate; filled.push('기록일 오늘') }
    if (d.content === undefined) d.content = def.content
    if (d.avoid === undefined && p.avoid === undefined) {
      d.avoid = def.avoid
      if (def.avoid) filled.push('피해갈 내용 기관 기본값')
    }
    if (d.keywords === undefined) d.keywords = def.keywords
  }
  if (p.avoid !== undefined) d.avoid = p.avoid
  if (p.avoidAdd?.length) {
    const cur = d.avoid ? d.avoid.split(/\s*,\s*/) : []
    d.avoid = dedupe([...cur, ...p.avoidAdd]).join(', ').slice(0, PLAN_LIMITS.avoid) || null
  }
  if (p.topic) {
    const kw = dedupe([...(d.keywords ?? []), p.topic]).slice(0, PLAN_LIMITS.keywords)
    d.keywords = kw
    if (d.title === undefined) {
      const suggestion = `${p.topic} 이야기`.slice(0, PLAN_LIMITS.title)
      d.title = suggestion
      notes.push(`제목은 '${suggestion}'(으)로 제안했어요. 바꾸려면 '제목은 …'이라고 말씀해 주세요.`)
    }
  }
  if (filled.length) notes.push(`말씀하지 않은 ${filled.join(' · ')}은(는) 설계 화면과 같은 기본값으로 채웠어요.`)
  return { draft: d, notes }
}
