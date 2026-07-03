// @giokon/data — TanStack Query 설정 (서버 상태 SoT)
//
// 서버 상태(profiles/chronicles/sessions/logs)는 TanStack Query가 패칭·캐싱한다.
// UI/클라이언트 상태는 @giokon/core의 Zustand가 담당한다.

import { QueryClient } from '@tanstack/react-query'

/** 앱 공용 QueryClient. 진입점에서 한 번 만들어 QueryClientProvider에 주입한다. */
export function createGiokonQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}

/** 쿼리 키 팩토리 — 무효화(invalidate)와 캐시 키를 한곳에서 관리한다. */
export const queryKeys = {
  profiles: ['profiles'] as const,
  profile: (id: string) => ['profiles', id] as const,
  chronicles: (profileId: string) => ['chronicles', profileId] as const,
  sessions: (profileId: string) => ['sessions', profileId] as const,
  session: (id: string) => ['sessions', 'detail', id] as const,
  sessionLogs: (sessionId: string) => ['session_logs', sessionId] as const,
  chronicleCounts: ['chronicle_counts'] as const,
  sessionCounts: ['session_counts'] as const,
  currentUser: ['users', 'me'] as const,
  organization: ['organization'] as const,
  orgMembers: ['org_members'] as const,
  consents: (profileId: string) => ['consents', profileId] as const,
}
