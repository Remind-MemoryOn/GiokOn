// @giokon/core — 동의(consent) 도메인 카탈로그 (M9.1 / M9.3)
//
// 어떤 동의를 언제 받아야 하는지의 **단일 기준(SoT)**. DB `consent_type` enum과
// 문자열이 1:1로 대응한다(@giokon/data database.types의 미러). 화면·수집 로직·
// 검증이 모두 이 카탈로그를 소비한다 → 필수/민감/국외이전 판정이 일관된다.
//
// 주체 구분:
//   - account : 요양보호사(서비스 계정) 본인 개인정보
//   - elder   : 어르신(정보주체) — 건강·음성 민감정보, 국외이전, AI 이용
//
// ⚠️ 동의서 본문·법적 문구는 외부 법무 자문 산출물. 여기서는 무엇을·언제·필수인지의
//    구조와 버전만 관리한다.

export type ConsentType =
  | 'privacy_required'
  | 'sensitive_health_voice'
  | 'cross_border_transfer'
  | 'ai_processing'
  | 'marketing_optional'

export type ConsentSubject = 'account' | 'elder'

export interface ConsentDefinition {
  type: ConsentType
  subject: ConsentSubject
  /** 화면 표기 라벨. */
  label: string
  /** 무엇에 동의하는지 한 줄 요약. */
  summary: string
  /** 필수 여부(미동의 시 해당 흐름 차단). */
  required: boolean
  /** 개인정보보호법상 민감정보 → 별도 동의 대상. */
  sensitive: boolean
  /** 국외이전 관련(해외 LLM/STT 등). */
  crossBorder: boolean
  /** 현재 동의서 버전(consents.version에 기록). */
  version: string
}

/** 현재 동의서 버전. 문구 변경 시 상향하고 재동의를 유도한다. */
export const CONSENT_VERSION = 'v1.0'

export const CONSENT_CATALOG: Record<ConsentType, ConsentDefinition> = {
  privacy_required: {
    type: 'privacy_required',
    subject: 'account',
    label: '개인정보 수집·이용 동의(필수)',
    summary: '요양보호사 계정 운영을 위한 최소 개인정보 수집·이용에 동의합니다.',
    required: true,
    sensitive: false,
    crossBorder: false,
    version: CONSENT_VERSION,
  },
  sensitive_health_voice: {
    type: 'sensitive_health_voice',
    subject: 'elder',
    label: '민감정보(건강·음성) 처리 동의(필수, 별도)',
    summary: '어르신의 건강 관련 정보와 음성 데이터 처리에 별도로 동의합니다.',
    required: true,
    sensitive: true,
    crossBorder: false,
    version: CONSENT_VERSION,
  },
  cross_border_transfer: {
    type: 'cross_border_transfer',
    subject: 'elder',
    label: '개인정보 국외이전 동의(필수)',
    summary: 'AI 대화·음성 처리를 위해 일부 데이터가 국외 처리자에게 이전됨에 동의합니다.',
    required: true,
    sensitive: false,
    crossBorder: true,
    version: CONSENT_VERSION,
  },
  ai_processing: {
    type: 'ai_processing',
    subject: 'elder',
    label: 'AI 이용 고지 확인(필수)',
    summary: '대화 상대가 사람이 아니라 AI임을 이해하고 이용에 동의합니다.',
    required: true,
    sensitive: false,
    crossBorder: false,
    version: CONSENT_VERSION,
  },
  marketing_optional: {
    type: 'marketing_optional',
    subject: 'account',
    label: '마케팅 정보 수신(선택)',
    summary: '서비스 소식·혜택 안내 수신에 동의합니다. (선택, 미동의 무방)',
    required: false,
    sensitive: false,
    crossBorder: false,
    version: CONSENT_VERSION,
  },
}

/** 특정 주체의 필수 동의 유형 목록. */
export function requiredConsents(subject: ConsentSubject): ConsentType[] {
  return (Object.values(CONSENT_CATALOG) as ConsentDefinition[])
    .filter((d) => d.subject === subject && d.required)
    .map((d) => d.type)
}

/** 계정 온보딩(가입) 시 필수 동의. */
export function requiredAccountConsents(): ConsentType[] {
  return requiredConsents('account')
}

/** 어르신 세션 시작 전 확보돼야 하는 필수 동의(민감·국외이전·AI 고지). */
export function requiredElderConsents(): ConsentType[] {
  return requiredConsents('elder')
}

/** 확보된 동의(granted)에서 아직 빠진 필수 동의를 반환. */
export function missingRequiredConsents(
  subject: ConsentSubject,
  granted: readonly ConsentType[],
): ConsentType[] {
  const have = new Set(granted)
  return requiredConsents(subject).filter((t) => !have.has(t))
}

/** 어르신 대화를 시작해도 되는지(필수 동의 모두 확보). */
export function canStartElderSession(granted: readonly ConsentType[]): boolean {
  return missingRequiredConsents('elder', granted).length === 0
}

/** 민감정보(건강·음성) 별도 동의가 확보됐는지. */
export function hasSensitiveConsent(granted: readonly ConsentType[]): boolean {
  return granted.includes('sensitive_health_voice')
}
