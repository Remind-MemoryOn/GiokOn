// @giokon/data — sessions / session_logs(대화 세션·전문) TanStack Query 훅
//
// 조회는 supabase-js 직접(RLS). AI 응답 생성(respond)은 provider 키 보호가
// 필요하므로 Edge Function(session-respond 등, M3.4)이 담당한다.
// 세션 메타 생성·종료와 로그 적재(T-E1)는 앱(요양보호사 세션 실행 도구)이
// 이 쓰기 훅으로 직접 수행한다 — RLS(본인+기관)가 인가를 강제한다.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { SessionLogRow, SessionRow, TablesInsert, TablesUpdate } from '../database.types'

export type SessionInsert = TablesInsert<'sessions'>
export type SessionUpdate = TablesUpdate<'sessions'>
export type SessionLogInsert = TablesInsert<'session_logs'>

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

/** 최근 세션(전 어르신, RLS 범위 — 세션 기록 목록·대시보드용). */
export function useRecentSessions(options?: {
  limit?: number
  enabled?: boolean
}): UseQueryResult<SessionRow[]> {
  const limit = options?.limit ?? 50
  return useQuery({
    queryKey: [...queryKeys.recentSessions, limit],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      return data
    },
  })
}

function invalidateSessionKeys(
  qc: ReturnType<typeof useQueryClient>,
  row: SessionRow,
): void {
  void qc.invalidateQueries({ queryKey: queryKeys.sessions(row.profile_id) })
  void qc.invalidateQueries({ queryKey: queryKeys.session(row.id) })
  void qc.invalidateQueries({ queryKey: queryKeys.recentSessions })
  void qc.invalidateQueries({ queryKey: queryKeys.sessionCounts })
}

/** 세션 생성(앱: 어르신 선택→세션 시작). */
export function useCreateSession(): UseMutationResult<SessionRow, Error, SessionInsert> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SessionInsert) => {
      const { data, error } = await getGiokonClient()
        .from('sessions')
        .insert(input)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => invalidateSessionKeys(qc, row),
  })
}

/** 세션 갱신(턴 수·주제·종료 처리 등). */
export function useUpdateSession(): UseMutationResult<
  SessionRow,
  Error,
  { id: string; patch: SessionUpdate }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { data, error } = await getGiokonClient()
        .from('sessions')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => invalidateSessionKeys(qc, row),
  })
}

/** 대화 로그 적재(앱: 한 턴 종료 시마다). */
export function useAppendSessionLog(): UseMutationResult<
  SessionLogRow,
  Error,
  SessionLogInsert
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SessionLogInsert) => {
      const { data, error } = await getGiokonClient()
        .from('session_logs')
        .insert(input)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.sessionLogs(row.session_id) })
    },
  })
}
