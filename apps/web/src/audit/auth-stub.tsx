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
