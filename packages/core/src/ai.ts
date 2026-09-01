import type {
  ChronicleEntry,
  ConversationTurn,
  ElderProfile,
  EmotionTone,
  GuardianReport,
  Session,
  TherapyType,
} from './types'
import {
  assessEngagement,
  assessUtterance,
  CRISIS_SAFE_REPLY,
  type UtteranceAssessment,
} from './safety'
import { uid, nowIso } from './utils'

// Mock LLM — 실 서비스에서는 Edge Function의 프런티어 LLM(Structured Outputs)이 담당.
// 시그니처·행동 계약은 실연동 전환 시 그대로 유지한다(AIProvider 인터페이스).
//
// 대화 진행 원칙(임의 카운터 없음 — 근거는 safety.ts 상단 설계 원칙 참조):
//   - 관여도가 풍부하면 같은 주제를 계속한다(회상이 작동하는 순간을 끊지 않는다).
//   - 주제 전환은 어르신의 상태 신호(저관여 연속·지속 침잠·직접 언급한 새 주제)로만.
//   - 상실·애도 언급은 회피하지 않고 공감으로 받고, 계속할지 어르신이 선택한다.
//   - 목업의 질문 풀이 소진되면 자연스러운 다리 문장과 함께 주제를 옮긴다
//     (같은 질문의 기계적 반복은 혼란·심문감을 주므로 금지 — 실 LLM은 프롬프트 규칙).

// ─────────────────────────────────────────────────────────────
// 1) 주제 은행 — 오프너 + 후속 질문 풀 + 쉬운 질문(스캐폴드) + 다리 문장
// ─────────────────────────────────────────────────────────────

interface TopicBank {
  topic: string
  opener: (e: ElderProfile) => string
  /** 후속 질문 풀 — 순서대로 사용, 소진 시 주제 이동. */
  followups: ((lastUserText: string, e: ElderProfile) => string)[]
  /** 저관여 시 쓰는 더 쉬운 질문(짧고 구체적, 예/아니오·한 단어로 답 가능). */
  simple: (e: ElderProfile) => string
  /** 주제를 떠날 때의 다리 문장. */
  bridge: () => string
}

const REMINISCENCE_BANKS: TopicBank[] = [
  {
    topic: '고향',
    opener: (e) =>
      e.hometown
        ? `어르신, ${e.hometown}에서 오래 사셨다고 들었어요. 그곳에서 제일 기억에 남는 게 뭐예요?`
        : `어르신 고향은 어디세요? 어렸을 때 살던 동네 이야기 좀 들려주실래요?`,
    followups: [
      (t) => `${shortQuote(t)} 그때 동네 사람들은 어떤 분들이셨어요?`,
      () => `동네에서 제일 자주 가시던 곳은 어디였어요?`,
      () => `그 시절 동네 풍경이 눈에 선하시겠어요. 봄이 오면 동네가 어땠어요?`,
    ],
    simple: (e) => (e.hometown ? `${e.hometown}, 좋은 곳이지요?` : `고향 동네가 그리우실 때가 있으세요?`),
    bridge: () => `고향 이야기 잘 들었어요.`,
  },
  {
    topic: '가족',
    opener: (e) =>
      e.family
        ? `어르신 가족 이야기 듣고 싶어요. 자녀분들 어렸을 적에 어떠셨어요?`
        : `어르신, 가족 중에 가장 자주 떠오르는 분은 누구세요?`,
    followups: [
      (t) => `${shortQuote(t)} 그분 생각하면 어떤 장면이 제일 먼저 떠오르세요?`,
      () => `명절에 가족들 다 모이면 뭐 하고 지내셨어요?`,
      () => `자녀분들 키우실 때 제일 흐뭇했던 순간은 언제였어요?`,
    ],
    simple: () => `가족분들 생각하면 마음이 따뜻해지시지요?`,
    bridge: () => `가족 이야기 정말 따뜻하네요.`,
  },
  {
    topic: '직업',
    opener: (e) =>
      e.job
        ? `어르신, ${e.job} 하셨다고요. 그때 가장 보람 있었던 순간이 언제예요?`
        : `젊은 시절엔 어떤 일 하셨어요?`,
    followups: [
      (t) => `${shortQuote(t)} 그 일은 어떻게 시작하시게 됐어요?`,
      () => `일하시면서 만난 분들 중에 기억나는 분 있으세요?`,
      () => `그 시절엔 하루가 참 길으셨겠어요. 일 끝나면 뭐 하셨어요?`,
    ],
    simple: () => `일하시던 때가 가끔 생각나세요?`,
    bridge: () => `일 이야기 들으니 정말 대단하세요.`,
  },
  {
    topic: '취미',
    opener: (e) =>
      e.hobbies
        ? `${e.hobbies} 좋아하신다고요. 어떻게 시작하시게 됐어요?`
        : `요즘 시간 보내실 때 뭐 하시는 게 제일 좋으세요?`,
    followups: [
      (t) => `${shortQuote(t)} 하시다 보면 시간 가는 줄 모르시지요?`,
      () => `제일 잘됐던 날 이야기 한번 들려주세요.`,
      () => `어렸을 때는 어떤 놀이를 좋아하셨어요?`,
    ],
    simple: (e) => (e.hobbies ? `${e.hobbies}는 요즘도 하세요?` : `요즘 재미 붙이신 게 있으세요?`),
    bridge: () => `재미있게 들었어요.`,
  },
  {
    topic: '음식',
    opener: () => `어르신, 어릴 때 어머니가 해주시던 음식 중에 제일 기억에 남는 게 뭐예요?`,
    followups: [
      (t) => `${shortQuote(t)} 그 맛이 지금도 생각나시지요?`,
      () => `잔칫날에는 어떤 음식을 하셨어요?`,
      () => `어르신이 제일 자신 있는 음식은 뭐예요?`,
    ],
    simple: () => `따뜻한 국밥 한 그릇 생각나는 날씨지요?`,
    bridge: () => `맛있는 이야기 잘 들었어요.`,
  },
  {
    topic: '학창 시절',
    opener: () => `어르신, 학교 다니실 때 제일 친했던 친구 이름이 뭐예요?`,
    followups: [
      (t) => `${shortQuote(t)} 그 친구랑은 주로 뭘 하고 놀았어요?`,
      () => `그때 좋아하셨던 선생님도 계셨어요?`,
      () => `학교 가는 길은 어땠어요? 멀었어요?`,
    ],
    simple: () => `어릴 적 친구들 얼굴이 가끔 떠오르세요?`,
    bridge: () => `친구 이야기 좋네요.`,
  },
]

