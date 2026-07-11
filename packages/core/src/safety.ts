// @giokon/core — 노인 특화 대화 안전 엔진 (M12: AI Safety & Trust)
//
// 어르신 발화를 8가지 상황으로 분류하고, 상황별로 근거 있는 대응 전략을 강제한다.
// 이 모듈은 결정론적(플랫폼·모델 무관)이며, 실 LLM 전환 후에도 LLM 호출 "전"(입력
// 위기 감지)과 "후"(출력 가드레일)에 그대로 남아 이중 안전장치가 된다.
//
// ── 설계 원칙 (근거) ──────────────────────────────────────────────────────
// 1. 생명 우선: 위기(자살·자해/응급/학대)는 AI가 상담하지 않는다. 짧은 지지 응답
//    후 즉시 사람(요양보호사)에게 에스컬레이션한다. 과탐지가 미탐지보다 낫다.
// 2. 검증(validation) 우선: 상실·애도 언급은 회상 대화에서 정상이며 치료적일 수
//    있다(생애회고). 부정 감정을 회피·강제 전환하는 것은 무시로 느껴진다 →
//    공감으로 인정하고 계속할지 어르신이 선택하게 한다. 지속 침잠 시에만 부드럽게
//    이동한다.
// 3. 교정 금지: 치매 어르신의 사실 오류·반복을 지적하거나 기억을 시험하지 않는다
//    ("아까 말씀하셨잖아요" 금지). 어르신의 현실을 존중한다.
// 4. 자기결정 존중: 그만하고 싶다는 의사는 즉시 따른다. 거부·짜증에는 사과하고
//    물러난다.
// 5. 비의료: 진단·치료·약 관련 판단을 하지 않는다(서비스 포지셔닝 락다운).
// 6. 상태 신호 기반 진행: 주제 전환·휴식은 고정 카운터가 아니라 어르신의 관여도·
//    감정 신호로 결정한다.
//
// ── 키워드 방식의 한계와 보완 ────────────────────────────────────────────
// 결정론 레이어는 구(phrase) 단위 사전으로 오탐을 억제하되(단일 글자 금지 —
// '죽 한 그릇' ≠ '죽고 싶다'), 반어·완곡 표현은 놓칠 수 있다. 실 LLM 레이어가
// 의미 기반 감지를 보완하고(prompt.ts의 safety 출력), 둘 중 하나라도 위기로
// 판단하면 에스컬레이션한다(OR 결합). 부정 문맥("죽고 싶다는 생각은 안 해요")도
// 위기로 취급한다 — 자살 언급 자체가 확인 대상이며, 판단은 사람이 한다.

// ─────────────────────────────────────────────────────────────
// 발화 정규화 — STT 변이(띄어쓰기·문장부호·군말) 흡수
// ─────────────────────────────────────────────────────────────

