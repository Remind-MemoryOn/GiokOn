// Figma 실측 감사 전용 인증·데이터 스텁 — `pnpm -F @giokon/web audit` 빌드에서만
// `src/auth/AuthProvider` 자리에 alias 된다(vite.config.ts, FIGMA_AUDIT=1).
//
// 왜 필요한가: 요양보호사 화면은 가드 뒤에 있고 컨테이너에서 *.supabase.co 가 막혀
// 실데이터를 못 받는다. 감사에서 재는 것은 **레이아웃 좌표**이므로 로그인 상태와
// 데모 데이터(Figma 시안과 같은 행 수)를 캐시에 심어 화면을 그대로 그린다.
//
// ⚠️ 제품 빌드에는 포함되지 않는다(FIGMA_AUDIT 없을 때 alias 미적용).
import type { ReactNode } from 'react';
import { queryKeys } from '@giokon/data';
import { queryClient } from '../lib/supabase';

const ORG = { id: 'org-1', name: '햇살 요양원', created_at: '2026-01-01T00:00:00Z' };
const USER = {
  id: 'user-1',
  email: 'eeee@gieokon.co.kr',  // 시안(121:769·131:1004)과 같은 값
  name: '이지은',
  role: 'caregiver',
  org_id: ORG.id,
  onboarded_at: '2026-01-01T00:00:00Z',
  phone: '010-1234-5678',
  created_at: '2026-01-01T00:00:00Z',
};

/** Figma 시안과 같은 3명(김복순·이영수·최영자). 나이는 시안 표기(88·84·90)에 맞춘다. */
const YEAR = new Date().getFullYear();
const elder = (id: string, name: string, age: number, gender: string) => ({
  id,
  user_id: USER.id,
  org_id: ORG.id,
  name,
  birth_year: YEAR - age,
  birth_date: null,
  hometown: '청주',
  job: '식당 운영',
  family: null,
  hobbies: null,
  photo_path: null,
  gender,
  note: null,
  guardian_name: null,
  guardian_relation: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});
const ELDERS = [
  elder('e1', '김복순', 88, 'female'),
  elder('e2', '이영수', 84, 'male'),
  elder('e3', '최영자', 90, 'female'),
];

const session = (id: string, profileId: string, minutes: number, status: string, at: string) => ({
  id,
  profile_id: profileId,
  user_id: USER.id,
  org_id: ORG.id,
  status,
  started_at: at,
  ended_at: status === 'ended' ? at : null,
  duration_seconds: minutes * 60,
  turn_count: 12,
  current_topic: null,
  title: null,
  goal: null,
  content: null,
  avoid_topics: null,
  keywords: [],
  duration_minutes: null,
  planned_date: null,
});
const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();


