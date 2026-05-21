import type {
  ChronicleEntry,
  ConversationTurn,
  ElderProfile,
  EmotionTone,
  GuardianReport,
  Session,
  TherapyType,
} from '../types';
import { uid, nowIso } from './utils';

// Mock LLM — 본 서비스에서는 GPT-4o가 담당.
// 모든 함수의 시그니처는 본 서비스 전환 시 그대로 유지 가능.

// ─────────────────────────────────────────────────────────────
// 1) 회상치료 — 연대기 기반 자연스러운 대화
// ─────────────────────────────────────────────────────────────

interface TopicBank {
  topic: string;
  opener: (e: ElderProfile) => string;
  followup: (lastUserText: string) => string;
  switch: () => string;
}

const REMINISCENCE_BANKS: TopicBank[] = [
  {
    topic: '고향',
    opener: (e) =>
      e.hometown
        ? `어르신, ${e.hometown}에서 오래 사셨다고 들었어요. 그곳에서 제일 기억에 남는 게 뭐예요?`
        : `어르신 고향은 어디세요? 어렸을 때 살던 동네 이야기 좀 들려주실래요?`,
    followup: (t) => `${shortQuote(t)} 그때 동네 사람들은 어떤 분들이셨어요?`,
    switch: () => `그러셨군요. 이번엔 그때 같이 어울리던 친구들 이야기도 듣고 싶어요.`,
  },
  {
    topic: '가족',
    opener: (e) =>
      e.family
        ? `${e.family} — 가족 이야기를 들으면 어르신 표정이 좋아지실 거 같아요. 자녀분 어렸을 적 이야기 하나만 들려주세요.`
        : `어르신, 가족 중에 가장 자주 떠오르는 분은 누구세요?`,
    followup: (t) => `${shortQuote(t)} 그분이 어떤 분이셨길래 가장 기억에 남으세요?`,
    switch: () => `가족 이야기 정말 따뜻하네요. 이번엔 같이 보내신 명절 이야기도 듣고 싶어요.`,
  },
  {
    topic: '직업',
    opener: (e) =>
      e.job
        ? `어르신, ${e.job} 하셨다고요. 그때 가장 보람 있었던 순간이 언제예요?`
        : `젊은 시절엔 어떤 일 하셨어요?`,
    followup: (t) => `${shortQuote(t)} 그 일을 하면서 어떤 점이 가장 어려우셨어요?`,
    switch: () => `일 이야기 들으니 정말 대단하세요. 이제 그때 동료분들 이야기도 들려주세요.`,
  },
  {
    topic: '취미',
    opener: (e) =>
      e.hobbies
        ? `${e.hobbies} 좋아하신다고요. 요즘에도 자주 하세요?`
        : `요즘 시간 보내실 때 뭐 하시는 게 제일 좋으세요?`,
    followup: (t) => `${shortQuote(t)} 처음 시작하시게 된 계기가 있으세요?`,
    switch: () => `재미있게 들었어요. 이번엔 어렸을 적 즐기시던 놀이 이야기 들려주세요.`,
  },
  {
    topic: '음식',
    opener: () => `어르신, 어릴 때 어머니가 해주시던 음식 중에 제일 기억에 남는 게 뭐예요?`,
    followup: (t) => `${shortQuote(t)} 그 음식 만드는 법, 아직 기억하세요?`,
    switch: () => `맛있는 이야기 잘 들었어요. 잔칫날 먹던 음식 이야기도 들려주세요.`,
  },
  {
    topic: '학창 시절',
    opener: () => `어르신, 학교 다니실 때 제일 친했던 친구 이름이 뭐예요?`,
    followup: (t) => `${shortQuote(t)} 그 친구랑은 주로 뭘 하고 놀았어요?`,
    switch: () => `친구 이야기 좋네요. 그때 학교에서 좋아하셨던 선생님 이야기도 듣고 싶어요.`,
  },
];

// ─────────────────────────────────────────────────────────────
// 2) 인지자극 — 가벼운 퀴즈·낱말놀이
// ─────────────────────────────────────────────────────────────

