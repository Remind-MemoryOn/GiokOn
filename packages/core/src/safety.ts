// @giokon/core — AI 안전 도메인 규칙 (M12: AI Safety & Trust)
//
// 목적: 어르신 발화에서 **위기 신호**(자살·자해·응급·학대)를 감지해 **사람에게
// 에스컬레이션**하고, 대화에는 진단·상담이 아닌 따뜻한 지지 응답만 내보낸다.
// 또한 AI 생성 발화를 **가드레일**로 걸러 의학적 조언·진단·유해 표현을 차단한다.
//
// 원칙(정부심사·비의료 포지셔닝):
//   1. 진단하지 않는다. 본 모듈은 키워드 기반 **안전장치**이지 임상 판정이 아니다.
//   2. 사람이 개입한다. 위기는 AI가 상담하지 않고 요양보호사/보호자에게 넘긴다.
//   3. 과탐지가 미탐지보다 낫되, 알림 피로를 줄이기 위해 crisis/watch 2단계로 나눈다.
//
// 이 모듈은 순수(플랫폼 무관). 세션 파이프라인(Edge Function/모바일)이 매 사용자
// 발화에 assessRisk 를 먼저 호출하고, crisis 면 safeReply 를 응답으로 쓰고
// escalate 플래그로 사람에게 알린다(로깅 포함).

export type RiskLevel = 'none' | 'watch' | 'crisis'
export type CrisisCategory =
  | 'self_harm' // 자살·자해
  | 'medical_emergency' // 응급(호흡곤란·흉통·쓰러짐 등)
  | 'abuse' // 학대 의심
  | 'acute_distress' // 급성 정서적 고통(watch)

export interface SafetyAssessment {
  level: RiskLevel
  categories: CrisisCategory[]
  matchedTerms: string[]
  /** 사람(요양보호사/보호자) 즉시 확인 필요 여부. */
  escalate: boolean
  /** 어르신에게 들려줄 안전 응답(위기·watch 시). 진단·상담이 아닌 지지·연결. */
  safeReply: string | null
  /** 요양보호사/보호자 화면에 표시할 안내(진단 아님, 대응 자원 포함). */
  caregiverAlert: string | null
}

// 키워드는 공백 제거 정규화본에 대해 부분일치로 검사한다(STT 띄어쓰기 변이 흡수).
// 벤치마크: 오탐을 줄이기 위해 단일 글자('죽','맞')는 쓰지 않고 구(phrase) 단위로.
const SELF_HARM: readonly string[] = [
  '죽고싶',
  '죽고자',
  '자살',
  '목숨을끊',
  '목숨끊',
  '살기싫',
  '살고싶지않',
  '살고싶지가않',
  '죽어버리',
  '죽어야겠',
  '죽는게낫',
  '죽는편이낫',
  '확죽',
  '자해',
  '손목을긋',
  '손목긋',
  '뛰어내리',
  '목을매',
  '목맬',
  '따라죽',
  '사라지고싶',
  '없어지고싶',
]

const MEDICAL_EMERGENCY: readonly string[] = [
  '숨이안쉬',
  '숨을못쉬',
  '숨이막혀',
  '숨이차서못',
  '가슴이너무아파',
  '가슴이조여',
  '가슴을쥐어',
  '쓰러질것같',
  '쓰러졌',
  '피를토',
  '피가많이',
  '의식이없',
  '어지러워서쓰러',
  '말이안나와',
  '한쪽이안움직',
  '마비가온',
  '경련이',
  '응급',
  '구급차',
]

const ABUSE: readonly string[] = [
  '때려요',
  '때렸어',
  '때린다',
  '학대',
  '굶겨',
  '밥을안줘',
  '밥도안줘',
  '가둬놔',
  '가뒀',
  '돈을뺏',
  '돈뺏어',
  '해코지',
  '꼬집어',
  '멍이들',
  '맞고살',
  '욕을퍼부',
]

const ACUTE_DISTRESS: readonly string[] = [
  '너무무섭',
  '무서워죽',
  '견딜수가없',
  '견딜수없',
  '너무괴로',
  '숨고싶',
  '아무도없이',
  '혼자남겨',
  '버림받',
  '살아뭐하',
]

function normalize(text: string): string {
  return text.replace(/\s+/g, '')
}

function matchAll(normalized: string, bank: readonly string[]): string[] {
  return bank.filter((term) => normalized.includes(term))
}

// 대응 자원(대한민국): 자살예방상담 109(24시간)·정신건강 1577-0199,
// 노인학대 노인보호전문기관 1577-1389·신고 112, 응급 119.
const SAFE_REPLY: Record<CrisisCategory, string> = {
  self_harm:
    '어르신… 지금 많이 힘드신 마음이 느껴져서 저도 마음이 아파요. 혼자 담아두지 마시고요, ' +
    '이 이야기는 곁에 계신 선생님께 꼭 전해드릴게요. 어르신은 정말 소중한 분이세요.',
  medical_emergency:
    '어르신, 지금 많이 불편하신 것 같아요. 제가 바로 선생님을 불러드릴게요. ' +
    '천천히 숨 쉬면서 조금만 기다려 주세요.',
  abuse:
    '어르신, 말씀해 주셔서 고마워요. 많이 놀라고 속상하셨겠어요. ' +
    '이 이야기는 어르신을 도와드릴 수 있는 분께 안전하게 전해드릴게요.',
  acute_distress:
    '괜찮아요, 어르신. 제가 여기 함께 있어요. 잠깐 천천히 숨 한번 쉬어볼까요? ' +
    '무리해서 말씀 안 하셔도 돼요.',
}

