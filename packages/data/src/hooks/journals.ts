// @giokon/data — 요양일지(care_journals) TanStack Query 훅 (T19.1·T19.2)
//
// 작성 3경로(사진/음성/타이핑)의 산출물이 저장되는 곳. AI 초안(core buildJournalDraft)
// 은 항상 사람 확인 후 저장(F-25). 보호자 노출은 공개 커밋(guardian_shares) 경유만.
// 민감정보 취급 — RLS: 기관 돌봄 구성원(비 guardian), final 삭제 불가.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { CareJournalRow, TablesInsert, TablesUpdate } from '../database.types'

export type CareJournalInsert = TablesInsert<'care_journals'>
export type CareJournalUpdate = TablesUpdate<'care_journals'>

/** 어르신별 일지 이력(최신 날짜순). */
export function useCareJournals(
  profileId: string | undefined,
): UseQueryResult<CareJournalRow[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.careJournals(profileId) : ['care_journals', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('care_journals')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('journal_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 기관 전체 최근 일지(공개 체크리스트·목록용). */
export function useOrgCareJournals(options?: {
  limit?: number
  enabled?: boolean
}): UseQueryResult<CareJournalRow[]> {
  const limit = options?.limit ?? 100
  return useQuery({
    queryKey: [...queryKeys.orgCareJournals, limit],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('care_journals')
        .select('*')
        .order('journal_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      return data
    },
  })
}

function invalidateJournals(qc: ReturnType<typeof useQueryClient>, row: CareJournalRow): void {
  void qc.invalidateQueries({ queryKey: queryKeys.careJournals(row.profile_id) })
  void qc.invalidateQueries({ queryKey: queryKeys.orgCareJournals })
}

/** 일지 저장(초안/확정 — status 로 구분). */
export function useCreateCareJournal(): UseMutationResult<
  CareJournalRow,
  Error,
  CareJournalInsert
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CareJournalInsert) => {
      const { data, error } = await getGiokonClient()
        .from('care_journals')
        .insert(input)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => invalidateJournals(qc, row),
  })
}

/** 일지 수정(내용 보완·초안 확정). */
export function useUpdateCareJournal(): UseMutationResult<
  CareJournalRow,
  Error,
  { id: string; patch: CareJournalUpdate }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { data, error } = await getGiokonClient()
        .from('care_journals')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => invalidateJournals(qc, row),
  })
}

/** 초안 삭제(작성자 본인 — final 은 RLS 가 차단). */
export function useDeleteCareJournal(): UseMutationResult<
  void,
  Error,
  { id: string; profileId: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await getGiokonClient().from('care_journals').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.careJournals(vars.profileId) })
      void qc.invalidateQueries({ queryKey: queryKeys.orgCareJournals })
    },
  })
}
