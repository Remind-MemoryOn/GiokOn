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
  email: 'jieun@example.com',
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
  q.setQueryData(queryKeys.orgMembers, [USER]);
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
  seedElderDetail(q);
  seedChronicleList(q);
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
  return {
    session: signedIn ? { user: { id: USER.id, email: USER.email } } : null,
    user: signedIn ? { id: USER.id, email: USER.email, user_metadata: { name: USER.name } } : null,
    userRow: signedIn ? (onboarding ? { ...USER, onboarded_at: null } : USER) : null,
    loading: false,
    // 훅은 유휴 상태로 두고(네트워크 없음) 위에서 심은 캐시만 읽게 한다.
    isConfigured: false,
    refreshUserRow: async () => null,
  } as never;
}