const COGNITIVE_BANKS: TopicBank[] = [
  {
    topic: '계절',
    opener: () => `어르신, 지금이 무슨 계절이지요? 이 계절 하면 제일 먼저 떠오르는 게 뭐예요?`,
    followup: (t) => `${shortQuote(t)} 그럼 그 계절에 어울리는 음식은 뭐가 있을까요?`,
    switch: () => `좋아요. 이번엔 다른 놀이 하나 해볼까요? 끝말잇기 한번 해봐요. 어르신 먼저 "사과" 다음 단어는요?`,
  },
  {
    topic: '숫자',
    opener: () => `어르신, 1부터 10까지 거꾸로 한번 세어볼까요? 천천히 같이 가요. 10, 9... 다음은요?`,
    followup: (t) => `네 잘하셨어요. ${shortQuote(t)} 그럼 이번엔 7 빼기 3은 얼마지요?`,
    switch: () => `좋습니다. 이번엔 단어를 떠올려볼까요? "ㄱ"으로 시작하는 과일 하나만 말씀해 주세요.`,
  },
  {
    topic: '낱말',
    opener: () => `끝말잇기 한 판 해볼까요? 제가 먼저 시작할게요. "사과". 다음 단어는요?`,
    followup: (t) => `${shortQuote(t)} 좋아요. 그럼 그 단어 끝 글자로 다음 단어 하나 더 부탁드려요.`,
    switch: () => `오늘 머리 잘 돌아가시네요. 그럼 이번엔 옛날에 자주 부르시던 노래 한 곡 떠올려 볼까요?`,
  },
];

// ─────────────────────────────────────────────────────────────
// 3) 음악감상 — 옛 노래 회상
// ─────────────────────────────────────────────────────────────

const MUSIC_BANKS: TopicBank[] = [
  {
    topic: '노래',
    opener: () => `어르신, 젊으셨을 적에 자주 부르시던 노래가 있으세요? 한 소절만 떠올려 주실 수 있을까요?`,
    followup: (t) => `${shortQuote(t)} 그 노래 들으면 어떤 장면이 떠오르세요?`,
    switch: () => `좋네요. 그럼 결혼식 때나 잔칫날에 들으셨던 노래는 어떤 게 기억나세요?`,
  },
  {
    topic: '라디오',
    opener: () => `예전엔 라디오에서 노래 많이 들으셨지요. 라디오 켜놓고 뭐 하셨어요?`,
    followup: (t) => `${shortQuote(t)} 그때 라디오에서 자주 나오던 노래 가운데 기억나는 곡 있으세요?`,
    switch: () => `좋습니다. 그럼 이번엔 어릴 적 어머니가 흥얼거리시던 노래 떠올려 보실래요?`,
  },
];

// ─────────────────────────────────────────────────────────────
// 4) 미술회상 — 풍경·그림 떠올리기
// ─────────────────────────────────────────────────────────────

const ART_BANKS: TopicBank[] = [
  {
    topic: '풍경',
    opener: () => `어르신, 눈 감고 가장 좋아하시는 풍경 하나 떠올려 보세요. 어떤 모습이 보이세요?`,
    followup: (t) => `${shortQuote(t)} 그 장면에서 어떤 색이 제일 진하게 떠오르세요?`,
    switch: () => `정말 그림 같네요. 이번엔 어렸을 적 골목길 풍경 떠올려 보실까요?`,
  },
  {
    topic: '색',
    opener: () => `어르신이 제일 좋아하시는 색은 무슨 색이세요? 그 색 하면 떠오르는 게 뭐예요?`,
    followup: (t) => `${shortQuote(t)} 그 색깔 옷을 입었던 날 기억나세요?`,
    switch: () => `좋아요. 이번엔 봄 들판 떠올려 볼까요? 어떤 꽃이 보이세요?`,
  },
];

function getBanks(type: TherapyType): TopicBank[] {
  switch (type) {
    case 'cognitive': return COGNITIVE_BANKS;
    case 'music':     return MUSIC_BANKS;
    case 'art':       return ART_BANKS;
    case 'reminiscence':
    default:          return REMINISCENCE_BANKS;
  }
}

function shortQuote(t: string): string {
  const clean = t.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const short = clean.length > 14 ? clean.slice(0, 14) + '…' : clean;
  return `"${short}" 라고 하셨네요.`;
}

const NEGATIVE_KEYWORDS = ['죽', '돌아가', '사별', '전쟁', '아프', '병원', '슬프', '외로'];
function detectNegative(text: string): boolean {
  return NEGATIVE_KEYWORDS.some((k) => text.includes(k));
}

const TOO_SHORT = 4;
function isLowEngagement(text: string): boolean {
  const t = text.trim();
  return t.length < TOO_SHORT || /^(네|아니|모르|글쎄|음)\.?$/.test(t);
}

function pickBankByKeywords(banks: TopicBank[], keywords: string[]): TopicBank | null {
  const map: Record<string, string> = {
    고향: '고향', 동네: '고향', 시골: '고향',
    가족: '가족', 자녀: '가족', 딸: '가족', 아들: '가족',
    직업: '직업', 일: '직업',
    취미: '취미',
    학교: '학창 시절', 친구: '학창 시절',
    음식: '음식', 김치: '음식',
    노래: '노래',
  };
  for (const k of keywords) {
    const t = map[k];
    if (t) {
      const b = banks.find((x) => x.topic === t);
      if (b) return b;
    }
  }
  return null;
}

export interface AiResponse {
  question: string;
  topic: string;
  switchTopic: boolean;
}

