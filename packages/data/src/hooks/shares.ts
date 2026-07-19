// @giokon/data — 보호자 공개 커밋(guardian_shares) TanStack Query 훅 (T17.2·T17.3)
//
// 요양보호사: 체크리스트에서 공개/철회(SCR-W08). 보호자: 승인된 연결의 미철회
// 커밋 + 공개된 원본(일지·분석)만 열람(SCR-W09) — 전부 서버 RLS 강제(F-29).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type {
  CareJournalRow,
  GuardianShareRow,
  SessionAnalysisRow,
  ShareItemType,
  TablesInsert,
} from '../database.types'

export type GuardianShareInsert = TablesInsert<'guardian_shares'>

/** 어르신별 공개 이력(요양보호사 체크리스트 화면 — 철회 포함 전체). */
export function useGuardianShares(
  profileId: string | undefined,
): UseQueryResult<GuardianShareRow[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.guardianShares(profileId) : ['guardian_shares', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('guardian_shares')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('shared_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 기관 전체 공개 이력(요양보호사 — 어르신 필터는 클라이언트에서). */
export function useOrgGuardianShares(options?: {
  enabled?: boolean
}): UseQueryResult<GuardianShareRow[]> {
  return useQuery({
    queryKey: ['guardian_shares', 'org'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('guardian_shares')
        .select('*')
        .order('shared_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 공개(커밋) — 같은 항목의 활성 공개는 1건만(서버 unique 인덱스). */
export function useCreateGuardianShare(): UseMutationResult<
  GuardianShareRow,
  Error,
  GuardianShareInsert
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: GuardianShareInsert) => {
      const { data, error } = await getGiokonClient()
        .from('guardian_shares')
        .insert(input)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.guardianShares(row.profile_id) })
      void qc.invalidateQueries({ queryKey: ['guardian_shares', 'org'] })
      void qc.invalidateQueries({ queryKey: queryKeys.myShares })
    },
  })
}

/** 철회 — 보호자 화면에서 즉시 사라진다(원본 접근도 차단). */
export function useRevokeGuardianShare(): UseMutationResult<
  GuardianShareRow,
  Error,
  { id: string; userId: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, userId }) => {
      const { data, error } = await getGiokonClient()
        .from('guardian_shares')
        .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.guardianShares(row.profile_id) })
      void qc.invalidateQueries({ queryKey: ['guardian_shares', 'org'] })
      void qc.invalidateQueries({ queryKey: queryKeys.myShares })
    },
  })
}

export interface MySharedContent {
  shares: GuardianShareRow[]
  journals: CareJournalRow[]
  analyses: SessionAnalysisRow[]
}

/**
 * 보호자 타임라인 — 내게 공개된 커밋 + 공개된 원본(일지·분석)을 한 번에.
 * RLS: 승인된 연결 + 미철회 커밋 + 공개된 원본만 반환된다.
 */
export function useMySharedContent(options?: {
  enabled?: boolean
}): UseQueryResult<MySharedContent> {
  return useQuery({
    queryKey: queryKeys.myShares,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const client = getGiokonClient()
      const { data: shares, error } = await client
        .from('guardian_shares')
        .select('*')
        .order('shared_at', { ascending: false })
      if (error) throw new Error(error.message)

      const idsOf = (type: ShareItemType) =>
        (shares ?? []).filter((s) => s.item_type === type).map((s) => s.item_id)

      const journalIds = idsOf('journal')
      const analysisIds = idsOf('analysis')

      const [journalsRes, analysesRes] = await Promise.all([
        journalIds.length > 0
          ? client.from('care_journals').select('*').in('id', journalIds)
          : Promise.resolve({ data: [] as CareJournalRow[], error: null }),
        analysisIds.length > 0
          ? client.from('session_analyses').select('*').in('id', analysisIds)
          : Promise.resolve({ data: [] as SessionAnalysisRow[], error: null }),
      ])
      if (journalsRes.error) throw new Error(journalsRes.error.message)
      if (analysesRes.error) throw new Error(analysesRes.error.message)

      return {
        shares: shares ?? [],
        journals: journalsRes.data ?? [],
        analyses: analysesRes.data ?? [],
      }
    },
  })
}
