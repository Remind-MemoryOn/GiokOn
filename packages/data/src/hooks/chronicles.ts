// @giokon/data — chronicle_entries(연대기 항목) TanStack Query 훅

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { ChronicleRow, TablesInsert, TablesUpdate } from '../database.types'

export type ChronicleInsert = TablesInsert<'chronicle_entries'>
export type ChronicleUpdate = TablesUpdate<'chronicle_entries'>

export interface ChronicleCounts {
  total: number
  aiTotal: number
  byProfile: Record<string, number>
}

/** 사용자 전체 연대기 카운트(대시보드·목록 카드용, RLS로 본인 것만). */
export function useChronicleCounts(): UseQueryResult<ChronicleCounts> {
  return useQuery({
    queryKey: queryKeys.chronicleCounts,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('chronicle_entries')
        .select('profile_id, source')
      if (error) throw new Error(error.message)
      const byProfile: Record<string, number> = {}
      let aiTotal = 0
      for (const r of data) {
        byProfile[r.profile_id] = (byProfile[r.profile_id] ?? 0) + 1
        if (r.source === 'ai') aiTotal += 1
      }
      return { total: data.length, aiTotal, byProfile }
    },
  })
}

/** 어르신별 연대기 항목(최신 기록순). */
export function useChronicles(profileId: string | undefined): UseQueryResult<ChronicleRow[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.chronicles(profileId) : ['chronicles', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('chronicle_entries')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('recorded_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 연대기 항목 추가. */
export function useCreateChronicle(): UseMutationResult<ChronicleRow, Error, ChronicleInsert> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ChronicleInsert) => {
      const { data, error } = await getGiokonClient()
        .from('chronicle_entries')
        .insert(input)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.chronicles(row.profile_id) })
      void qc.invalidateQueries({ queryKey: queryKeys.chronicleCounts })
    },
  })
}

/** 연대기 항목 수정. */
export function useUpdateChronicle(): UseMutationResult<
  ChronicleRow,
  Error,
  { id: string; patch: ChronicleUpdate }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { data, error } = await getGiokonClient()
        .from('chronicle_entries')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.chronicles(row.profile_id) })
      void qc.invalidateQueries({ queryKey: queryKeys.chronicleCounts })
    },
  })
}

/** 연대기 항목 삭제. profileId는 캐시 무효화용. */
export function useDeleteChronicle(): UseMutationResult<
  string,
  Error,
  { id: string; profileId: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await getGiokonClient().from('chronicle_entries').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return id
    },
    onSuccess: (_id, { profileId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.chronicles(profileId) })
      void qc.invalidateQueries({ queryKey: queryKeys.chronicleCounts })
    },
  })
}