export function generateOpener(
  elder: ElderProfile,
  session: Session,
  chronicle: ChronicleEntry[]
): AiResponse {
  const banks = getBanks(session.therapyType);

  if (chronicle.length > 0) {
    const recent = chronicle[0];
    const fromChronicle = pickBankByKeywords(banks, recent.keywords);
    if (fromChronicle) {
      return { question: fromChronicle.opener(elder), topic: fromChronicle.topic, switchTopic: false };
    }
  }

  // 어르신 정보에 따라 첫 주제 선택
  const has = (b: TopicBank) =>
    (b.topic === '고향' && !!elder.hometown) ||
    (b.topic === '가족' && !!elder.family) ||
    (b.topic === '직업' && !!elder.job) ||
    (b.topic === '취미' && !!elder.hobbies);
  const fallback = banks.find(has) || banks[0];
  return { question: fallback.opener(elder), topic: fallback.topic, switchTopic: false };
}

export function generateReply(
  elder: ElderProfile,
  session: Session,
  history: ConversationTurn[],
  lastUserText: string
): AiResponse {
  const banks = getBanks(session.therapyType);

  const recentAiTopics = history
    .filter((t) => t.speaker === 'AI' && t.topic)
    .slice(-3)
    .map((t) => t.topic as string);

  const lastAiTopic = recentAiTopics[recentAiTopics.length - 1];
  const currentBank = banks.find((b) => b.topic === lastAiTopic) || banks[0];

  // 1) 부정/고통 키워드 감지 → 강제 주제 전환
  if (detectNegative(lastUserText)) {
    const next = nextDifferentTopic(banks, recentAiTopics, elder);
    return {
      question: `네… 잘 들었어요. ${next.opener(elder)}`,
      topic: next.topic,
      switchTopic: true,
    };
  }

  // 2) 동일 주제 3회 연속 → 주제 전환
  const sameCount = recentAiTopics.filter((t) => t === lastAiTopic).length;
  if (sameCount >= 2) {
    const next = nextDifferentTopic(banks, recentAiTopics, elder);
    return {
      question: `${currentBank.switch()} ${next.opener(elder)}`,
      topic: next.topic,
      switchTopic: true,
    };
  }

  // 3) 짧은 답변 / 침묵 → 주제 전환 (더 쉬운 주제)
  if (isLowEngagement(lastUserText)) {
    const next = nextDifferentTopic(banks, recentAiTopics, elder);
    return {
      question: `괜찮으세요. 그럼 다른 이야기 해볼까요? ${next.opener(elder)}`,
      topic: next.topic,
      switchTopic: true,
    };
  }

  // 4) 일반 후속 질문
  return {
    question: currentBank.followup(lastUserText),
    topic: currentBank.topic,
    switchTopic: false,
  };
}

function nextDifferentTopic(banks: TopicBank[], recent: string[], elder: ElderProfile): TopicBank {
  const seen = new Set(recent);
  const candidates = banks.filter((b) => !seen.has(b.topic));
  if (candidates.length === 0) return banks[Math.floor(Math.random() * banks.length)];
  const has = (b: TopicBank) =>
    (b.topic === '고향' && !!elder.hometown) ||
    (b.topic === '가족' && !!elder.family) ||
    (b.topic === '직업' && !!elder.job) ||
    (b.topic === '취미' && !!elder.hobbies);
  return candidates.find(has) || candidates[0];
}

// ─────────────────────────────────────────────────────────────
// 5) 자동 연대기 추출
// ─────────────────────────────────────────────────────────────

interface ExtractRule {
  topic: string;
  keywords: string[];
  minContent: number;
}
const RULES: ExtractRule[] = [
  { topic: '고향',    keywords: ['고향', '동네', '시골', '전주', '서울', '부산', '대구', '광주', '제주', '강원', '경상', '전라', '충청'], minContent: 6 },
  { topic: '가족',    keywords: ['아내', '남편', '딸', '아들', '손자', '손녀', '며느리', '사위', '어머니', '아버지', '형제', '자매', '오빠', '누나', '동생'], minContent: 6 },
  { topic: '직업',    keywords: ['일', '직장', '공장', '회사', '식당', '농사', '장사', '가게', '공무원', '선생', '간호', '기술'], minContent: 6 },
  { topic: '취미',    keywords: ['텃밭', '꽃', '낚시', '바둑', '화투', '노래', '운동', '뜨개질', '서예', '그림'], minContent: 4 },
  { topic: '음식',    keywords: ['김치', '된장', '국수', '떡', '밥', '국', '잔치', '명절', '음식', '국밥', '나물'], minContent: 5 },
  { topic: '학창 시절', keywords: ['학교', '친구', '선생', '학창', '소학교', '국민학교', '중학', '고등'], minContent: 5 },
  { topic: '음악',    keywords: ['노래', '음악', '라디오', '가수', '곡', '소절'], minContent: 4 },
];