/** 매칭용 정규화: 공백·문장부호 제거. STT 띄어쓰기 오류와 무관하게 매칭한다. */
export function normalizeUtterance(text: string): string {
  return text.replace(/[\s.,!?~…‥·'"“”‘’()\-—]/g, '')
}

// ─────────────────────────────────────────────────────────────
// 상황 분류
// ─────────────────────────────────────────────────────────────

export type CrisisCategory = 'self_harm' | 'medical_emergency' | 'abuse'

export type SituationKind =
  | 'crisis' // 자살·자해 / 응급 / 학대 → 사람 에스컬레이션
  | 'distress' // 급성 정서 고통(짐 발언·못살겠다) → 지지, 지속 시 전환·휴식
  | 'rest_request' // 중단·휴식 의사 → 즉시 존중, 따뜻한 마무리
  | 'refusal' // 거부·짜증 → 사과·물러남, 반복 시 마무리
  | 'confusion' // 지남력 혼란·이해 곤란 → 재소개(AI 고지)·안심·쉬운 재질문
  | 'grief' // 상실·그리움·외로움 → 공감 인정 + 선택권(전환 강제 금지)
  | 'silence' // 무발화 → 단계적(재질문→쉬운 주제→휴식 제안)
  | 'normal'

export type RiskLevel = 'none' | 'grief' | 'watch' | 'crisis'

export interface UtteranceAssessment {
  situation: SituationKind
  risk: RiskLevel
  crisisCategories: CrisisCategory[]
  matchedTerms: string[]
  /** 사람(요양보호사) 즉시 확인 필요. */
  escalate: boolean
  /**
   * 고통 신호가 함께 감지됐는지(상황 분류와 무관).
   * 예: "너무 힘들어서 그만할래" → 상황은 중단 존중(rest_request)이지만
   * 고통 신호는 보호자 알림으로 따로 전달한다 — 존중과 관찰을 둘 다 지킨다.
   */
  hasDistressSignal: boolean
}

// ── 사전(lexicon) — 전부 정규화(공백 제거) 기준의 구 단위. 단일 글자 금지. ──

// 자살·자해. 노인 자살 위험신호(수동적 소망·짐 인식 표현) 포함.
const SELF_HARM: readonly string[] = [
  '죽고싶', '죽고자', '자살', '자해',
  '죽어버리', '죽어야겠', '죽어야지', '죽는게낫', '죽는편이낫', '죽었으면',
  '목숨을끊', '목숨끊', '스스로목숨', '명줄을끊',
  '손목을긋', '손목긋', '약을한꺼번에', '약을모아', '수면제를모아',
  '목을매', '목매달', '뛰어내리', '물에빠져죽', '강에빠지',
  '따라죽', '따라가고싶', '영감따라', '할멈따라',
  '사라지고싶', '없어지고싶', '세상뜨고싶', '하늘나라가고싶',
  '그만살고싶', '살기싫', '살고싶지않', '살고싶지가않',
  '내가없어야', '내가없는게낫', '내가죽어야',
]

// 응급. 정서 관용구('가슴이 아파요' 등)와 겹치지 않게 신체 위급 구만.
const MEDICAL_EMERGENCY: readonly string[] = [
  '숨이안쉬', '숨을못쉬', '숨이막혀', '숨쉬기가힘들', '숨쉬기힘들', '숨이차서죽',
  '가슴이조여', '가슴을쥐어', '가슴이짓눌',
  '쓰러질것같', '쓰러졌', '정신을잃', '의식이없', '까무러치',
  '피를토', '하혈', '피가멈추지',
  '마비가온', '몸이한쪽', '한쪽팔이안', '한쪽다리가안', '반쪽이안움직',
  '말이잘안나오', '발음이갑자기', '혀가꼬여',
  '눈이갑자기안보', '갑자기안들려',
  '경련이', '발작이',
  '넘어져서못일어나', '자빠져서못일어나', '일어날수가없',
  '응급실', '구급차', '119좀', '119불러',
]

// 학대 의심. '주사 맞았어' 같은 일상 표현·과거 회상("옛날엔 선생님이 때렸지")과
// 충돌하지 않도록 현재 진행형 신고 구문 위주로 구성한다.
const ABUSE: readonly string[] = [
  '나를때리', '나를때려', '자꾸때리', '자꾸때려', '때려요', '때렸어요', '때리고욕', '맞고살',
  '맞아서멍', '멍이들도록', '꼬집', '밀쳐서',
  '학대', '해코지',
  '욕을퍼부', '욕을해대', '소리를지르고윽박',
  '굶기', '밥을안줘', '밥도안줘', '먹을걸안줘',
  '가둬놓', '방에가둬', '못나가게해', '문을잠가놓',
  '돈을뺏', '돈을가져가버', '통장을뺏', '통장을가져가',
]

// 급성 정서 고통. 짐 인식(perceived burdensomeness)은 노인 자살의 핵심 선행 신호.
const ACUTE_DISTRESS: readonly string[] = [
  '너무힘들어', '너무나힘들', '못살겠', '못견디겠', '견딜수가없', '견딜수없', '견디기힘들',
  '너무괴로', '괴로워죽', '미치겠', '돌아버리겠',
  '너무무서', '무서워죽',
  '잠을통못자', '잠을못자', '뜬눈으로',
  '짐만되', '짐이되', '짐덩어리', '폐만끼치', '폐끼치기싫',
  '쓸모없는사람', '쓸모가없어', '아무짝에도',
  '버림받', '아무도안찾아와', '아무도날찾지',
]

// 상실·그리움·외로움 — 회상 대화의 정상 소재. 공감 대상이지 회피 대상이 아니다.
const GRIEF: readonly string[] = [
  '사별', '먼저갔', '먼저떠나', '먼저보냈', '먼저저세상',
  '돌아가셨', '돌아가시고', '돌아가신', '세상을떠나', '세상떠나',
  '하늘나라로', '저세상으로', '여의고', '여읜',
  '자식을잃', '애를잃', '아들을잃', '딸을잃',
  '그립', '그리워', '보고싶',
  '외로워', '외롭', '쓸쓸', '적적',
  '혼자살아', '혼자남', '홀로남',
  '눈물이나', '눈물만나', '울었', '서럽', '서글프',
  '가슴이아파', '가슴이아프', '마음이아파', '마음이아프', '한이맺', '속상해',
]

// 지남력 혼란·이해 곤란(치매 특성) → 교정 아닌 재소개·안심.
const CONFUSION: readonly string[] = [
  '여기가어디', '여긴어디', '여기어디', '내가왜여기',
  '당신누구', '당신은누구', '너는누구', '네가누구', '누구세요', '누구신데', '댁은뉘',
  '무슨말인지모르', '무슨말인지못알아', '무슨소린지', '뭔소린지', '뭐라는지모르',
  '지금이몇년도', '오늘이며칠인지모르',
]

// 거부·짜증 → 사과·물러남.
const REFUSAL: readonly string[] = [
  '듣기싫', '말하기싫', '얘기하기싫', '이야기하기싫', '대답하기싫',
  '귀찮', '성가시', '시끄러', '조용히해', '조용해',
  '저리가', '가버려', '집어치워', '그만물어', '묻지마', '왜자꾸물어', '왜자꾸그래',
]

// 중단·휴식 요청 → 즉시 존중.
const REST_REQUEST: readonly string[] = [
  '그만하자', '그만할래', '그만하고싶', '그만합시다', '그만해요', '이제그만',
  '쉬고싶', '쉬자', '좀쉴래', '누워야겠', '눕고싶',
  '피곤해', '피곤하네', '졸려', '졸리네', '잠이와',
  '다음에하자', '다음에해', '이따가하자', '이따하자', '나중에하자', '나중에해',
  '화장실', '뒷간',
]

function matchAll(normalized: string, bank: readonly string[]): string[] {
  return bank.filter((term) => normalized.includes(term))
}

/**
 * 어르신 발화를 상황으로 분류한다.
 * 우선순위: 위기 > 중단요청 > 급성고통 > 거부 > 혼란 > 애도 > 침묵 > 일반.
 * — 위기는 생명 우선. 명시적 중단 의사는 고통보다 우선 존중한다(자기결정).
 *   단, 고통 신호는 hasDistressSignal로 함께 전달돼 보호자 알림이 유지된다.
 */
export function assessUtterance(text: string): UtteranceAssessment {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      situation: 'silence', risk: 'none', crisisCategories: [],
      matchedTerms: [], escalate: false, hasDistressSignal: false,
    }
  }

  const norm = normalizeUtterance(trimmed)
  const distress = matchAll(norm, ACUTE_DISTRESS)
  const hasDistressSignal = distress.length > 0

  const crisisHits: Record<CrisisCategory, string[]> = {
    self_harm: matchAll(norm, SELF_HARM),
    medical_emergency: matchAll(norm, MEDICAL_EMERGENCY),
    abuse: matchAll(norm, ABUSE),
  }
  const crisisOrder: CrisisCategory[] = ['self_harm', 'medical_emergency', 'abuse']
  const crisisCategories = crisisOrder.filter((c) => crisisHits[c].length > 0)
  if (crisisCategories.length > 0) {
    return {
      situation: 'crisis',
      risk: 'crisis',
      crisisCategories,
      matchedTerms: crisisCategories.flatMap((c) => crisisHits[c]),
      escalate: true,
      hasDistressSignal,
    }
  }

  const rest = matchAll(norm, REST_REQUEST)
  if (rest.length > 0) {
    return {
      situation: 'rest_request', risk: hasDistressSignal ? 'watch' : 'none',
      crisisCategories: [], matchedTerms: rest, escalate: false, hasDistressSignal,
    }
  }

  if (hasDistressSignal) {
    return {
      situation: 'distress', risk: 'watch', crisisCategories: [],
      matchedTerms: distress, escalate: false, hasDistressSignal,
    }
  }

  const refusal = matchAll(norm, REFUSAL)
  if (refusal.length > 0) {
    return {
      situation: 'refusal', risk: 'none', crisisCategories: [],
      matchedTerms: refusal, escalate: false, hasDistressSignal: false,
    }
  }

  const confusion = matchAll(norm, CONFUSION)
  if (confusion.length > 0) {
    return {
      situation: 'confusion', risk: 'none', crisisCategories: [],
      matchedTerms: confusion, escalate: false, hasDistressSignal: false,
    }
  }

  const grief = matchAll(norm, GRIEF)
  if (grief.length > 0) {
    return {
      situation: 'grief', risk: 'grief', crisisCategories: [],
      matchedTerms: grief, escalate: false, hasDistressSignal: false,
    }
  }

  return {
    situation: 'normal', risk: 'none', crisisCategories: [],
    matchedTerms: [], escalate: false, hasDistressSignal: false,
  }
}