const CAREGIVER_ALERT: Record<CrisisCategory, string> = {
  self_harm:
    '⚠️ 자살·자해 위기 신호 감지 — 즉시 어르신 상태를 직접 확인하세요. ' +
    '자살예방상담 ☎109(24시간). 이 알림은 키워드 기반 안전장치이며 의학적 진단이 아닙니다.',
  medical_emergency:
    '⚠️ 응급 상황 신호 감지 — 즉시 어르신을 확인하고 필요 시 ☎119. ' +
    '이 알림은 안전장치이며 의학적 진단이 아닙니다.',
  abuse:
    '⚠️ 노인학대 의심 신호 감지 — 어르신 안전을 확인하세요. ' +
    '노인보호전문기관 ☎1577-1389 / 긴급 ☎112. 노인복지법상 의무신고 대상 여부를 확인하세요.',
  acute_distress:
    '정서적 어려움 신호가 보였어요 — 다음 대화와 어르신 상태를 살펴봐 주세요. (진단 아님)',
}

/**
 * 어르신 발화의 위기 신호를 평가한다. 세션 파이프라인이 generateReply 이전에 호출한다.
 * crisis(자살·응급·학대) → 사람 에스컬레이션 + 안전 응답. watch(급성 고통) → 부드러운 지지.
 */
export function assessRisk(userText: string): SafetyAssessment {
  const norm = normalize(userText)

  const hits: Record<CrisisCategory, string[]> = {
    self_harm: matchAll(norm, SELF_HARM),
    medical_emergency: matchAll(norm, MEDICAL_EMERGENCY),
    abuse: matchAll(norm, ABUSE),
    acute_distress: matchAll(norm, ACUTE_DISTRESS),
  }

  // 심각도 우선순위: self_harm > medical_emergency > abuse > acute_distress.
  const crisisOrder: CrisisCategory[] = ['self_harm', 'medical_emergency', 'abuse']
  const crisisCategories = crisisOrder.filter((c) => hits[c].length > 0)
  const watchHit = hits.acute_distress.length > 0

  if (crisisCategories.length > 0) {
    const primary = crisisCategories[0]
    const matchedTerms = crisisCategories.flatMap((c) => hits[c])
    return {
      level: 'crisis',
      categories: crisisCategories,
      matchedTerms,
      escalate: true,
      safeReply: SAFE_REPLY[primary],
      caregiverAlert: CAREGIVER_ALERT[primary],
    }
  }

  if (watchHit) {
    return {
      level: 'watch',
      categories: ['acute_distress'],
      matchedTerms: hits.acute_distress,
      escalate: false,
      safeReply: SAFE_REPLY.acute_distress,
      caregiverAlert: CAREGIVER_ALERT.acute_distress,
    }
  }

  return {
    level: 'none',
    categories: [],
    matchedTerms: [],
    escalate: false,
    safeReply: null,
    caregiverAlert: null,
  }
}

// ─────────────────────────────────────────────────────────────
// 출력 가드레일 — AI 생성 발화 검열(M12.2)
// ─────────────────────────────────────────────────────────────
//
// 실 LLM 연동(Phase M) 시, 생성된 질문을 어르신에게 재생하기 전에 이 함수로 검열한다.
// 의학적 조언·진단 단정·유해 표현이 있으면 차단하고 안전한 대체 발화를 제공한다.

export interface UtteranceScreen {
  allowed: boolean
  reason?: string
  /** 차단 시 대체할 안전한 중립 발화. */
  safeAlternative?: string
}

// 의학적 조언·진단 단정(비의료 포지셔닝 위반).
const MEDICAL_CLAIM: readonly string[] = [
  '치매세요',
  '치매입니다',
  '치매인것같',
  '우울증이세요',
  '우울증입니다',
  '진단',
  '병입니다',
  '질환입니다',
  '약을드세요',
  '약을끊',
  '복용하세요',
  '처방',
  '용량을',
  '병원가지마',
  '수술받으세요',
  '치료하세요',
]

// 어르신에게 부적절·유해한 표현(AI 는 절대 사용 금지).
const HARMFUL: readonly string[] = [
  '죽어',
  '때려',
  '바보',
  '멍청',
  '쓸모없',
  '한심',
]

const SAFE_ALTERNATIVE =
  '어르신, 오늘 이렇게 이야기 나눠 주셔서 고마워요. 우리 즐거운 옛날 이야기 하나 더 해볼까요?'

/** AI 생성 발화가 어르신에게 안전한지 검열한다. 차단 시 대체 발화 제공. */
export function screenAiUtterance(text: string): UtteranceScreen {
  const norm = normalize(text)

  const medical = MEDICAL_CLAIM.find((t) => norm.includes(t))
  if (medical) {
    return {
      allowed: false,
      reason: `의학적 조언·진단 표현 감지("${medical}") — 비의료 포지셔닝 위반`,
      safeAlternative: SAFE_ALTERNATIVE,
    }
  }

  const harmful = HARMFUL.find((t) => norm.includes(t))
  if (harmful) {
    return {
      allowed: false,
      reason: `부적절·유해 표현 감지("${harmful}")`,
      safeAlternative: SAFE_ALTERNATIVE,
    }
  }

  return { allowed: true }
}

// ─────────────────────────────────────────────────────────────
// 투명성 고지(M12.3 / AI 기본법 2026) — 공유 문구
// ─────────────────────────────────────────────────────────────

/** 대화 시작·화면에 노출하는 AI 이용 사전 고지. */
export const AI_DISCLOSURE = '이 대화는 사람이 아니라 AI가 진행합니다.'

/** 생성물 표시 라벨(AI 발화·요약 등에 부착). */
export const AI_GENERATED_LABEL = 'AI가 생성한 내용입니다.'
