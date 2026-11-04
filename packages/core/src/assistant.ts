// @giokon/core — 웹 플로팅 대화창의 규칙 기반 도우미(2026-11-04 사용자 결정: LLM 아님)
//
// 보호자: 자주 묻는 질문에 정해진 답을 한다. 답할 수 없으면 담당 요양보호사에게 문의하도록 넘긴다.
// 요양보호사: 업무(세션 설계·공개 관리·보호자 메시지·확인할 일)를 고르면 필요한 값을 차례로 묻고
//   **확인 카드**를 만든다. 실행은 사람이 '확인'을 누른 뒤 화면이 기존 서버 경로로 한다 —
//   여기서는 아무것도 저장하지 않는다(AI 산출물이 사람 확인 없이 기록·공개되지 않는다는 원칙).
//
// 모두 결정론적 순수 함수다(모델 호출·네트워크 없음). 문구는 비의료 카피 규칙을 따른다.

import { SESSION_MAX_MINUTES } from './session-phase'

// ─────────────────────────────────────────────────────────────
// 공통 — 입력 정규화
// ─────────────────────────────────────────────────────────────

/** 비교용: 공백·문장부호 제거 + 소문자. */
export function normalizeAsk(text: string): string {
  return text.toLowerCase().replace(/[\s.,!?~…·'"“”‘’()\-—:;/]/g, '')
}

// 정확히 그 말일 때만 — '취소된 여행 이야기'·'없어진 고향집' 같은 답을 취소·건너뛰기로 읽지 않는다.
const CANCEL_WORDS = ['취소', '그만', '중단', '처음으로', '안할래', '취소할래', '그만할래']
const SKIP_WORDS = ['건너뛰기', '건너뛸래', '없음', '없어요', '없어', '패스', '넘어가기']

export function isCancel(text: string): boolean {
  const n = normalizeAsk(text)
  return CANCEL_WORDS.some((w) => n === normalizeAsk(w))
}

export function isSkip(text: string): boolean {
  const n = normalizeAsk(text)
  return SKIP_WORDS.some((w) => n === normalizeAsk(w))
}

// ─────────────────────────────────────────────────────────────
// 보호자 — 자주 묻는 질문
// ─────────────────────────────────────────────────────────────

export interface AssistantLink {
  label: string
  to: string
}

/**
 * 답 뒤에 이어 보여 줄 버튼(질문마다 다르다 — 2026-11-04 사용자 요청).
 * latest_feed = 가장 최근 공개된 소식 열기 · latest_analysis = 가장 최근 대화 분석 열기 ·
 * handoff = 담당 요양보호사에게 문의 · more = 질문 목록으로 돌아가 다른 질문 고르기.
 */
export type GuardianFollowUp = 'latest_feed' | 'latest_analysis' | 'handoff' | 'more'

export const GUARDIAN_FOLLOW_UP_LABEL: Record<GuardianFollowUp, string> = {
  latest_feed: '최근 공개된 소식 보기',
  latest_analysis: '최근 대화 분석 보기',
  handoff: '요양보호사에게 문의하기',
  more: '다른 질문 보기',
}

export interface GuardianFaq {
  id: string
  /** 빠른 질문 칩에 쓰는 대표 질문. */
  question: string
  /** 정규화한 입력에 하나라도 들어 있으면 이 답을 고른다(앞에 있는 항목이 우선). */
  keywords: readonly string[]
  answer: string
  link?: AssistantLink
  /** 답 뒤의 버튼. 'more'(다른 질문 보기)는 항상 끝에 둔다. */
  followUps: readonly GuardianFollowUp[]
}

export const GUARDIAN_GREETING = '안녕하세요!\nGIEOK-ON AI입니다.\n요양 업무에 필요한 정보나\n기능에 대해 무엇이든\n물어보세요.'

export const GUARDIAN_FAQ: readonly GuardianFaq[] = [
  {
    id: 'record',
    question: '기록은 어떻게 작성하나요?',
    keywords: ['기록', '작성', '일지', '쓰나', '써요'],
    answer:
      '어르신의 프로그램 일지와 대화 기록은 담당 요양보호사가 작성하고 확인해요.\n' +
      '보호자님은 요양보호사가 확인·공개한 내용을 \'공개된 소식\'에서 보실 수 있어요.',
    link: { label: '공개된 소식 보기', to: '/guardian/feed' },
    followUps: ['latest_feed', 'more'],
  },
  {
    id: 'not_visible',
    question: '소식이 보이지 않아요.',
    keywords: ['안보', '보이지', '없어요', '안나와', '안떠', '비어'],
    answer:
      '요양보호사가 확인하고 공개한 항목만 보여요. 아직 공개 전이면 목록에 나타나지 않아요.\n' +
      '어르신 연결이 승인됐는지도 \'어르신 연결\'에서 확인해 주세요.',
    link: { label: '어르신 연결 확인', to: '/guardian' },
    followUps: ['latest_feed', 'handoff', 'more'],
  },
  {
    id: 'link',
    question: '어르신은 어떻게 연결하나요?',
    keywords: ['연결', '코드', '등록', '추가'],
    answer:
      '\'어르신 연결\'에서 기관에서 받은 어르신 코드를 입력해 주세요.\n' +
      '담당 요양보호사가 승인하면 공개된 소식을 볼 수 있어요.',
    link: { label: '어르신 연결로 가기', to: '/guardian' },
    followUps: ['more'],
  },
  {
    id: 'analysis',
    question: '분석은 무엇을 보여 주나요?',
    keywords: ['분석', '리포트', '그래프', '요약'],
    answer:
      '공개된 대화 기록을 정리한 요약이에요. 어르신의 상태를 판정하거나 점수를 매기지 않아요.',
    link: { label: '분석 보기', to: '/guardian/analysis' },
    followUps: ['latest_analysis', 'more'],
  },
  {
    id: 'ai_talk',
    question: 'AI 회상 대화는 어떻게 진행되나요?',
    keywords: ['ai', '회상', '대화', '인공지능', '앱'],
    answer:
      '기억온 앱에서 AI가 어르신과 옛 추억을 나누는 대화를 진행하고, 요양보호사가 곁에서 함께 지켜봐요.\n' +
      '한 번의 대화는 최대 10분이에요.',
    followUps: ['latest_analysis', 'more'],
  },
  {
    id: 'notice',
    question: '답장은 어떻게 알 수 있나요?',
    keywords: ['답장', '알림', '알려', '연락'],
    answer: '요양보호사가 답장하면 위쪽 종 모양 알림과 이 대화창에서 확인하실 수 있어요.',
    followUps: ['handoff', 'more'],
  },
  {
    id: 'privacy',
    question: '개인정보는 어떻게 관리되나요?',
    keywords: ['개인정보', '정보보호', '보안', '삭제', '탈퇴'],
    answer: '개인정보 처리 방법은 개인정보 처리방침에서 확인하실 수 있어요. 계정 설정은 \'설정\'에서 바꿀 수 있어요.',
    link: { label: '개인정보 처리방침', to: '/privacy' },
    followUps: ['more'],
  },
]

/** 요양보호사에게 직접 문의로 넘어가는 말. */
const HANDOFF_WORDS = ['요양보호사', '선생님', '문의', '직접', '사람', '상담', '물어보고싶', '메시지']

export type GuardianAnswer =
  | { kind: 'faq'; faq: GuardianFaq }
  | { kind: 'handoff' }
  | { kind: 'unknown' }

/** '최근 대화 분석 보기' 의 대상 — 끝난 대화 중 끝난(없으면 시작) 시각이 가장 늦은 것. 없으면 null. */
export function latestEndedSession<T extends { status: string; ended_at: string | null; started_at: string | null }>(
  rows: readonly T[],
): T | null {
  const at = (x: T) => x.ended_at ?? x.started_at ?? ''
  let best: T | null = null
  for (const x of rows) if (x.status === 'ended' && (!best || at(x) > at(best))) best = x
  return best
}

/** 모르는 질문 뒤의 버튼. */
export const GUARDIAN_UNKNOWN_FOLLOW_UPS: readonly GuardianFollowUp[] = ['handoff', 'more']
/** '다른 질문 보기' 를 눌렀을 때 보이는 말. */
export const GUARDIAN_MORE = '다른 궁금한 점을 골라 주세요.'

export const GUARDIAN_UNKNOWN =
  '제가 답하기 어려운 질문이에요.\n담당 요양보호사에게 직접 물어보시겠어요?'
export const GUARDIAN_HANDOFF = '담당 요양보호사에게 메시지를 보낼게요. 아래에 내용을 적어 주세요.'

/** 보호자 질문 → 정해진 답 · 요양보호사 문의 · 모름. 질문 주제(FAQ)가 문의 표현보다 먼저다. */
export function answerGuardian(text: string): GuardianAnswer {
  const n = normalizeAsk(text)
  if (!n) return { kind: 'unknown' }
  for (const faq of GUARDIAN_FAQ) {
    if (faq.keywords.some((k) => n.includes(normalizeAsk(k)))) return { kind: 'faq', faq }
  }
  if (HANDOFF_WORDS.some((w) => n.includes(normalizeAsk(w)))) return { kind: 'handoff' }
  return { kind: 'unknown' }
}

// ─────────────────────────────────────────────────────────────
// 요양보호사 — 업무 고르기
// ─────────────────────────────────────────────────────────────

export type CaregiverTask = 'design' | 'share' | 'messages' | 'todo'

export const CAREGIVER_GREETING =
  '안녕하세요!\nGIEOK-ON AI입니다.\n대화로 업무를 도와드릴게요.\n무엇을 할까요?'

export const CAREGIVER_TASKS: readonly { task: CaregiverTask; label: string }[] = [
  { task: 'design', label: '대화 세션 설계' },
  { task: 'share', label: '공개 관리' },
  { task: 'messages', label: '보호자 메시지' },
  { task: 'todo', label: '확인할 일' },
]

const TASK_WORDS: readonly [CaregiverTask, readonly string[]][] = [
  ['design', ['설계', '세션만들', '세션잡', '대화계획', '계획', '회상세션']],
  ['share', ['공개', '비공개', '철회', '보호자에게보여']],
  ['messages', ['메시지', '문의', '답장', '보호자연락']],
  ['todo', ['확인할일', '할일', '확인대기', '대기', '위기', '안전알림', '일지확인']],
]

export function detectCaregiverTask(text: string): CaregiverTask | null {
  const n = normalizeAsk(text)
  if (!n) return null
  for (const [task, words] of TASK_WORDS) {
    if (words.some((w) => n.includes(normalizeAsk(w)))) return task
  }
  return null
}

export interface ElderChoice {
  id: string
  name: string
}

/** 이름(부분 일치·'어르신' 생략 허용)으로 어르신을 고른다. 하나로 정해지지 않으면 후보 전체. */
export function matchElder(text: string, elders: readonly ElderChoice[]): ElderChoice[] {
  const n = normalizeAsk(text).replace(/어르신$/, '').replace(/님$/, '')
  if (!n) return []
  const exact = elders.filter((e) => normalizeAsk(e.name) === n)
  if (exact.length) return exact
  return elders.filter((e) => normalizeAsk(e.name).includes(n) || n.includes(normalizeAsk(e.name)))
}

// ─────────────────────────────────────────────────────────────
// 요양보호사 — 세션 설계(웹 '회상 세션 설계' 모달과 같은 값·같은 제한)
// ─────────────────────────────────────────────────────────────

export const PLAN_LIMITS = { title: 50, goal: 200, content: 500, avoid: 500, keywords: 10 } as const
export const PLAN_MIN_MINUTES = 5

export interface PlanDraft {
  elder?: ElderChoice
  title?: string
  goal?: string
  minutes?: number
  plannedDate?: string
  /** null = 비워 둠(건너뜀). undefined = 아직 묻지 않음. */
  content?: string | null
  avoid?: string | null
  keywords?: string[]
}

export type PlanStep = 'elder' | 'title' | 'goal' | 'minutes' | 'date' | 'content' | 'avoid' | 'keywords' | 'confirm'

export const PLAN_STEPS: readonly PlanStep[] = ['elder', 'title', 'goal', 'minutes', 'date', 'content', 'avoid', 'keywords', 'confirm']

/** 아직 채우지 않은 첫 단계. */
export function nextPlanStep(d: PlanDraft): PlanStep {
  if (!d.elder) return 'elder'
  if (d.title === undefined) return 'title'
  if (d.goal === undefined) return 'goal'
  if (d.minutes === undefined) return 'minutes'
  if (d.plannedDate === undefined) return 'date'
  if (d.content === undefined) return 'content'
  if (d.avoid === undefined) return 'avoid'
  if (d.keywords === undefined) return 'keywords'
  return 'confirm'
}

export function planQuestion(step: PlanStep, d: PlanDraft, ctx: { defaultAvoid: readonly string[] }): string {
  switch (step) {
    case 'elder': return '어느 어르신의 세션을 설계할까요? 성함을 말씀해 주세요.'
    case 'title': return `${d.elder?.name ?? ''} 어르신 세션의 제목을 알려 주세요. (${PLAN_LIMITS.title}자 이내)`
    case 'goal': return `이번 대화의 목표는 무엇인가요? (${PLAN_LIMITS.goal}자 이내)`
    case 'minutes': return `목표 시간은 몇 분으로 할까요? (${PLAN_MIN_MINUTES}~${SESSION_MAX_MINUTES}분)`
    case 'date': return '언제 진행할까요? \'오늘\'·\'내일\' 또는 날짜(예: 11월 5일)로 알려 주세요.'
    case 'content': return '나눌 이야기에 대한 지침이 있으면 알려 주세요. 없으면 \'건너뛰기\'를 눌러 주세요.'
    case 'avoid':
      return ctx.defaultAvoid.length
        ? `피해갈 내용이 있나요? 기관 기본값은 '${ctx.defaultAvoid.join(', ')}'이에요. 그대로 쓰려면 '기본값 사용'을 눌러 주세요.`
        : '피해갈 내용이 있으면 알려 주세요. 없으면 \'건너뛰기\'를 눌러 주세요.'
    case 'keywords': return '관련 키워드를 쉼표로 나눠 알려 주세요. 없으면 \'건너뛰기\'를 눌러 주세요.'
    case 'confirm': return '아래 내용으로 세션을 설계할까요? 확인을 누르면 저장해요.'
  }
}

/** 'M월 D일' · 'YYYY-MM-DD' · 'YYYY.MM.DD' · '오늘'·'내일'·'모레'. 한국 날짜 기준 today(YYYY-MM-DD). */
export function parsePlanDate(text: string, today: string): string | null {
  const t = text.replace(/\s/g, '')
  const base = new Date(`${today}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return null
  const plus = (days: number) => new Date(base.getTime() + days * 86_400_000).toISOString().slice(0, 10)
  if (/^오늘/.test(t)) return today
  if (/^내일/.test(t)) return plus(1)
  if (/^모레/.test(t)) return plus(2)
  let y = base.getUTCFullYear()
  let m: number
  let d: number
  const full = t.match(/^(\d{4})[-./년](\d{1,2})[-./월](\d{1,2})일?$/)
  const short = t.match(/^(\d{1,2})[월./-](\d{1,2})일?$/)
  if (full) { y = Number(full[1]); m = Number(full[2]); d = Number(full[3]) }
  else if (short) { m = Number(short[1]); d = Number(short[2]) }
  else return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  const iso = date.toISOString().slice(0, 10)
  // 연도 없이 지난 날짜를 말하면 내년으로 본다(설계는 앞으로 할 대화다).
  if (short && iso < today) return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10)
  return iso
}

/** '7분'·'7'·'칠 분'(숫자만 지원) → 5~10. 범위를 벗어나거나 읽지 못하면 null. */
export function parseTargetMinutes(text: string): number | null {
  const m = text.match(/(\d{1,2})/)
  if (!m) return null
  const n = Number(m[1])
  return n >= PLAN_MIN_MINUTES && n <= SESSION_MAX_MINUTES ? n : null
}

export function parseKeywords(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/[,，、\n]/)) {
    const k = raw.trim().replace(/^#/, '')
    if (k && !out.includes(k)) out.push(k)
  }
  return out.slice(0, PLAN_LIMITS.keywords)
}

export type PlanAnswer =
  | { ok: true; draft: PlanDraft }
  | { ok: false; reason: string }

/**
 * 현재 단계의 답을 반영한다. 웹 모달과 같은 제한(제목·목표 필수, 길이, 5~10분)을 지킨다.
 * 어르신 단계는 후보가 하나일 때만 정한다(여럿이면 화면이 칩으로 고르게 한다).
 */
export function applyPlanAnswer(
  d: PlanDraft,
  text: string,
  ctx: { elders: readonly ElderChoice[]; today: string; defaultAvoid: readonly string[] },
): PlanAnswer {
  const step = nextPlanStep(d)
  const v = text.trim()
  switch (step) {
    case 'elder': {
      const hits = matchElder(v, ctx.elders)
      if (hits.length === 1) return { ok: true, draft: { ...d, elder: hits[0] } }
      if (hits.length > 1) return { ok: false, reason: '같은 이름이 여러 분이에요. 아래에서 골라 주세요.' }
      return { ok: false, reason: '그 성함의 어르신을 찾지 못했어요. 아래에서 골라 주세요.' }
    }
    case 'title':
      if (!v) return { ok: false, reason: '세션 제목을 입력해 주세요.' }
      if (v.length > PLAN_LIMITS.title) return { ok: false, reason: `제목은 ${PLAN_LIMITS.title}자까지예요.` }
      return { ok: true, draft: { ...d, title: v } }
    case 'goal':
      if (!v) return { ok: false, reason: '목표를 입력해 주세요.' }
      if (v.length > PLAN_LIMITS.goal) return { ok: false, reason: `목표는 ${PLAN_LIMITS.goal}자까지예요.` }
      return { ok: true, draft: { ...d, goal: v } }
    case 'minutes': {
      const n = parseTargetMinutes(v)
      if (n === null) return { ok: false, reason: `${PLAN_MIN_MINUTES}분에서 ${SESSION_MAX_MINUTES}분 사이로 알려 주세요.` }
      return { ok: true, draft: { ...d, minutes: n } }
    }
    case 'date': {
      const iso = parsePlanDate(v, ctx.today)
      if (!iso) return { ok: false, reason: '날짜를 읽지 못했어요. \'오늘\'·\'내일\' 또는 \'11월 5일\'처럼 알려 주세요.' }
      if (iso < ctx.today) return { ok: false, reason: '지난 날짜에는 설계할 수 없어요.' }
      return { ok: true, draft: { ...d, plannedDate: iso } }
    }
    case 'content':
      if (isSkip(v)) return { ok: true, draft: { ...d, content: null } }
      if (v.length > PLAN_LIMITS.content) return { ok: false, reason: `내용은 ${PLAN_LIMITS.content}자까지예요.` }
      return { ok: true, draft: { ...d, content: v || null } }
    case 'avoid': {
      if (normalizeAsk(v) === normalizeAsk('기본값 사용')) {
        const def = ctx.defaultAvoid.join(', ').slice(0, PLAN_LIMITS.avoid)
        return { ok: true, draft: { ...d, avoid: def || null } }
      }
      if (isSkip(v)) return { ok: true, draft: { ...d, avoid: null } }
      if (v.length > PLAN_LIMITS.avoid) return { ok: false, reason: `피해갈 내용은 ${PLAN_LIMITS.avoid}자까지예요.` }
      return { ok: true, draft: { ...d, avoid: v || null } }
    }
    case 'keywords':
      return { ok: true, draft: { ...d, keywords: isSkip(v) ? [] : parseKeywords(v) } }
    case 'confirm':
      return { ok: false, reason: '확인 또는 취소를 눌러 주세요.' }
  }
}

/** 확인 카드에 보일 줄. 비운 항목은 '없음'으로 보인다(값을 지어내지 않는다). */
export function planSummary(d: PlanDraft): [label: string, value: string][] {
  return [
    ['어르신', d.elder ? `${d.elder.name} 어르신` : '—'],
    ['세션 제목', d.title ?? '—'],
    ['목표', d.goal ?? '—'],
    ['목표 시간', d.minutes ? `${d.minutes}분` : '—'],
    ['기록일', d.plannedDate ?? '—'],
    ['나눌 이야기', d.content || '없음'],
    ['피해갈 내용', d.avoid || '없음'],
    ['관련 키워드', d.keywords?.length ? d.keywords.join(', ') : '없음'],
  ]
}

/** 저장 값 — 웹 모달의 `patch` 와 같은 모양(status 'planned' 는 화면이 붙인다). */
export function planPatch(d: PlanDraft): {
  title: string
  goal: string
  duration_minutes: number
  planned_date: string
  content: string | null
  avoid_topics: string | null
  keywords: string[]
} | null {
  if (!d.elder || !d.title || !d.goal || !d.minutes || !d.plannedDate) return null
  return {
    title: d.title,
    goal: d.goal,
    duration_minutes: d.minutes,
    planned_date: d.plannedDate,
    content: d.content ?? null,
    avoid_topics: d.avoid ?? null,
    keywords: d.keywords ?? [],
  }
}