// ─────────────────────────────────────────────────────────────
// 관여도(engagement) — 주제 진행·전환의 근거 신호
// ─────────────────────────────────────────────────────────────

export type Engagement = 'silent' | 'low' | 'normal' | 'rich'

// 맞장구·단답만으로 이루어진 발화(정규화 기준).
const BACKCHANNEL_ONLY =
  /^(응|어|네|예|넹|네에|예에|그래|그래요|그렇지|그렇죠|그럼|글쎄|글쎄요|몰라|몰라요|모르지|모르겠다|모르겠어|모르겠네|모르겠어요|음|음음|아니|아니야|아니요|아뇨|싫어|좋아|좋지|맞아|맞아요|기억이안나|기억안나)+$/

// 서사 표지 — 이야기가 풀리고 있다는 신호.
const NARRATIVE_MARKERS = [
  '그때', '그시절', '그래서', '그러니까', '그러다가', '그러다', '그런데',
  '했었', '였었', '았었', '었지', '았지', '었어요', '았어요',
  '하더라', '더라고', '더라니까', '예전에', '옛날에', '젊었을때', '어렸을때',
]

/** 발화의 관여도를 평가한다. rich면 같은 주제를 계속(회상이 작동 중), low 연속이면 전환 신호. */
export function assessEngagement(text: string): Engagement {
  const trimmed = text.trim()
  if (!trimmed) return 'silent'
  const norm = normalizeUtterance(trimmed)
  if (norm.length < 5 || BACKCHANNEL_ONLY.test(norm)) return 'low'
  if (norm.length >= 24 || NARRATIVE_MARKERS.some((m) => norm.includes(m))) return 'rich'
  return 'normal'
}