/** 어르신 상세(161:373) 감사용 — 시안과 같은 구성(동의 3종 완료 · 연대기 2 · 세션 3 · 안전 1). */
const E1 = 'e1';
function seedElderDetail(q: typeof queryClient) {
  // 상세 화면만 시안과 같은 값으로 채운다(목록 카드의 "청주 · 식당 운영" 은 그대로 둔다).
  q.setQueryData(queryKeys.profile(E1), {
    ...ELDERS[0],
    birth_date: '1938-05-12',
    hometown: '충청북도 청주',
    family: '2남 1녀, 남편',
    guardian_name: '김민수',
    guardian_relation: '자녀',
    job: '식당 운영',
    hobbies: '노래부르기, 산책',
    updated_at: iso(0),
  });
  // 기관 관리(131:959) 시안은 구성원 2명을 그린다.
  q.setQueryData(queryKeys.orgMembers, [
    USER,
    { ...USER, id: 'u-kim', name: '김요양', email: 'Kim@gieokon.co.kr', role: 'caregiver' },
  ]);
  q.setQueryData(queryKeys.profileCaregivers(E1), [
    {
      id: 'pc1', profile_id: E1, caregiver_user_id: USER.id, status: 'active',
      created_at: '2026-06-08T00:00:00Z', caregiver: { id: USER.id, name: USER.name, phone: USER.phone, email: USER.email },
    },
  ]);
  q.setQueryData(queryKeys.consents(E1), [
    { id: 'c1', profile_id: E1, consent_type: 'sensitive_health_voice', revoked_at: null },
    { id: 'c2', profile_id: E1, consent_type: 'cross_border_transfer', revoked_at: null },
    { id: 'c3', profile_id: E1, consent_type: 'ai_processing', revoked_at: null },
  ]);
  q.setQueryData(queryKeys.elderCode(E1), { profile_id: E1, code: 'K7M2Q9RXTV' });
  q.setQueryData(queryKeys.sessions(E1), [
    { ...session('s1', E1, 14, 'ended', iso(0)), turn_count: 16, current_topic: '어린 시절 집 이야기 (고향)' },
    { ...session('s2', E1, 12, 'ended', iso(1)), turn_count: 8, current_topic: '어머니와 함께했던 기억 (가족)' },
    { ...session('s3', E1, 9, 'active', iso(2)), turn_count: 12, current_topic: '학창 시절 친구 이야기 (학창 시절)' },
  ]);
  q.setQueryData(queryKeys.chronicles(E1), [
    { id: 'ch1', profile_id: E1, topic: '고향', content: '어린 시절 집 이야기', keywords: [], source: 'ai', recorded_at: '2026-07-30T00:00:00Z', updated_at: iso(0) },
    { id: 'ch2', profile_id: E1, topic: '가족', content: '명절마다 자식들이 모두 모였던 날', keywords: [], source: 'caregiver', recorded_at: '2026-07-08T00:00:00Z', updated_at: iso(22) },
    { id: 'km1', profile_id: E1, topic: '주요 기억', content: '명절마다 가족이 모두 모였던 식탁', keywords: [], source: 'caregiver', recorded_at: '2026-07-01T00:00:00Z', updated_at: iso(0) },
    { id: 'km2', profile_id: E1, topic: '주요 기억', content: '남편과 처음 데이트했던 전주 영화관', keywords: [], source: 'caregiver', recorded_at: '2026-07-02T00:00:00Z', updated_at: iso(0) },
  ]);
  q.setQueryData(queryKeys.safetyEvents(E1), [
    {
      id: 'se1', profile_id: E1, session_id: 's1', org_id: ORG.id, level: 'watch',
      caregiver_alert: '외로움 신호가 관찰됐어요.', excerpt: '외로움을 표현하셨습니다.',
      acknowledged_at: null, acknowledged_by: null, created_at: iso(2),
    },
  ]);
}

/**
 * 연대기 목록(198:506) 감사용 — 이 프레임의 시안은 상세(161:373)와 **다른 4건**을 그린다
 * (상세는 2건만 보여 준다). 화면별로 자기 시안과 같은 데이터를 심는다.
 */
function seedChronicleList(q: typeof queryClient) {
  if (!/\/chronicles(\/|$)/.test(window.location.pathname)) return;
  q.setQueryData(queryKeys.chronicles(E1), [
    // ch1 은 상세 모달(198:991) 시안과 같은 값 — 제목·내용·키워드까지.
    {
      id: 'ch1', profile_id: E1, topic: '고향', title: '어린 시절 집 이야기',
      content:
        '어르신은 어린 시절 살던 집과 가족들에 대한 추억을 이야기하셨습니다. 특히 집 앞마당에 있던 감나무에 대한 기억을 자세히 떠올리셨으며, 가을이 되면 가족들과 함께 감을 따던 이야기를 들려주셨습니다. 어린 시절 함께 지냈던 가족과 집 주변의 모습에 대해서도 자연스럽게 이야기를 이어가셨습니다.',
      keywords: ['가족', '감나무', '살던 집', '어린 시절'],
      source: 'ai', recorded_at: '2026-07-30T03:00:00Z', updated_at: iso(0),
    },
    { id: 'ch3', profile_id: E1, topic: '가족', content: '어머니와 함께했던 기억', keywords: [], source: 'ai', recorded_at: '2026-07-19T03:00:00Z', updated_at: iso(0) },
    { id: 'ch4', profile_id: E1, topic: '학창 시절', content: '학창 시절 친구 이야기', keywords: [], source: 'ai', recorded_at: '2026-07-19T02:00:00Z', updated_at: iso(0) },
    { id: 'ch2', profile_id: E1, topic: '가족', content: '명절마다 자식들이 모두 모였던 날', keywords: [], source: 'caregiver', recorded_at: '2026-07-08T03:00:00Z', updated_at: iso(0) },
  ]);
}