const COGNITIVE_BANKS: TopicBank[] = [
  {
    topic: '계절',
    opener: () => `어르신, 지금이 무슨 계절이지요? 이 계절 하면 제일 먼저 떠오르는 게 뭐예요?`,
    followups: [
      (t) => `${shortQuote(t)} 그럼 그 계절에 어울리는 음식은 뭐가 있을까요?`,
      () => `이 계절에 피는 꽃 이름 하나만 말씀해 주실래요?`,
    ],
    simple: () => `오늘 날씨는 따뜻한가요, 쌀쌀한가요?`,
    bridge: () => `계절 이야기 좋았어요.`,
  },
  {
    topic: '숫자',
    opener: () => `어르신, 1부터 10까지 거꾸로 한번 세어볼까요? 천천히 같이 가요. 10, 9... 다음은요?`,
    followups: [
      () => `잘하셨어요. 그럼 이번엔 7 빼기 3은 얼마지요?`,
      () => `좋아요. 오늘이 무슨 요일인지도 한번 맞혀볼까요?`,
    ],
    simple: () => `손가락 다섯 개, 양손이면 몇 개지요?`,
    bridge: () => `숫자 놀이 잘하셨어요.`,
  },
  {
    topic: '낱말',
    opener: () => `끝말잇기 한 판 해볼까요? 제가 먼저 시작할게요. "사과". 다음 단어는요?`,
    followups: [
      (t) => `${shortQuote(t)} 좋아요. 그 단어 끝 글자로 하나 더 부탁드려요.`,
      () => `이번엔 "ㄱ"으로 시작하는 과일 하나만 말씀해 주세요.`,
    ],
    simple: () => `"사과" 하면 무슨 색이 떠오르세요?`,
    bridge: () => `오늘 머리가 잘 돌아가시네요.`,
  },
]