// ─────────────────────────────────────────────────────────────
// 안전 응답·보호자 알림 템플릿 (짧은 문장 — TTS·인지 부담 고려)
// ─────────────────────────────────────────────────────────────
// 대응 자원(대한민국): 자살예방상담 109(24시간) · 노인보호전문기관 1577-1389 ·
// 긴급 112 · 응급 119.

export const CRISIS_SAFE_REPLY: Record<CrisisCategory, string> = {
  self_harm:
    '어르신, 그 말씀을 들으니 제 마음이 아파요. 어르신은 정말 소중한 분이에요. ' +
    '지금 바로 선생님을 불러드릴게요. 조금만 저와 같이 계셔요.',
  medical_emergency:
    '어르신, 많이 불편하시군요. 지금 바로 선생님을 불러드릴게요. ' +
    '움직이지 마시고, 천천히 숨 쉬면서 잠깐만 기다려 주세요.',
  abuse:
    '어르신, 용기 내어 말씀해 주셔서 고마워요. 많이 힘드셨겠어요. ' +
    '이 이야기는 어르신을 지켜드릴 수 있는 분께 꼭 전할게요. 어르신 잘못이 아니에요.',
}

export const CRISIS_CAREGIVER_ALERT: Record<CrisisCategory, string> = {
  self_harm:
    '🚨 자살·자해 위기 신호 — 즉시 어르신을 직접 확인하세요. 자살예방상담 ☎109(24시간). ' +
    '이 알림은 키워드 기반 안전장치이며 의학적 진단이 아닙니다.',
  medical_emergency:
    '🚨 응급 상황 신호 — 즉시 어르신을 확인하고 필요 시 ☎119. ' +
    '이 알림은 안전장치이며 의학적 진단이 아닙니다.',
  abuse:
    '🚨 노인학대 의심 신호 — 어르신 안전을 확인하세요. 노인보호전문기관 ☎1577-1389 / 긴급 ☎112. ' +
    '노인복지법상 신고 의무 여부를 확인하세요.',
}

export const DISTRESS_CAREGIVER_NOTE =
  '⚠️ 정서적으로 힘들다는 표현이 있었어요. 세션 후 어르신 상태를 살펴봐 주세요. (진단 아님)'