/**
 * 세션 목록(178:877) 감사용 — 이 프레임의 시안은 3건(종료·종료·진행 중)을 그린다.
 * 어르신 상세(161:373)와 데이터가 달라 화면별로 자기 시안과 같은 값을 심는다.
 */
function seedSessionList(q: typeof queryClient) {
  // 대화 분석 목록(228:4628)·보호자 대화 분석(104:1041)도 같은 3건을 그린다.
  const p = window.location.pathname;
  const guardian = /^\/guardian\/analysis\/sessions$/.test(p);
  if (
    !guardian
    && !/\/caregiver\/sessions\//.test(p)
    && !/\/caregiver\/analysis\/[^/]+\/sessions$/.test(p)
  ) return;
  q.setQueryData(queryKeys.sessions(E1), [
    { ...session('s1', E1, 14, 'ended', '2026-07-30T03:00:00Z'), title: '어린 시절 집 이야기' },
    { ...session('s2', E1, 12, 'ended', '2026-07-19T03:00:00Z'), title: '어머니와 함께했던 기억' },
    // 보호자에게는 끝난 대화만 보인다 — 그 화면 시안은 3행이라 세 번째도 종료로 심는다.
    { ...session('s3', E1, 9, guardian ? 'ended' : 'active', '2026-07-10T03:00:00Z'), title: '학창 시절 친구 이야기' },
  ]);
}

/**
 * 대화 기록(178:1052) 감사용 — 시안의 첫 네 턴을 그대로 심는다(2026-06-24 오전).
 */
function seedConversation(q: typeof queryClient) {
  // 대화 분석 상세(228:4430)·보호자 대화 분석 상세(104:1830)도 같은 세션·턴을 읽는다.
  const path = window.location.pathname;
  const onLog = /\/caregiver\/sessions\/[^/]+\/([^/]+)$/.exec(path);
  const onAnalysis = /\/caregiver\/analysis\/[^/]+\/sessions\/([^/]+)$/.exec(path)
    ?? /\/guardian\/analysis\/sessions\/([^/]+)$/.exec(path);
  const m = onLog ?? onAnalysis;
  if (!m || m[1] === 'new') return;
  const id = m[1];
  // 두 화면의 시안 날짜가 다르다 — 대화 기록은 2026-06-24, 대화 분석 상세는 2026-07-30 9:25.
  q.setQueryData(queryKeys.session(id), {
    ...session(id, E1, 14, 'ended', onAnalysis
      ? new Date(2026, 6, 30, 9, 25).toISOString()
      : '2026-06-24T01:17:00Z'),
    duration_seconds: 852,
    title: '어린 시절 집 이야기',
  });
  // 대화 분석 상세는 세션 1건의 분석을 따로 읽는다(키가 다르다).
  q.setQueryData(['session_analyses', 'session', id], {
    id: `an-${id}`,
    org_id: ORG.id,
    session_id: id,
    profile_id: E1,
    user_id: USER.id,
    version: 'v1',
    created_at: '2026-07-30T00:40:00Z',
    updated_at: '2026-07-30T00:40:00Z',
    analysis: {
      version: 'v1',
      summary: '· 집 앞마당 감나무와 가을 풍경에 대한 기억\n· 가족들과 함께 감을 따던 따뜻한 추억\n· 어린 시절 살던 집과 가족에 대한 회상',
      emotionTone: 'bright',
      metrics: { aiTurns: 7, elderTurns: 7, responseRate: 0.85, avgUtteranceChars: 62, participation: 0.78 },
      topicsEngaged: ['고향', '가족'],
      topicsLow: [],
      topicOutcomes: [{ topic: '고향', reaction: 'engaged', turns: 4 }],
      interestKeywords: ['어린 시절', '감나무', '추억', '가족'],
      recommendedTopics: ['가족'],
    },
  });
  const turn = (n: number, role: 'ai' | 'elder', content: string, hh: number, mm: number) => ({
    id: `l${n}`,
    session_id: id,
    profile_id: E1,
    user_id: USER.id,
    org_id: ORG.id,
    turn_index: n,
    role,
    content,
    original_content: null,
    topic: null,
    switch_topic: null,
    audio_url: null,
    audio_expires_at: null,
    duration_ms: null,
    spoken_at: new Date(2026, 5, 24, hh, mm).toISOString(),
    created_at: new Date(2026, 5, 24, hh, mm).toISOString(),
    updated_at: new Date(2026, 5, 24, hh, mm).toISOString(),
  });
  q.setQueryData(queryKeys.sessionLogs(id), [
    turn(1, 'ai', '어르신이 살던 집은 어떤 곳이었는지 기억나시나요?', 10, 17),
    turn(2, 'elder', '마당이 있는 한옥이었는데, 마당에 큰 감나무가 하나 있었어. 가을이면 감이 아주 많이 열렸지.', 10, 18),
    turn(3, 'ai', '그 감나무는 누가 심으셨나요?', 10, 19),
    turn(4, 'elder', '아버지가 심으셨어. 풍년이 들고 가족이 건강하길 바라는 마음이었지.', 10, 21),
    // 대화 분석 상세(228:4430)는 '밝음'이 가장 많은 상태를 그린다(표정 마크가 붙는 칸).
    // 대화 기록(178:1052) 시안은 4턴이라 그 화면에서는 넣지 않는다.
    ...(onAnalysis
      ? [
          turn(5, 'ai', '감을 딸 때는 어떠셨어요?', 10, 23),
          turn(6, 'elder', '온 가족이 모여서 참 재미있었지. 다들 웃고 떠들고 좋았어.', 10, 24),
          turn(7, 'ai', '그때 드셨던 음식도 기억나세요?', 10, 26),
          turn(8, 'elder', '곶감이 아주 맛있었어. 지금 생각해도 기뻤던 날이야.', 10, 27),
        ]
      : []),
  ]);
}

