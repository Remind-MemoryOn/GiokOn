// @giokon/data — sessions / session_logs(대화 세션·전문) TanStack Query 훅
//
// 조회는 supabase-js 직접(RLS). 세션 진행 쓰기(start/respond/correct/end)는
// provider 키 보호가 필요하므로 Edge Function(session-respond 등, M3.4)이 담당한다
// → 여기서는 읽기 훅만 노출한다.

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { SessionLogRow, SessionRow } from '../database.types'

export interface SessionCounts {
  total: number
  byProfile: Record<string, number>
}

/** 사용자 전체 세션 카운트(대시보드·목록 카드용, RLS로 본인 것만). */
export function useSessionCounts(): UseQueryResult<SessionCounts> {
  return useQuery({
    queryKey: queryKeys.sessionCounts,
    queryFn: async () => {
      const { data, error } = await getGiokonClient().from('sessions').select('profile_id')
      if (error) throw new Error(error.message)
      const byProfile: Record<string, number> = {}
      for (const r of data) byProfile[r.profile_id] = (byProfile[r.profile_id] ?? 0) + 1
      return { total: data.length, byProfile }
    },
  })
}

/** 어르신별 세션 이력(최신 시작순). */
export function useSessions(profileId: string | undefined): UseQueryResult<SessionRow[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.sessions(profileId) : ['sessions', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('sessions')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('started_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 단일 세션 메타. */
export function useSession(id: string | undefined): UseQueryResult<SessionRow | null> {
  return useQuery({
    queryKey: id ? queryKeys.session(id) : ['sessions', 'detail', 'none'],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('sessions')
        .select('*')
        .eq('id', id as string)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 세션 대화 전문(턴 순서). */
export function useSessionLogs(sessionId: string | undefined): UseQueryResult<SessionLogRow[]> {
  return useQuery({
    queryKey: sessionId ? queryKeys.sessionLogs(sessionId) : ['session_logs', 'none'],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('session_logs')
        .select('*')
        .eq('session_id', sessionId as string)
        .order('turn_index', { ascending: true })
        .order('spoken_at', { ascending: true })
      if (error) throw new Error(error.message)
      return data
    },
  })
}
