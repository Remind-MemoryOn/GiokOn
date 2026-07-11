// @giokon/data — safety_events(위기 에스컬레이션) TanStack Query 훅 (M12.1)
//
// 대화 파이프라인이 @giokon/core의 SafetyEventDraft를 이 훅으로 영속화하고,
// 요양보호사/기관 대시보드가 미확인 이벤트를 구독·확인(acknowledge)한다.
// RLS: 같은 기관 구성원 전체 조회(교대 근무 대비 — 어르신 안전 우선), 삭제 불가.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { SafetyEventRow, TablesInsert } from '../database.types'

export type SafetyEventInsert = TablesInsert<'safety_events'>

/** 특정 어르신의 안전 이벤트 이력(최신순). */
export function useSafetyEvents(profileId: string | undefined): UseQueryResult<SafetyEventRow[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.safetyEvents(profileId) : ['safety_events', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('safety_events')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 기관의 미확인 안전 이벤트(대시보드 알림용). 위기 대응 관점에서 짧은 주기로 갱신. */
export function useUnacknowledgedSafetyEvents(
  options?: { enabled?: boolean },
): UseQueryResult<SafetyEventRow[]> {
  return useQuery({
    queryKey: queryKeys.unacknowledgedSafetyEvents,
    enabled: options?.enabled ?? true,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('safety_events')
        .select('*')
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 안전 이벤트 기록(대화 파이프라인에서 escalate/watch 시 호출). */
export function useRecordSafetyEvent(): UseMutationResult<SafetyEventRow, Error, SafetyEventInsert> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SafetyEventInsert) => {
      const { data, error } = await getGiokonClient()
        .from('safety_events')
        .insert(input)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.safetyEvents(row.profile_id) })
      void qc.invalidateQueries({ queryKey: queryKeys.unacknowledgedSafetyEvents })
    },
  })
}

/** 안전 이벤트 확인(acknowledge) — 확인자·시각 기록. */
export function useAcknowledgeSafetyEvent(): UseMutationResult<
  SafetyEventRow,
  Error,
  { id: string; userId: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, userId }) => {
      const { data, error } = await getGiokonClient()
        .from('safety_events')
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: userId })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.safetyEvents(row.profile_id) })
      void qc.invalidateQueries({ queryKey: queryKeys.unacknowledgedSafetyEvents })
    },
  })
}