const MUSIC_BANKS: TopicBank[] = [
  {
    topic: '노래',
    opener: () => `어르신, 젊으셨을 적에 자주 부르시던 노래가 있으세요? 한 소절만 떠올려 주실 수 있을까요?`,
    followups: [
      (t) => `${shortQuote(t)} 그 노래 들으면 어떤 장면이 떠오르세요?`,
      () => `결혼식이나 잔칫날에 들으셨던 노래는 어떤 게 기억나세요?`,
    ],
    simple: () => `콧노래 흥얼거리실 때가 있으세요?`,
    bridge: () => `노래 이야기 좋았어요.`,
  },
  {
    topic: '라디오',
    opener: () => `예전엔 라디오에서 노래 많이 들으셨지요. 라디오 켜놓고 뭐 하셨어요?`,
    followups: [
      (t) => `${shortQuote(t)} 그때 자주 나오던 노래 중에 기억나는 곡 있으세요?`,
      () => `어릴 적 어머니가 흥얼거리시던 노래도 떠오르세요?`,
    ],
    simple: () => `라디오 소리가 정겨우셨지요?`,
    bridge: () => `라디오 이야기 정겹네요.`,
  },
]

const ART_BANKS: TopicBank[] = [
  {
    topic: '풍경',
    opener: () => `어르신, 눈 감고 가장 좋아하시는 풍경 하나 떠올려 보세요. 어떤 모습이 보이세요?`,
    followups: [
      (t) => `${shortQuote(t)} 그 장면에서 어떤 색이 제일 진하게 떠오르세요?`,
      () => `어렸을 적 골목길 풍경도 한번 떠올려 보실까요?`,
    ],
    simple: () => `하늘 보는 거 좋아하세요?`,
    bridge: () => `정말 그림 같네요.`,
  },
  {
    topic: '색',
    opener: () => `어르신이 제일 좋아하시는 색은 무슨 색이세요? 그 색 하면 떠오르는 게 뭐예요?`,
    followups: [
      (t) => `${shortQuote(t)} 그 색깔 옷을 입었던 날도 기억나세요?`,
      () => `봄 들판을 떠올리면 어떤 꽃이 보이세요?`,
    ],
    simple: () => `밝은 색을 보면 기분이 좋아지시지요?`,
    bridge: () => `색 이야기 재미있었어요.`,
  },
]

function getBanks(type: TherapyType): TopicBank[] {
  switch (type) {
    case 'cognitive': return COGNITIVE_BANKS
    case 'music':     return MUSIC_BANKS
    case 'art':       return ART_BANKS
    case 'reminiscence':
    default:          return REMINISCENCE_BANKS
  }
}

/**
 * 피해갈 내용(웹 설계 `avoidTopics`)에 걸리는 주제 은행을 제외한다.
 * 자유 입력 텍스트를 구분자로 끊은 토큰(2자 이상)과 주제명의 **양방향 부분일치**로
 * 판정한다("가족 얘기, 건강" → '가족' 제외). 전부 가려지면 원본을 유지한다 —
 * 이 계층은 주제 선택 가드일 뿐이고, 본문 금지는 프롬프트(buildSystemPrompt)가 담당한다.
 */