/**
 * 분석 화면(225:1669) 감사용 — 관찰 지표는 전부 core 순수함수가 계산하므로
 * **분석 원본(session_analyses)** 을 심는다. 최근 3개월에 고르게 퍼뜨려 월별 추이가 그려진다.
 */
function seedAnalyses(q: typeof queryClient) {
  const TOPICS = ['가족', '고향', '직업', '취미', '여행'];
  const rows = Array.from({ length: 12 }, (_, i) => {
    const at = new Date(now - i * 7 * 86_400_000).toISOString();
    const engaged = TOPICS.slice(0, 3 - (i % 2));
    return {
      id: `a${i}`,
      org_id: ORG.id,
      session_id: `s${i}`,
      profile_id: ELDERS[i % ELDERS.length].id,
      user_id: USER.id,
      version: 'v1',
      created_at: at,
      updated_at: at,
      analysis: {
        version: 'v1',
        summary: '관찰 요약',
        emotionTone: i % 3 === 0 ? 'bright' : 'calm',
        metrics: {
          aiTurns: 6 + (i % 3),
          elderTurns: 6 + (i % 3),
          responseRate: 0.8 + (i % 3) * 0.05,
          avgUtteranceChars: 40 + i,
          participation: 0.7 + (i % 4) * 0.05,
        },
        topicsEngaged: engaged,
        topicsLow: TOPICS.slice(4),
        topicOutcomes: TOPICS.slice(0, 3).map((t) => ({ topic: t, reaction: 'engaged', turns: 3 })),
        interestKeywords: ['어린 시절', '고향', '가족', '추억', '친구'].slice(0, 3 + (i % 3)),
        recommendedTopics: ['가족'],
      },
    };
  });
  q.setQueryData([...queryKeys.orgSessionAnalyses, 'all'], rows);
  // 개인별 종합 분석(228:4091)은 어르신 한 명의 분석 이력을 따로 읽는다.
  q.setQueryData(queryKeys.sessionAnalyses(E1), rows.filter((r) => r.profile_id === E1));
}