/** 상황 평가로부터 보호자 알림 문구를 만든다(알림 불필요 시 null). */
export function buildCaregiverAlert(a: UtteranceAssessment): string | null {
  if (a.situation === 'crisis' && a.crisisCategories.length > 0) {
    return CRISIS_CAREGIVER_ALERT[a.crisisCategories[0]]
  }
  // 중단 요청과 겹친 고통 신호도 알림은 유지한다(존중과 관찰을 둘 다).
  if (a.situation === 'distress' || a.hasDistressSignal) return DISTRESS_CAREGIVER_NOTE
  return null
}

// ─────────────────────────────────────────────────────────────
// 출력 가드레일 — AI 발화 검열 (LLM 전환 후에도 항상 후단에서 실행)
// ─────────────────────────────────────────────────────────────

export interface UtteranceScreen {
  allowed: boolean
  reason?: string
  /** 차단 시 대체할 안전한 중립 발화. */
  safeAlternative?: string
}

// 의학적 조언·진단 단정(비의료 포지셔닝 위반).
const MEDICAL_CLAIM: readonly string[] = [
  '치매세요', '치매입니다', '치매인것같', '치매가맞', '치매초기',
  '우울증이세요', '우울증입니다', '우울증인것같',
  '진단', '병입니다', '질환입니다', '증상입니다',
  '약을드세요', '약을드시', '약을끊', '약을줄이', '약을늘리', '복용하세요', '복용을중단',
  '처방', '용량을',
  '병원가지마', '병원에가지마', '병원안가도',
  '수술받으세요', '수술하세요', '치료하세요', '치료받으세요', '치료가필요',
]

// 교정·직면·기억 시험 — 치매 돌봄 금기(어르신의 현실 존중, validation).
const CONFRONTATION: readonly string[] = [
  '아까말씀하셨', '아까도말씀', '아까얘기했', '또그이야기', '또그얘기', '방금말씀하셨잖',
  '기억안나세요', '기억못하세요', '기억나지않으세요', '왜기억을못', '잊어버리셨어요',
  '그건틀렸', '그건사실이아니', '사실과달라', '거짓말', '말이안돼요', '그럴리가없',
  '벌써몇번째', '몇번을말해',
]

// 어르신에게 유해·모욕적 표현(절대 금지).
const HARMFUL: readonly string[] = [
  '바보', '멍청', '쓸모없', '한심', '답답하시네', '그것도몰라',
  '죽어버려', '죽으세요', '때려',
]

const SAFE_ALTERNATIVE =
  '어르신, 오늘 이렇게 이야기 나눠 주셔서 고마워요. 우리 즐거운 옛날 이야기 하나 더 해볼까요?'

/** AI 생성 발화가 어르신에게 안전한지 검열한다. 차단 시 대체 발화를 제공한다. */
export function screenAiUtterance(text: string): UtteranceScreen {
  const norm = normalizeUtterance(text)

  const medical = MEDICAL_CLAIM.find((t) => norm.includes(t))
  if (medical) {
    return {
      allowed: false,
      reason: `의학적 조언·진단 표현("${medical}") — 비의료 포지셔닝 위반`,
      safeAlternative: SAFE_ALTERNATIVE,
    }
  }

  const confront = CONFRONTATION.find((t) => norm.includes(t))
  if (confront) {
    return {
      allowed: false,
      reason: `교정·직면·기억 시험 표현("${confront}") — 검증(validation) 원칙 위반`,
      safeAlternative: SAFE_ALTERNATIVE,
    }
  }

  const harmful = HARMFUL.find((t) => norm.includes(t))
  if (harmful) {
    return {
      allowed: false,
      reason: `유해·모욕 표현("${harmful}")`,
      safeAlternative: SAFE_ALTERNATIVE,
    }
  }

  return { allowed: true }
}

// ─────────────────────────────────────────────────────────────
// 투명성 고지(AI기본법 2026) — 공유 문구
// ─────────────────────────────────────────────────────────────

/** 대화 시작·화면에 노출하는 AI 이용 사전 고지. */
export const AI_DISCLOSURE = '이 대화는 사람이 아니라 AI가 진행합니다.'

/** 생성물 표시 라벨(AI 발화·요약 등에 부착). */
export const AI_GENERATED_LABEL = 'AI가 생성한 내용입니다.'