export function filterAvoidedBanks<T extends { topic: string }>(
  banks: T[],
  avoidTopics?: string | null,
): T[] {
  const text = (avoidTopics ?? '').trim()
  if (!text) return banks
  const tokens = text
    .split(/[\s,·/;|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return banks
  const avoided = (b: T) => tokens.some((t) => b.topic.includes(t) || t.includes(b.topic))
  const kept = banks.filter((b) => !avoided(b))
  return kept.length > 0 ? kept : banks
}

function shortQuote(t: string): string {
  const clean = t.replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const short = clean.length > 14 ? clean.slice(0, 14) + '…' : clean
  return `"${short}" 라고 하셨네요.`
}

// 어르신 프로필에 해당 주제의 재료(개인화 근거)가 있는지.
function hasProfileMaterial(bank: TopicBank, elder: ElderProfile): boolean {
  return (
    (bank.topic === '고향' && !!elder.hometown) ||
    (bank.topic === '가족' && !!elder.family) ||
    (bank.topic === '직업' && !!elder.job) ||
    (bank.topic === '취미' && !!elder.hobbies)
  )
}

// 어르신 발화 속 관심 주제 감지 — 어르신이 먼저 꺼낸 주제를 따라간다(person-centered).
const TOPIC_INTEREST_MAP: Record<string, string> = {
  고향: '고향', 동네: '고향', 시골: '고향',
  가족: '가족', 자녀: '가족', 딸: '가족', 아들: '가족', 손주: '가족', 손자: '가족',
  직업: '직업', 일: '직업', 장사: '직업', 농사: '직업',
  취미: '취미',
  학교: '학창 시절', 친구: '학창 시절',
  음식: '음식', 김치: '음식', 밥: '음식',
  노래: '노래', 라디오: '라디오',
}

function detectTopicInterest(text: string, banks: TopicBank[], excludeTopic?: string): TopicBank | null {
  for (const [keyword, topic] of Object.entries(TOPIC_INTEREST_MAP)) {
    if (topic !== excludeTopic && text.includes(keyword)) {
      const bank = banks.find((b) => b.topic === topic)
      if (bank) return bank
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// 2) 대화 이력에서 상태 신호 도출 (순수 — 외부 상태 없음)
// ─────────────────────────────────────────────────────────────

/**
 * 이력 끝에 현재 발화가 이미 추가돼 있으면 제거한다.
 * 클라이언트에 따라 history가 현재 발화를 포함하기도(웹: appendTurn 후 조회),
 * 포함하지 않기도 하므로 두 호출 형태를 모두 허용한다.
 */
export function historyBeforeUtterance(
  history: ConversationTurn[],
  lastUserText: string,
): ConversationTurn[] {
  const last = history[history.length - 1]
  if (last && last.speaker === 'Elderly' && last.text === lastUserText) {
    return history.slice(0, -1)
  }
  return history
}

interface DialogueState {
  /** 마지막 AI 주제(현재 주제). */
  currentTopic: string | undefined
  /** 현재 주제로 이어진 연속 AI 턴 수. */
  currentTopicRun: number
  /** 세션에서 사용한 주제 집합. */
  visitedTopics: Set<string>
  /** 어르신이 힘들어했던 주제(해당 주제 중 grief/distress/crisis 발화가 있던 주제). */
  sensitiveTopics: Set<string>
  /** 직전 어르신 발화의 관여도(현재 발화 제외). */
  prevEngagement: ReturnType<typeof assessEngagement> | null
  /** 현재 발화를 포함해 같은 상황이 몇 번 연속인지 셀 때 쓸 직전 어르신 상황들(최신순). */
  prevSituations: ReturnType<typeof assessUtterance>['situation'][]
}

function deriveDialogueState(history: ConversationTurn[]): DialogueState {
  const aiTurns = history.filter((t) => t.speaker === 'AI' && t.topic)
  const currentTopic = aiTurns.length > 0 ? aiTurns[aiTurns.length - 1].topic : undefined

  let currentTopicRun = 0
  for (let i = aiTurns.length - 1; i >= 0; i--) {
    if (aiTurns[i].topic === currentTopic) currentTopicRun++
    else break
  }

  const visitedTopics = new Set<string>()
  for (const t of aiTurns) visitedTopics.add(t.topic as string)

  // 어르신 발화를 시간순으로 훑으며 당시 AI 주제에 민감 신호를 귀속시킨다.
  const sensitiveTopics = new Set<string>()
  let topicAt: string | undefined
  const elderSituations: ReturnType<typeof assessUtterance>['situation'][] = []
  let lastElderText: string | null = null
  for (const turn of history) {
    if (turn.speaker === 'AI') {
      if (turn.topic) topicAt = turn.topic
    } else {
      const a = assessUtterance(turn.text)
      elderSituations.push(a.situation)
      lastElderText = turn.text
      if (topicAt && (a.situation === 'grief' || a.situation === 'distress' || a.situation === 'crisis')) {
        sensitiveTopics.add(topicAt)
      }
    }
  }

  return {
    currentTopic,
    currentTopicRun,
    visitedTopics,
    sensitiveTopics,
    prevEngagement: lastElderText !== null ? assessEngagement(lastElderText) : null,
    prevSituations: elderSituations.reverse(),
  }
}

/** 현재 상황을 포함한 연속 발생 횟수(직전 이력에서 같은 상황이 이어진 만큼 +1). */
function situationStreak(
  state: DialogueState,
  situation: ReturnType<typeof assessUtterance>['situation'],
): number {
  let streak = 1
  for (const s of state.prevSituations) {
    if (s === situation) streak++
    else break
  }
  return streak
}

// 다음 주제 선택: ① 미방문 + 비민감 + 프로필 재료 → ② 미방문 + 비민감 →
// ③ 비민감(현재 제외) → ④ 현재 제외 아무거나. 힘들어했던 주제로 되돌아가지 않는다.
function pickNextTopic(banks: TopicBank[], state: DialogueState, elder: ElderProfile): TopicBank {
  const notCurrent = banks.filter((b) => b.topic !== state.currentTopic)
  const fresh = notCurrent.filter(
    (b) => !state.visitedTopics.has(b.topic) && !state.sensitiveTopics.has(b.topic),
  )
  const freshWithMaterial = fresh.filter((b) => hasProfileMaterial(b, elder))
  if (freshWithMaterial.length > 0) return freshWithMaterial[0]
  if (fresh.length > 0) return fresh[0]
  const safe = notCurrent.filter((b) => !state.sensitiveTopics.has(b.topic))
  if (safe.length > 0) return safe[0]
  return notCurrent[0] ?? banks[0]
}

// ─────────────────────────────────────────────────────────────
// 3) 응답 생성
// ─────────────────────────────────────────────────────────────

export interface AiResponse {
  question: string
  topic: string
  switchTopic: boolean
}

const CLOSING_TOPIC = '마무리'
const SAFETY_TOPIC = '안전'

export function generateOpener(
  elder: ElderProfile,
  session: Session,
  chronicle: ChronicleEntry[],
): AiResponse {
  const banks = filterAvoidedBanks(getBanks(session.therapyType), session.design?.avoidTopics)

  if (chronicle.length > 0) {
    const recent = chronicle[0]
    for (const k of recent.keywords) {
      const bank = banks.find((b) => b.topic === TOPIC_INTEREST_MAP[k])
      if (bank) {
        return { question: bank.opener(elder), topic: bank.topic, switchTopic: false }
      }
    }
  }

  const fallback = banks.find((b) => hasProfileMaterial(b, elder)) || banks[0]
  return { question: fallback.opener(elder), topic: fallback.topic, switchTopic: false }
}

/**
 * 어르신 발화에 대한 상황 인지 응답. 위기·중단·거부·혼란·애도·침묵을 각각의
 * 원칙대로 처리하고, 일반 흐름은 관여도 신호로 진행·전환한다.
 * assessment를 넘기면 재평가를 생략한다(오케스트레이터에서 1회 평가 공유).
 */
export function generateReply(
  elder: ElderProfile,
  session: Session,
  history: ConversationTurn[],
  lastUserText: string,
  assessment?: UtteranceAssessment,
): AiResponse {
  const banks = filterAvoidedBanks(getBanks(session.therapyType), session.design?.avoidTopics)
  const state = deriveDialogueState(historyBeforeUtterance(history, lastUserText))
  const a = assessment ?? assessUtterance(lastUserText)
  const currentBank = banks.find((b) => b.topic === state.currentTopic) || banks[0]

  // ── 위기: 상담·진행이 아니라 안전 응답(에스컬레이션은 오케스트레이터가 수행) ──
  if (a.situation === 'crisis') {
    return {
      question: CRISIS_SAFE_REPLY[a.crisisCategories[0] ?? 'self_harm'],
      topic: SAFETY_TOPIC,
      switchTopic: true,
    }
  }

  // ── 중단·휴식 요청: 즉시 존중, 따뜻한 마무리 ──
  if (a.situation === 'rest_request') {
    return {
      question: `그럼요, 어르신. 오늘 이야기 나눠 주셔서 고마워요. 푹 쉬시고, 다음에 또 이야기해요.`,
      topic: CLOSING_TOPIC,
      switchTopic: true,
    }
  }

  // ── 거부·짜증: 사과하고 물러남. 반복되면 마무리 ──
  if (a.situation === 'refusal') {
    if (situationStreak(state, 'refusal') >= 2) {
      return {
        question: `제가 오늘 너무 여쭤봤지요. 미안해요, 어르신. 오늘은 여기까지 하고 편히 쉬세요.`,
        topic: CLOSING_TOPIC,
        switchTopic: true,
      }
    }
    return {
      question: `아이고, 제가 너무 여쭤봤나 봐요. 미안해요. 천천히, 이야기하고 싶어지시면 그때 말씀해 주세요.`,
      topic: state.currentTopic ?? currentBank.topic,
      switchTopic: false,
    }
  }

  // ── 혼란: 교정하지 않고 재소개(AI 고지)·안심·쉬운 재질문 ──
  if (a.situation === 'confusion') {
    if (situationStreak(state, 'confusion') >= 2) {
      return {
        question:
          `괜찮아요, 어르신. 저는 어르신 이야기를 들어드리는 인공지능 친구예요. ` +
          `제가 여기 같이 있으니 안심하세요. 천천히, 편하게 계셔도 돼요.`,
        topic: state.currentTopic ?? currentBank.topic,
        switchTopic: false,
      }
    }
    return {
      question:
        `놀라지 마세요, 어르신. 저는 어르신과 이야기 나누는 말동무, 인공지능 친구예요. ` +
        `여기는 안전한 곳이에요. ${currentBank.simple(elder)}`,
      topic: state.currentTopic ?? currentBank.topic,
      switchTopic: false,
    }
  }

  // ── 급성 고통: 지지 우선. 이어지면 편안한 주제로 부드럽게 ──
  if (a.situation === 'distress') {
    if (situationStreak(state, 'distress') >= 2) {
      const next = pickNextTopic(banks, state, elder)
      return {
        question: `많이 힘드셨지요. 말씀해 주셔서 고마워요. 우리 잠깐 숨 한번 쉬고요. ${next.simple(elder)}`,
        topic: next.topic,
        switchTopic: true,
      }
    }
    return {
      question: `많이 힘드셨겠어요, 어르신. 그런 말씀 해주셔서 고마워요. 제가 여기서 듣고 있을게요. 더 하고 싶은 말씀 있으세요?`,
      topic: state.currentTopic ?? currentBank.topic,
      switchTopic: false,
    }
  }

  // ── 애도·그리움: 회피 금지. 공감으로 받고 어르신이 선택하게 한다 ──
  if (a.situation === 'grief') {
    const griefStreak = situationStreak(state, 'grief')
    if (griefStreak >= 3) {
      // 침잠이 길어지면 부드럽게 따뜻한 주제로(민감 주제 제외).
      const next = pickNextTopic(banks, state, elder)
      return {
        question: `귀한 이야기 들려주셔서 고마워요. 마음이 많이 쓰이셨겠어요. ${next.opener(elder)}`,
        topic: next.topic,
        switchTopic: true,
      }
    }
    if (griefStreak === 2) {
      // 이어지는 그리움에는 같은 말을 반복하지 않고, 고인과의 따뜻한 기억을 청한다.
      return {
        question:
          `네… 얼마나 보고 싶으시겠어요. 제가 곁에서 듣고 있어요. ` +
          `그분과 함께한 기억 중에 제일 따뜻했던 순간은 언제였어요?`,
        topic: state.currentTopic ?? currentBank.topic,
        switchTopic: false,
      }
    }
    return {
      question:
        `많이 그리우시지요. 그런 마음이 드는 게 당연해요. ` +
        `그분 이야기 더 들려주셔도 좋고, 힘드시면 다른 이야기를 해도 괜찮아요.`,
      topic: state.currentTopic ?? currentBank.topic,
      switchTopic: false,
    }
  }

  // ── 침묵: 단계적으로 — 재질문 → 쉬운 주제 → 휴식 제안 ──
  if (a.situation === 'silence') {
    const streak = situationStreak(state, 'silence')
    if (streak >= 3) {
      return {
        question: `오늘은 말씀이 좀 힘드신가 봐요. 괜찮아요, 어르신. 오늘은 여기까지 하고 편히 쉬세요.`,
        topic: CLOSING_TOPIC,
        switchTopic: true,
      }
    }
    if (streak === 2) {
      const next = pickNextTopic(banks, state, elder)
      return {
        question: `천천히 하셔도 돼요. ${next.simple(elder)}`,
        topic: next.topic,
        switchTopic: true,
      }
    }
    return {
      question: `괜찮아요, 어르신. 천천히 생각나는 대로 말씀해 주세요. ${currentBank.simple(elder)}`,
      topic: state.currentTopic ?? currentBank.topic,
      switchTopic: false,
    }
  }

  // ── 일반 흐름 ──

  // 어르신이 먼저 꺼낸 다른 주제가 있으면 따라간다(어르신 주도).
  const interest = detectTopicInterest(lastUserText, banks, state.currentTopic)
  if (interest) {
    return {
      question: `${shortQuote(lastUserText)} 그 이야기 더 듣고 싶어요. ${interest.opener(elder)}`,
      topic: interest.topic,
      switchTopic: true,
    }
  }

  const engagement = assessEngagement(lastUserText)

  // 저관여: 처음엔 같은 주제를 더 쉽게(스캐폴딩), 연속되면 다른 쉬운 주제로.
  if (engagement === 'low') {
    if (state.prevEngagement === 'low' || state.prevEngagement === 'silent') {
      const next = pickNextTopic(banks, state, elder)
      return {
        question: `괜찮아요. 그럼 다른 이야기 해볼까요? ${next.simple(elder)}`,
        topic: next.topic,
        switchTopic: true,
      }
    }
    return {
      question: `천천히 하셔도 돼요. ${currentBank.simple(elder)}`,
      topic: currentBank.topic,
      switchTopic: false,
    }
  }

  // 진행: 후속 질문 풀에서 다음 질문. 풀 소진 시 다리 문장과 함께 주제 이동.
  const followupIndex = Math.max(0, state.currentTopicRun - 1)
  if (followupIndex >= currentBank.followups.length) {
    const next = pickNextTopic(banks, state, elder)
    return {
      question: `${currentBank.bridge()} ${next.opener(elder)}`,
      topic: next.topic,
      switchTopic: true,
    }
  }
  return {
    question: currentBank.followups[followupIndex](lastUserText, elder),
    topic: currentBank.topic,
    switchTopic: false,
  }
}

// ─────────────────────────────────────────────────────────────
// 4) 자동 연대기 추출
// ─────────────────────────────────────────────────────────────

interface ExtractRule {
  topic: string
  keywords: string[]
  minContent: number
}
const RULES: ExtractRule[] = [
  { topic: '고향',    keywords: ['고향', '동네', '시골', '전주', '서울', '부산', '대구', '광주', '제주', '강원', '경상', '전라', '충청'], minContent: 6 },
  { topic: '가족',    keywords: ['아내', '남편', '딸', '아들', '손자', '손녀', '며느리', '사위', '어머니', '아버지', '형제', '자매', '오빠', '누나', '동생'], minContent: 6 },
  { topic: '직업',    keywords: ['일', '직장', '공장', '회사', '식당', '농사', '장사', '가게', '공무원', '선생', '간호', '기술'], minContent: 6 },
  { topic: '취미',    keywords: ['텃밭', '꽃', '낚시', '바둑', '화투', '노래', '운동', '뜨개질', '서예', '그림'], minContent: 4 },
  { topic: '음식',    keywords: ['김치', '된장', '국수', '떡', '밥', '국', '잔치', '명절', '음식', '국밥', '나물'], minContent: 5 },
  { topic: '학창 시절', keywords: ['학교', '친구', '선생', '학창', '소학교', '국민학교', '중학', '고등'], minContent: 5 },
  { topic: '음악',    keywords: ['노래', '음악', '라디오', '가수', '곡', '소절'], minContent: 4 },
]

export interface ExtractedChronicle {
  topic: string
  content: string
  keywords: string[]
}

export function extractChronicle(text: string): ExtractedChronicle | null {
  const t = text.trim()
  if (t.length < 6) return null
  // 위기 발화는 '추억'으로 축적하지 않는다(안전 이벤트로만 기록).
  if (assessUtterance(t).situation === 'crisis') return null
  for (const rule of RULES) {
    const matched = rule.keywords.filter((k) => t.includes(k))
    if (matched.length > 0 && t.length >= rule.minContent) {
      return { topic: rule.topic, content: t, keywords: matched }
    }
  }
  return null
}

export function buildChronicleEntry(
  elderId: string,
  extracted: ExtractedChronicle,
): ChronicleEntry {
  const ts = nowIso()
  return {
    id: uid('chr_'),
    elderId,
    topic: extracted.topic,
    content: extracted.content,
    keywords: extracted.keywords,
    source: 'AI',
    recordedAt: ts,
    updatedAt: ts,
  }
}

// ─────────────────────────────────────────────────────────────
// 5) 보호자 리포트 자동 생성
// ─────────────────────────────────────────────────────────────

const LONGING_KEYWORDS = ['그립', '보고싶', '그리워', '예전', '돌아가', '아버지', '어머니', '남편', '아내']
const BRIGHT_KEYWORDS = ['좋아', '재미', '웃', '행복', '예뻤', '맛있', '신났', '기뻤']
const CALM_KEYWORDS = ['편안', '조용', '천천히', '그냥', '잔잔']

function detectEmotion(text: string): EmotionTone {
  const longing = LONGING_KEYWORDS.some((k) => text.includes(k))
  const bright = BRIGHT_KEYWORDS.some((k) => text.includes(k))
  const calm = CALM_KEYWORDS.some((k) => text.includes(k))

  if (longing && bright) return 'mixed'
  if (longing) return 'longing'
  if (bright) return 'bright'
  if (calm) return 'calm'
  if (!text.trim()) return 'quiet'
  return 'calm'
}

export function generateGuardianReport(
  elder: ElderProfile,
  turns: ConversationTurn[],
  newChronicleCount: number,
): GuardianReport {
  const elderlyTurns = turns.filter((t) => t.speaker === 'Elderly')
  const allElderlyText = elderlyTurns.map((t) => t.text).join(' ')

  // 자주 언급된 주제 — AI가 추출한 키워드 빈도
  const keywordCount = new Map<string, number>()
  for (const t of elderlyTurns) {
    if (t.extractedKeywords) {
      for (const k of t.extractedKeywords) {
        keywordCount.set(k, (keywordCount.get(k) || 0) + 1)
      }
    }
  }
  const highlightTopics = [...keywordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)

  const tone = detectEmotion(allElderlyText)
  const calling =
    elder.guardian?.relation === '아들' || elder.guardian?.relation === '딸'
      ? `${elder.name === '이순자' ? '어머니' : '부모님'}께서`
      : `${elder.name} 어르신께서`

  let headline: string
  let body: string

  if (elderlyTurns.length === 0) {
    headline = `오늘 ${calling} 말씀이 많지 않으셨어요.`
    body = `짧은 대화였지만 다음번엔 더 편안하게 이야기 나누실 수 있도록 도와드릴게요.`
  } else if (highlightTopics.length > 0) {
    const topicWord = highlightTopics[0]
    headline = `오늘 ${calling} ${topicWord} 이야기를 오래 하셨어요.`

    const toneSentence: Record<EmotionTone, string> = {
      bright:  `이야기하시는 동안 표정이 밝아 보이셨고, 즐거운 기억이 많이 떠오르신 것 같아요 😊`,
      longing: `지난날을 그리워하시는 마음이 느껴졌어요. 한번 전화 드리시면 좋을 것 같아요.`,
      calm:    `차분하게 한 말씀 한 말씀 또박또박 들려주셨어요. 마음이 편안하신 듯해요 🌿`,
      mixed:   `즐거운 추억과 그리움이 함께 묻어났어요. 오늘 마음이 잔잔히 흔들리신 듯해요.`,
      quiet:   `말수는 적으셨지만 차분히 들으시며 함께 시간을 보내셨어요.`,
    }

    const otherTopics =
      highlightTopics.length > 1
        ? ` 그러다가 ${highlightTopics.slice(1).join('·')} 이야기도 나왔어요.`
        : ''

    body = `${toneSentence[tone]}${otherTopics}`
  } else {
    headline = `오늘 ${calling} ${elderlyTurns.length}번 정도 대화를 나누셨어요.`
    body = `평소처럼 차분히 이야기 나누셨고, 큰 동요 없이 잘 지내고 계세요.`
  }

  return {
    emotionTone: tone,
    headline,
    body,
    highlightTopics,
    newChronicleCount,
  }
}

// ─────────────────────────────────────────────────────────────
// AIProvider — 실연동 전환을 위한 교체 지점
// ─────────────────────────────────────────────────────────────
//
// 실 서비스에서는 동일 인터페이스를 만족하는 provider를 Edge Function
// 백엔드(프런티어 LLM + Structured Outputs)로 교체한다. 안전 규칙은 provider와
// 무관하게 conversation.ts(오케스트레이터)와 safety.ts(전·후 가드)가 강제한다.

export interface AIProvider {
  generateOpener(elder: ElderProfile, session: Session, chronicle: ChronicleEntry[]): AiResponse
  generateReply(
    elder: ElderProfile,
    session: Session,
    history: ConversationTurn[],
    lastUserText: string,
    assessment?: UtteranceAssessment,
  ): AiResponse
  extractChronicle(text: string): ExtractedChronicle | null
  buildChronicleEntry(elderId: string, extracted: ExtractedChronicle): ChronicleEntry
  generateGuardianReport(
    elder: ElderProfile,
    turns: ConversationTurn[],
    newChronicleCount: number,
  ): GuardianReport
}

export const MockAIProvider: AIProvider = {
  generateOpener,
  generateReply,
  extractChronicle,
  buildChronicleEntry,
  generateGuardianReport,
}
