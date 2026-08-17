// 목업 데이터 — Figma 디자인의 예시 콘텐츠를 그대로 시드(이순자 어르신 등).
// Supabase 실연동 전 시연·개발용. 실데이터는 @giokon/data 훅으로 대체된다.

import {
  analyzeSession,
  DEFAULT_APPEARANCE,
  type ChronicleEntry,
  type ConversationLog,
  type ConversationTurn,
  type ElderProfile,
  type Session,
  type SessionAnalysis,
} from '@giokon/core';

const YEAR = 2026;

function elder(
  id: string,
  name: string,
  age: number,
  extra: Partial<ElderProfile> = {},
): ElderProfile {
  const createdAt = `2026-05-0${(id.length % 8) + 1}T09:00:00.000Z`;
  return {
    id,
    name,
    birthYear: YEAR - age,
    avatarColor: '#f6cda0',
    appearance: DEFAULT_APPEARANCE,
    createdAt,
    updatedAt: createdAt,
    ...extra,
  };
}

// 성별은 이제 ElderProfile.gender(DB profiles.gender)로 표현한다 — 목업 상수 제거.

/** 카드에 표기할 '최근 대화' 라벨(코스메틱 시드). */
export const ELDER_LAST_TALK: Record<string, string> = {
  eld_lee: '오늘',
  eld_park: '6월 20일',
  eld_kim: '6월 19일',
  eld_choio: '6월 15일',
  eld_choise: '없음',
};

export const MOCK_ELDERS: ElderProfile[] = [
  elder('eld_lee', '이순자', 83, {
    birthDate: '1943-03-12',
    gender: 'female',
    hometown: '전라북도 전주시',
    family: '2녀, 사위 2명, 손자 3명',
    job: '식당 운영, 30년',
    hobbies: '텃밭 가꾸기',
    updatedAt: '2026-06-24T09:20:00.000Z',
  }),
  elder('eld_park', '박만수', 79, { birthDate: '1947-08-05', gender: 'male', hometown: '경상남도 진주시', job: '농사', hobbies: '바둑' }),
  elder('eld_kim', '김영희', 71, { birthDate: '1955-01-22', gender: 'female', hometown: '서울', family: '아들 하나', hobbies: '노래' }),
  elder('eld_choio', '최옥순', 86, { birthDate: '1940-06-30', gender: 'female', hometown: '충청북도 청주시', hobbies: '뜨개질' }),
  elder('eld_choise', '최성호', 73, { birthDate: '1953-11-17', gender: 'male', hometown: '강원도 강릉시', job: '어부' }),
];

export const MOCK_CHRONICLES: ChronicleEntry[] = [
  {
    id: 'chr_lee_1',
    elderId: 'eld_lee',
    topic: '고향',
    content: '내 오랜 고향 전주. 남부시장 근처에서 오래 살았지.',
    keywords: ['고향', '전주', '시장'],
    source: 'Caregiver',
    recordedAt: '2026-06-10T09:00:00.000Z',
    updatedAt: '2026-06-10T09:00:00.000Z',
  },
  {
    id: 'chr_lee_2',
    elderId: 'eld_lee',
    topic: '가족',
    content: '남편과 처음 만난 장터. 그날 비가 왔는데 우산을 씌워줬어.',
    keywords: ['남편', '장터', '가족'],
    source: 'Caregiver',
    recordedAt: '2026-06-10T09:05:00.000Z',
    updatedAt: '2026-06-10T09:05:00.000Z',
  },
  {
    id: 'chr_lee_3',
    elderId: 'eld_lee',
    topic: '가족',
    content: '첫째 딸 결혼식. 온 식구가 모여 참 기뻤지.',
    keywords: ['딸', '결혼식', '가족'],
    source: 'Caregiver',
    recordedAt: '2026-06-10T09:10:00.000Z',
    updatedAt: '2026-06-10T09:10:00.000Z',
  },
];

function session(id: string, title: string, date: string, minutes: number): Session {
  return {
    id,
    title,
    therapyType: 'reminiscence',
    durationMinutes: minutes,
    elderId: 'eld_lee',
    createdAt: date,
    updatedAt: date,
  };
}

export const MOCK_SESSIONS: Session[] = [
  session('ses_lee_1', '시장 상인으로 일했던 때', '2026-06-24T09:20:00.000Z', 12),
  session('ses_lee_2', '가족과의 여행', '2026-06-21T10:00:00.000Z', 9),
  session('ses_lee_3', '결혼과 새로운 시작', '2026-06-19T10:00:00.000Z', 11),
  session('ses_lee_4', '전주에서의 어린 시절', '2026-06-14T10:00:00.000Z', 7),
];

function turn(
  speaker: ConversationTurn['speaker'],
  text: string,
  ts: string,
  topic?: string,
  extractedKeywords?: string[],
): ConversationTurn {
  return { id: `t_${ts}_${speaker}`, speaker, text, timestamp: ts, topic, extractedKeywords };
}

// 단일 대화 분석·대화기록 화면과 일치하는 시드 로그(시장 상인 세션).
const D = '2026-06-24T';
export const MOCK_LOGS: ConversationLog[] = [
  {
    id: 'log_lee_1',
    sessionId: 'ses_lee_1',
    elderId: 'eld_lee',
    therapyType: 'reminiscence',
    status: 'ended',
    startedAt: `${D}09:20:00.000Z`,
    endedAt: `${D}09:32:34.000Z`,
    chronicleEntriesAdded: [],
    turns: [
      turn('AI', '전주에서 오래 사셨다고 하셨는데, 그곳에서 제일 기억에 남는 게 뭐에요?', `${D}09:20:10.000Z`, '고향'),
      turn('Elderly', '전주 남부시장에서 장사하던 시절이 제일 기억에 남지.', `${D}09:21:00.000Z`, '고향', ['시장', '고향']),
      turn('AI', '어떤 물건을 주로 팔으셨어요?', `${D}09:24:00.000Z`, '직업'),
      turn('Elderly', '김치나 반찬거리 많이 팔았어. 새벽부터 나가면 사람들이 많이 왔지.', `${D}09:27:00.000Z`, '직업', ['시장', '상인', '음식']),
      turn('AI', '그때 시장 분위기는 어땠나요?', `${D}09:30:00.000Z`, '직업'),
      turn('Elderly', '정겹고 활기 찼지. 서로 도와가며 살았어.', `${D}09:32:00.000Z`, '직업', ['시장', '추억']),
    ],
  },
];

/** 시드 로그의 관찰 분석을 미리 계산(단일 분석 화면 시연용) — core.analyzeSession 재사용. */
export function seedAnalyses(): Record<string, SessionAnalysis> {
  const out: Record<string, SessionAnalysis> = {};
  for (const log of MOCK_LOGS) {
    const elder = MOCK_ELDERS.find((e) => e.id === log.elderId);
    if (!elder) continue;
    const chronicle = MOCK_CHRONICLES.filter((c) => c.elderId === log.elderId);
    out[log.id] = analyzeSession(elder, log.turns, chronicle);
  }
  return out;
}
