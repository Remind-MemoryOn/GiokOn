// @giokon/core — 운영자에게 보내는 요청(계정 삭제 요청 · AI 응답 신고)의 제목·본문 규칙
//
// 두 요청 모두 **기존 비공개 문의(`inquiries`, visibility='private')** 로 접수한다(2026-11-27 Play 출시 준비).
//   · 비공개 문의는 작성자와 사이트 운영자만 읽는다(RLS) — 운영자가 답변으로 처리 결과를 알린다.
//   · 새 테이블을 만들지 않은 이유: 접수·열람 통제·답변이 이미 운영 중인 경로라 DB 변경 없이 바로 쓸 수 있다.
// 제목 머리말이 요청 종류의 식별자다 — 운영자는 문의 목록에서 머리말로 걸러 본다. 바꾸면 운영 절차
// (`docs/runbooks/account-deletion-and-ai-reports.md`)도 같이 바꾼다.
//
// 문의 본문 제약(DB check): 제목 2~100자 · 본문 2~5000자. 아래 상한은 그보다 작게 잡는다.

export const ACCOUNT_DELETION_TITLE = '[계정 삭제 요청]'
export const AI_REPORT_TITLE_PREFIX = '[AI 응답 신고]'

/** 신고 본문에 옮기는 AI 발화 상한 — 한 턴 발화는 이보다 훨씬 짧다. */
export const AI_REPORT_TEXT_MAX = 2000
/** 사용자가 적는 메모·사유 상한. */
export const SUPPORT_NOTE_MAX = 500

export type SupportSource = 'app' | 'web'

/**
 * 계정 삭제 시 데이터 처리 기준 — 앱 요청 화면과 웹 `/account-deletion` 이 같은 문구를 보인다.
 * 근거: 스키마의 외래키 규칙(계정 행 삭제 시 개인 행은 함께 삭제 · 기관 기록은 `set null`)과
 * `docs/compliance.md` §5.2 · 이용약관 제23조. 규칙이 바뀌면 이 표와 운영 절차를 함께 고친다.
 */
export const ACCOUNT_DELETION_DATA_RULES: ReadonlyArray<{ action: string; items: string; note: string }> = [
  {
    action: '삭제',
    items: '계정 정보(이름·이메일·로그인 연결), 알림 수신 정보, 보호자 연결, 내가 쓴 문의',
    note: '처리 완료 시 지체 없이 삭제합니다.',
  },
  {
    action: '기관에 남음',
    items: '어르신 프로필·연대기·대화 기록·프로그램 일지',
    note: '기관에 귀속된 돌봄 기록이라 기관이 계속 관리합니다(작성자 표시는 지워집니다).',
  },
  {
    action: '분리 보관',
    items: '동의 이력, 접속·처리 기록',
    note: '증빙과 법령상 의무를 위해 계정과의 연결을 끊고 정해진 기간(접속 기록 최소 2년) 보관 후 파기합니다.',
  },
]

export type AiReportReason = 'harmful' | 'inaccurate' | 'unsafe_advice' | 'privacy' | 'other'

/** 신고 사유 — 화면의 선택지와 본문에 같은 문구를 쓴다. */
export const AI_REPORT_REASONS: ReadonlyArray<{ id: AiReportReason; label: string }> = [
  { id: 'harmful', label: '불쾌하거나 부적절한 표현' },
  { id: 'inaccurate', label: '사실과 다르거나 엉뚱한 내용' },
  { id: 'unsafe_advice', label: '건강·약·안전에 관한 위험한 조언' },
  { id: 'privacy', label: '개인정보를 말하거나 물어봄' },
  { id: 'other', label: '기타' },
]

export interface SupportInquiry {
  title: string
  content: string
}

function clip(value: string, max: number): string {
  const v = value.trim()
  return v.length > max ? `${v.slice(0, max)}…(이하 생략)` : v
}

function line(label: string, value: string | null | undefined): string {
  const v = value?.trim()
  return `${label}: ${v ? v : '—'}`
}

export interface AccountDeletionRequestInput {
  /** 로그인 이메일(운영자가 회신·본인 확인에 쓴다). */
  email: string | null
  role: string | null
  orgName: string | null
  source: SupportSource
  appVersion?: string | null
  /** 선택 — 사용자가 남긴 말. */
  note?: string | null
}

export function buildAccountDeletionInquiry(input: AccountDeletionRequestInput): SupportInquiry {
  const note = input.note?.trim() ? clip(input.note, SUPPORT_NOTE_MAX) : null
  const content = [
    '계정 삭제를 요청합니다.',
    '',
    line('계정(이메일)', input.email),
    line('역할', input.role),
    line('기관', input.orgName),
    line('요청 경로', input.source === 'app' ? `앱${input.appVersion ? ` v${input.appVersion}` : ''}` : '웹'),
    ...(note ? ['', `남기신 말: ${note}`] : []),
    '',
    '※ 처리 기준: 계정 식별정보는 삭제하고, 기관에 귀속된 어르신 기록은 기관에 남으며,',
    '   동의 이력·접속 기록 등 법령상 보존 대상은 정해진 기간 동안 분리 보관 후 파기합니다.',
  ].join('\n')
  return { title: ACCOUNT_DELETION_TITLE, content }
}

export interface AiReportInput {
  reason: AiReportReason
  /** 신고한 AI 발화 원문(화면에 보인 그대로). */
  aiText: string
  sessionId: string | null
  /** 저장된 대화 턴 id(대화 기록에서 신고) — 진행 중 화면에서 신고하면 없다. */
  turnId?: string | null
  /** 발화 시각(ISO) — 있으면 남긴다. */
  spokenAt?: string | null
  source: SupportSource
  appVersion?: string | null
  note?: string | null
}

export function aiReportReasonLabel(reason: AiReportReason): string {
  return AI_REPORT_REASONS.find((r) => r.id === reason)?.label ?? '기타'
}

export function buildAiReportInquiry(input: AiReportInput): SupportInquiry {
  const text = input.aiText.trim()
  if (!text) throw new Error('신고할 AI 응답이 없어요.')
  const label = aiReportReasonLabel(input.reason)
  const note = input.note?.trim() ? clip(input.note, SUPPORT_NOTE_MAX) : null
  const content = [
    `사유: ${label}`,
    line('세션', input.sessionId),
    line('대화 턴', input.turnId ?? null),
    line('발화 시각', input.spokenAt ?? null),
    line('신고 경로', input.source === 'app' ? `앱${input.appVersion ? ` v${input.appVersion}` : ''}` : '웹'),
    '',
    'AI 응답:',
    clip(text, AI_REPORT_TEXT_MAX),
    ...(note ? ['', `메모: ${note}`] : []),
  ].join('\n')
  return { title: `${AI_REPORT_TITLE_PREFIX} ${label}`, content }
}