/** 요양일지 목록(207:1147) 감사용 — 시안과 같은 4건. */
function seedJournals(q: typeof queryClient) {
  const p2 = window.location.pathname;
  if (!/\/caregiver\/journal\//.test(p2) && !/\/caregiver\/shares\//.test(p2)) return;
  const j = (id: string, date: string, content: string) => ({
    id,
    org_id: ORG.id,
    profile_id: E1,
    author_id: USER.id,
    journal_date: date,
    content,
    source: 'typed' as const,
    photo_path: null,
    status: 'draft' as const,
    created_at: `${date}T02:00:00Z`,
    updated_at: `${date}T02:00:00Z`,
  });
  q.setQueryData(queryKeys.careJournals(E1), [
    j('j1', '2026-07-30', '오늘은 산책 후 가벼운 체조를 함께 했습니다. 식사도 잘 하셨고, 기분이 좋아 보이셨습니다.'),
    j('j2', '2026-07-28', '오전에는 실내에서 가벼운 스트레칭을 진행했습니다. 점심 식사 후에는 휴식을 취하며 편안하게 하루를 보내셨어요.'),
    j('j3', '2026-07-21', '날씨가 좋아 요양원 주변을 천천히 산책했습니다. 산책 중 주변 풍경을 바라보며 즐겁게 이야기를 나누셨어요.'),
    j('j4', '2026-07-13', '오후에 꽃을 심고 꾸미는 원예 활동을 진행했습니다. 완성된 화분을 보며 매우 좋아하셨어요.'),
  ]);
}

/** 공개 관리(140:121·146:1067) 감사용 — 일지 4건 중 3건·분석 1건을 공개해 둔다. */
function seedShares(q: typeof queryClient) {
  if (!/\/caregiver\/shares\//.test(window.location.pathname)) return;
  const share = (id: string, type: 'journal' | 'analysis', itemId: string, at: string, revoked = false) => ({
    id,
    org_id: ORG.id,
    profile_id: E1,
    item_type: type,
    item_id: itemId,
    note: null,
    shared_by: USER.id,
    shared_at: at,
    revoked_at: revoked ? at : null,
    revoked_by: revoked ? USER.id : null,
    // 확인 정보(153:1811) 시안은 미확인 상태를 그린다.
    viewed_at: null,
    viewed_by: null,
    view_count: 0,
    notify_on_view: false,
  });
  // 시안(140:121)은 7/30 요양일지를 맨 위에 그린다 — 분석은 그보다 앞선 날짜로 심는다.
  const an = (id: string, at: string, topic: string) => ({
    id, org_id: ORG.id, session_id: `s-${id}`, profile_id: E1, user_id: USER.id,
    version: 'v1', created_at: at, updated_at: at,
    analysis: {
      version: 'v1', summary: '어르신이 어릴 적 살던 집과 가족들에 대한 추억을 이야기 하셨습니다.',
      emotionTone: 'bright',
      metrics: { aiTurns: 6, elderTurns: 6, responseRate: 0.85, avgUtteranceChars: 44, participation: 0.75 },
      topicsEngaged: [topic], topicsLow: [], topicOutcomes: [], interestKeywords: [], recommendedTopics: [],
    },
  });
  q.setQueryData(queryKeys.sessionAnalyses(E1), [
    an('a0', '2026-07-29T02:02:00Z', '고향'),
    an('a3', '2026-07-19T01:38:00Z', '가족'),
  ]);
  q.setQueryData(queryKeys.guardianShares(E1), [
    share('sh1', 'analysis', 'a0', '2026-07-30T02:02:00Z'),
    share('sh2', 'journal', 'j1', '2026-07-30T10:00:00Z'),
    share('sh3', 'journal', 'j2', '2026-07-28T09:00:00Z'),
    share('sh4', 'journal', 'j3', '2026-07-21T07:02:00Z'),
  ]);
}

/**
 * 보호자 화면(31:616 연결 전 · 50:528 연결 후) 감사용.
 * 두 상태가 같은 라우트라 감사에서는 `?state=connected` 로 골라 심는다(제품 코드는 이 값을
 * 보지 않는다 — 실제로는 승인된 연결이 있는지로 갈린다).
 */
function seedGuardian(q: typeof queryClient) {
  if (!/^\/guardian/.test(window.location.pathname)) return;
  const state = new URLSearchParams(window.location.search).get('state');
  const guardianLink = (id: string, profileId: string, at: string, updated: string) => ({
    id, org_id: ORG.id, profile_id: profileId, guardian_user_id: 'guardian-1',
    relation: '자녀', status: 'approved', approved_by: USER.id,
    approved_at: at, revoked_at: null, created_at: at, updated_at: updated,
  });
  // 여러 어르신 연결(69:320)은 승인된 연결이 2건 이상일 때 나오는 화면이다.
  q.setQueryData(queryKeys.myGuardianLinks,
    state === 'multi'
      ? [
          guardianLink('pg1', E1, '2026-06-08T00:00:00Z', new Date().toISOString()),
          guardianLink('pg2', 'e2', '2026-07-12T00:00:00Z', '2026-07-12T00:00:00Z'),
          guardianLink('pg3', 'e3', '2026-07-15T00:00:00Z', '2026-07-15T00:00:00Z'),
        ]
      : state === 'connected'
        ? [guardianLink('pg1', E1, '2026-06-08T00:00:00Z', '2026-06-08T00:00:00Z')]
        : []);
  // 공개된 소식은 탭마다 항목 수가 다르다 — 시안대로 심는다.
  //   전체 4건 + 더보기(카드 1004) · 요양일지 3건(726) · AI 요약 3건(726) · 공유 사진 4장(1236)
  const shareRow = (id: string, type: string, itemId: string, at: string) => ({
    id, org_id: ORG.id, profile_id: E1, item_type: type, item_id: itemId,
    note: null, shared_by: USER.id, shared_at: at, revoked_at: null, revoked_by: null,
  });
  const journal = (id: string, date: string, content: string) => ({
    id, org_id: ORG.id, profile_id: E1, author_id: USER.id,
    journal_date: date, source: 'typed', photo_path: null, status: 'final', content,
    created_at: `${date}T10:00:00Z`, updated_at: `${date}T10:00:00Z`,
  });
  const analysis = (id: string, at: string, topic: string, summary: string) => ({
    id, org_id: ORG.id, session_id: 's1', profile_id: E1, user_id: USER.id,
    version: 'v1', created_at: at, updated_at: at,
    analysis: {
      version: 'v1', summary, emotionTone: 'bright',
      metrics: { aiTurns: 6, elderTurns: 6, responseRate: 0.85, avgUtteranceChars: 44, participation: 0.75 },
      topicsEngaged: [topic], topicsLow: [], topicOutcomes: [], interestKeywords: [], recommendedTopics: [],
    },
  });
  const photo = (id: string, journalId: string, file: string, caption: string, at: string) => ({
    id, org_id: ORG.id, journal_id: journalId, path: `${E1}/${file}`, sort: 0, caption,
    created_at: at, updated_at: at,
  });
  // 시안은 같은 항목을 목록(2줄)과 상세(6~7줄)에 서로 다른 예시 본문으로 그렸다 →
  // 상세 라우트에서만 상세 시안 본문으로 바꿔 심는다(항목 수는 그대로).
  const detail = /^\/guardian\/feed\/(journal|summary)\//.test(window.location.pathname);
  const J1 = detail
    ? '오늘은 날씨가 좋아 어르신과 함께 공원 주변을 천천히 산책했습니다.\n산책을 마친 후에는 실내에서 가벼운 체조를 함께 진행했습니다.\n즐겁게 동작을 따라 하셨어요.\n\n활동에도 편안하게 참여하셨으며, 3끼 식사도 남김없이 잘 드셨습니다. 하지만 전반적으로 평소 아침은 점심,저녁에 비해 적게 드시는 편이셨어요. 산책 중에는 주변 풍경을 바라보며 이야기를 나누셨고, 전반적으로 밝고 편안한 모습을 보이셨습니다.'
    : '오늘은 산책 후 가벼운 체조를 함께 했습니다. 식사도 잘 하셨고, 기분이 좋아 보이셨습니다.';
  const A0 = detail
    ? '어르신은 어린 시절 살던 집과 가족들에 대한 추억을 이야기하셨습니다.\n특히 집 앞마당에 있던 감나무에 대한 기억을 자세히 떠올리셨으며, 가을이 되면 가족들과 함께 감을 따던 이야기를 들려주셨습니다.\n\n어린 시절 함께 지냈던 가족과 집 주변의 모습에 대해서도 자연스럽게 이야기를 이어가셨습니다.'
    : '어르신이 어릴 적 살던 집과 가족들에 대한 추억을 이야기 하셨습니다. 특히 마당에 있던 감나무에 대한 추억을 오래 기억하셨어요.';
  q.setQueryData(queryKeys.myShares, {
    shares: [
      shareRow('ms1', 'journal', 'j1', '2026-07-30T10:00:00Z'),
      shareRow('ms2', 'analysis', 'a0', '2026-07-30T02:02:00Z'),
      shareRow('ms3', 'journal', 'j2', '2026-07-28T09:00:00Z'),
      shareRow('ms4', 'photo', 'p1', '2026-07-21T07:10:00Z'),
      shareRow('ms5', 'journal', 'j3', '2026-07-21T07:00:00Z'),
      shareRow('ms6', 'analysis', 'a1', '2026-07-19T01:38:00Z'),
      shareRow('ms7', 'analysis', 'a2', '2026-07-10T08:02:00Z'),
      shareRow('ms8', 'photo', 'p2', '2026-07-09T07:00:00Z'),
      shareRow('ms9', 'photo', 'p3', '2026-07-08T07:00:00Z'),
      shareRow('ms10', 'photo', 'p4', '2026-07-07T07:00:00Z'),
    ],
    journals: [
      journal('j1', '2026-07-30', J1),
      journal('j2', '2026-07-28', '오전에는 실내에서 가벼운 스트레칭을 진행했습니다. 점심 식사 후에는 휴식을 취하며 편안하게 하루를 보내셨어요.'),
      journal('j3', '2026-07-21', '날씨가 좋아 요양원 주변을 천천히 산책했습니다. 산책 중 주변 풍경을 바라보며 즐겁게 이야기를 나누셨어요.'),
    ],
    analyses: [
      {
        ...analysis('a0', '2026-07-30T02:02:00Z', '어린 시절 집', A0),
        analysis: {
          ...analysis('a0', '2026-07-30T02:02:00Z', '어린 시절 집', A0).analysis,
          durationMinutes: 14,
          interestKeywords: ['어린 시절', '가족', '옛집', '감나무', '가을'],
          topicOutcomes: [
            { topic: '어린 시절', reaction: 'engaged', elderTurns: 3,
              excerpt: '마당에 큰 감나무가 하나 있었어. 가을이면 감이 아주 많이 열렸지.' },
            { topic: '가족', reaction: 'engaged', elderTurns: 2 },
            { topic: '살던 집', reaction: 'neutral', elderTurns: 2 },
            { topic: '감나무', reaction: 'engaged', elderTurns: 2 },
          ],
        },
      },
      analysis('a1', '2026-07-19T01:38:00Z', '어머니와 함께했던',
        '어린 시절 어머니와 함께 시장에 갔던 이야기를 들려주셨어요. 시장에서 먹었던 음식과 당시 풍경을 자연스럽게 회상하셨습니다.'),
      analysis('a2', '2026-07-10T08:02:00Z', '학창 시절 친구',
        '학교에 다니던 시절 친하게 지냈던 친구에 대한 이야기를 나누셨어요. 함께 등교했던 길과 놀이에 대한 기억을 떠올리셨습니다.'),
    ],
    photos: [
      photo('p1', 'j3', 'walk.jpg', '오늘 오전 산책 활동 중 찍은 사진입니다. 날씨가 좋아서 기분 좋게 산책하셨어요.', '2026-07-21T07:10:00Z'),
      photo('p2', 'j1', 'lunch.jpg', '점심 식사를 편안하게 드시는 모습입니다. 식사도 잘 하시고 밝은 모습을 보여주셨어요.', '2026-07-30T08:00:00Z'),
      photo('p3', 'j1', 'walk2.jpg', '오늘 오전 산책 활동 중 찍은 사진입니다. 공원 주변을 천천히 산책하셨어요.', '2026-07-30T07:00:00Z'),
      photo('p4', 'j1', 'gym.jpg', '가벼운 스트레칭과 체조를 진행하였습니다. 즐겁게 동작을 따라 하셨어요.', '2026-07-30T06:00:00Z'),
    ],
  });
}

let seeded = false;
function seed() {
  if (seeded) return;
  seeded = true;
  const q = queryClient;
  q.setQueryData(queryKeys.profiles, ELDERS);
  q.setQueryData(queryKeys.currentUser, USER);
  q.setQueryData(queryKeys.organization, ORG);
  q.setQueryData(queryKeys.sessionCounts, { total: 3, byProfile: { e1: 1, e2: 1, e3: 1 } });
  q.setQueryData(queryKeys.chronicleCounts, {
    total: 2,
    aiTotal: 1,
    byProfile: { e1: 2, e2: 0, e3: 0 },
  });
  // 세션 기록(178:787)의 "최근 대화" 는 fetchAll 키를 읽는다 — 시안과 같은 간격으로 심는다.
  q.setQueryData([...queryKeys.recentSessions, 'all'], [
    session('s1', 'e1', 14, 'ended', iso(0)),
    session('s2', 'e2', 12, 'ended', iso(3)),
    session('s3', 'e3', 9, 'ended', iso(20)),
  ]);
  q.setQueryData([...queryKeys.recentSessions, 5], [
    session('s1', 'e1', 14, 'ended', iso(0)),
    session('s2', 'e2', 12, 'ended', iso(2)),
    session('s3', 'e3', 9, 'active', iso(2)),
  ]);
  q.setQueryData(queryKeys.unacknowledgedSafetyEvents, [
    {
      id: 'se1',
      profile_id: 'e1',
      session_id: 's1',
      org_id: ORG.id,
      level: 'watch',
      caregiver_alert: '외로움 신호가 관찰됐어요.',
      excerpt: '외로움을 표현하셨습니다.',
      acknowledged_at: null,
      acknowledged_by: null,
      created_at: iso(2),
    },
  ]);
  // 탑바 벨 배지는 시안이 3 을 그린다(요양보호사 페이지_대시보드) — 안 읽은 알림 3건.
  const notif = (id: string, kind: string, title: string, body: string | null, days: number) => ({
    id,
    org_id: ORG.id,
    user_id: USER.id,
    kind,
    profile_id: E1,
    source_id: null,
    title,
    body,
    read_at: null,
    created_at: iso(days),
  });
  q.setQueryData(queryKeys.myNotifications, [
    notif('n1', 'safety', '안전 알림이 있어요', '외로움 신호가 관찰됐어요.', 0),
    notif('n2', 'share_viewed', '보호자가 공개한 기록을 확인했어요', null, 1),
    notif('n3', 'safety', '안전 알림이 있어요', '어르신이 불안을 표현하셨어요.', 2),
  ]);
  seedElderDetail(q);
  seedChronicleList(q);
  seedSessionList(q);
  seedConversation(q);
  seedAnalyses(q);
  seedJournals(q);
  seedShares(q);
  seedGuardian(q);
  q.setQueryData(queryKeys.myAssignments, [
    { id: 'pa1', profile_id: 'e1', user_id: USER.id, status: 'pending', created_at: iso(1) },
    { id: 'pa2', profile_id: 'e2', user_id: USER.id, status: 'pending', created_at: iso(1) },
  ]);
}
seed();

/* eslint-disable react-refresh/only-export-components -- 감사 전용 스텁(제품 번들 미포함) */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth() {
  // 화면마다 필요한 인증 상태가 다르다 — 경로로 흉내 낸다.
  //   /caregiver·/guardian = 로그인+온보딩 완료 · /signup·/onboarding = 온보딩 미완료
  //   그 외(공개 화면) = 미인증(로그인 화면이 리다이렉트되지 않도록)
  const path = window.location.pathname;
  const app = /^\/(caregiver|guardian)/.test(path);
  const onboarding = /^\/(signup|onboarding)/.test(path);
  const signedIn = app || onboarding;
  // 보호자 화면은 역할이 guardian 이어야 가드를 통과하고 탑바 문구도 바뀐다(31:616 "김민수 보호자님").
  const me = /^\/guardian/.test(path)
    ? { ...USER, id: 'guardian-1', name: '김민수', role: 'guardian', email: 'minsu@example.com' }
    : USER;
  return {
    session: signedIn ? { user: { id: me.id, email: me.email } } : null,
    user: signedIn ? { id: me.id, email: me.email, user_metadata: { name: me.name } } : null,
    userRow: signedIn ? (onboarding ? { ...me, onboarded_at: null } : me) : null,
    loading: false,
    // 훅은 유휴 상태로 두고(네트워크 없음) 위에서 심은 캐시만 읽게 한다.
    isConfigured: false,
    refreshUserRow: async () => null,
  } as never;
}
