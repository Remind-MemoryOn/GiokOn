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
  myConsents: ['consents', 'mine'] as const,
  safetyEvents: (profileId: string) => ['safety_events', profileId] as const,
  unacknowledgedSafetyEvents: ['safety_events', 'unacknowledged'] as const,
  // 웹 1차 MVP(Phase W) — 세션·보호자 연결·분석·요양일지·공개 커밋
  recentSessions: ['sessions', 'recent'] as const,
  // 어르신 영속 코드 + 요양보호사 배정(연속성 재설계)
  elderCode: (profileId: string) => ['elder_codes', profileId] as const,
  profileCaregivers: (profileId: string) => ['profile_caregivers', profileId] as const,
  myAssignments: ['profile_caregivers', 'mine'] as const,
  guardianLinks: (profileId: string) => ['profile_guardians', profileId] as const,
  orgGuardianLinks: ['profile_guardians', 'org'] as const,
  myGuardianLinks: ['profile_guardians', 'mine'] as const,
  orgGuardianUsers: ['users', 'org_guardians'] as const,
  sessionAnalyses: (profileId: string) => ['session_analyses', profileId] as const,
  orgSessionAnalyses: ['session_analyses', 'org'] as const,
  careJournals: (profileId: string) => ['care_journals', profileId] as const,
  orgCareJournals: ['care_journals', 'org'] as const,
  journalPhotos: (journalId: string) => ['journal_photos', journalId] as const,
  orgJournalPhotos: ['journal_photos', 'org'] as const,
  guardianShares: (profileId: string) => ['guardian_shares', profileId] as const,
  myShares: ['guardian_shares', 'mine'] as const,
  myNotifications: ['notifications', 'mine'] as const,
  messages: (profileId: string) => ['messages', profileId] as const,
  myMessages: ['messages', 'mine'] as const,
}