export interface ExtractedChronicle {
  topic: string;
  content: string;
  keywords: string[];
}

export function extractChronicle(text: string): ExtractedChronicle | null {
  const t = text.trim();
  if (t.length < 6) return null;
  for (const rule of RULES) {
    const matched = rule.keywords.filter((k) => t.includes(k));
    if (matched.length > 0 && t.length >= rule.minContent) {
      return { topic: rule.topic, content: t, keywords: matched };
    }
  }
  return null;
}

export function buildChronicleEntry(
  elderId: string,
  extracted: ExtractedChronicle
): ChronicleEntry {
  const ts = nowIso();
  return {
    id: uid('chr_'),
    elderId,
    topic: extracted.topic,
    content: extracted.content,
    keywords: extracted.keywords,
    source: 'AI',
    recordedAt: ts,
    updatedAt: ts,
  };
}

// ─────────────────────────────────────────────────────────────
// 6) 보호자 리포트 자동 생성
// ─────────────────────────────────────────────────────────────

const LONGING_KEYWORDS = ['그립', '보고싶', '그리워', '예전', '돌아가', '아버지', '어머니', '남편', '아내'];
const BRIGHT_KEYWORDS = ['좋아', '재미', '웃', '행복', '예뻤', '맛있', '신났', '기뻤'];
const CALM_KEYWORDS = ['편안', '조용', '천천히', '그냥', '잔잔'];

function detectEmotion(text: string): EmotionTone {
  const longing = LONGING_KEYWORDS.some((k) => text.includes(k));
  const bright = BRIGHT_KEYWORDS.some((k) => text.includes(k));
  const calm = CALM_KEYWORDS.some((k) => text.includes(k));

  if (longing && bright) return 'mixed';
  if (longing) return 'longing';
  if (bright) return 'bright';
  if (calm) return 'calm';
  if (!text.trim()) return 'quiet';
  return 'calm';
}

export function generateGuardianReport(
  elder: ElderProfile,
  turns: ConversationTurn[],
  newChronicleCount: number
): GuardianReport {
  const elderlyTurns = turns.filter((t) => t.speaker === 'Elderly');
  const allElderlyText = elderlyTurns.map((t) => t.text).join(' ');

  // 자주 언급된 주제 — AI가 추출한 키워드 빈도
  const keywordCount = new Map<string, number>();
  for (const t of elderlyTurns) {
    if (t.extractedKeywords) {
      for (const k of t.extractedKeywords) {
        keywordCount.set(k, (keywordCount.get(k) || 0) + 1);
      }
    }
  }
  const highlightTopics = [...keywordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const tone = detectEmotion(allElderlyText);
  const calling =
    elder.guardian?.relation === '아들' || elder.guardian?.relation === '딸'
      ? `${elder.name === '이순자' ? '어머니' : '부모님'}께서`
      : `${elder.name} 어르신께서`;

  // 헤드라인
  let headline: string;
  let body: string;

  if (elderlyTurns.length === 0) {
    headline = `오늘 ${calling} 말씀이 많지 않으셨어요.`;
    body = `짧은 대화였지만 다음번엔 더 편안하게 이야기 나누실 수 있도록 도와드릴게요.`;
  } else if (highlightTopics.length > 0) {
    const topicWord = highlightTopics[0];
    headline = `오늘 ${calling} ${topicWord} 이야기를 오래 하셨어요.`;

    const toneSentence: Record<EmotionTone, string> = {
      bright:  `이야기하시는 동안 표정이 밝아 보이셨고, 즐거운 기억이 많이 떠오르신 것 같아요 😊`,
      longing: `지난날을 그리워하시는 마음이 느껴졌어요. 한번 전화 드리시면 좋을 것 같아요.`,
      calm:    `차분하게 한 말씀 한 말씀 또박또박 들려주셨어요. 마음이 편안하신 듯해요 🌿`,
      mixed:   `즐거운 추억과 그리움이 함께 묻어났어요. 오늘 마음이 잔잔히 흔들리신 듯해요.`,
      quiet:   `말수는 적으셨지만 차분히 들으시며 함께 시간을 보내셨어요.`,
    };

    const otherTopics =
      highlightTopics.length > 1
        ? ` 그러다가 ${highlightTopics.slice(1).join('·')} 이야기도 나왔어요.`
        : '';

    body = `${toneSentence[tone]}${otherTopics}`;
  } else {
    headline = `오늘 ${calling} ${elderlyTurns.length}번 정도 대화를 나누셨어요.`;
    body = `평소처럼 차분히 이야기 나누셨고, 큰 동요 없이 잘 지내고 계세요.`;
  }

  return {
    emotionTone: tone,
    headline,
    body,
    highlightTopics,
    newChronicleCount,
  };
}
