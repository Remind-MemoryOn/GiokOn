// @giokon/data — 감독 화면 훅(파일럿 W2 · D6·C3)
//
// 읽기: 같은 기관 돌봄팀이면 기관의 진행 중 세션·개입 기록을 본다(RLS — 배정은 게이트가 아니다, 결정 ①).
// 쓰기: 원격 제어는 RPC request_session_control 만(직접 UPDATE 는 트리거가 거절 — SESSION_SUPERVISION_RPC_ONLY).
// 중계가 2초마다 session_tick 으로 이 값을 읽어 어르신 기기에 전한다.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { Database, SessionRow } from '../database.types'

export type SessionInterventionRow = Database['public']['Tables']['session_interventions']['Row']
export type OrgSettingsRow = Database['public']['Tables']['org_settings']['Row']
export type SessionControlAction = 'pause' | 'resume' | 'end'

/** 기관의 진행 중(active) 세션 — 오래 진행된 것이 위. Realtime 이 끊겨도 따라잡도록 짧게 재조회한다. */
export function useActiveOrgSessions(options?: { enabled?: boolean }): UseQueryResult<SessionRow[]> {
  return useQuery({
    queryKey: queryKeys.activeOrgSessions,
    enabled: options?.enabled ?? true,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('sessions')
        .select('*')
        .eq('status', 'active')
        .order('started_at', { ascending: true })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

/** 진행 중 세션들의 개입 기록(최신순) — 누가 언제 멈추고 재개했는지(제도 증빙). */
export function useSessionInterventions(
  sessionIds: string[],
  options?: { enabled?: boolean },
): UseQueryResult<SessionInterventionRow[]> {
  const ids = [...sessionIds].sort()
  return useQuery({
    queryKey: queryKeys.sessionInterventions(ids),
    enabled: (options?.enabled ?? true) && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('session_interventions')
        .select('*')
        .in('session_id', ids)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

/** 원격 일시정지·재개·종료(RPC). 사유는 선택(1~200자). */
export function useRequestSessionControl(): UseMutationResult<
  void,
  Error,
  { sessionId: string; action: SessionControlAction; reason?: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sessionId, action, reason }) => {
      const { error } = await getGiokonClient().rpc('request_session_control', {
        p_session_id: sessionId,
        p_action: action,
        p_reason: reason?.trim() ? reason.trim() : null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.activeOrgSessions })
      void qc.invalidateQueries({ queryKey: ['session_interventions'] })
    },
  })
}

/** 기기 응답 없이 서버에 저장된 기록만으로 종료한다. */
export function useFinishSupervisedSession(): UseMutationResult<void, Error, { sessionId: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ sessionId }) => {
      const { error } = await getGiokonClient().rpc('finish_supervised_session', { p_session_id: sessionId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.activeOrgSessions })
      void qc.invalidateQueries({ queryKey: ['session_interventions'] })
      void qc.invalidateQueries({ queryKey: ['program_journals'] })
      void qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

/** 기관 설정(목표 시간·기본 피할 주제 등). 행이 없으면 null — 서버 기본값(10분)으로 판단한다. */
export function useOrgSettings(options?: { enabled?: boolean }): UseQueryResult<OrgSettingsRow | null> {
  return useQuery({
    queryKey: queryKeys.orgSettings,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient().from('org_settings').select('*').maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}
