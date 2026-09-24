// @giokon/data — consents(동의) TanStack Query 훅 (M9.1 / M9.4)
//
// 동의 기록은 삭제하지 않는다(철회=revoked_at). RLS로 본인(수집자) + 같은 기관
// 관리자만 접근한다. org_id는 INSERT 시 트리거가 자동 스탬프하므로 지정 불필요.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { ConsentRow, TablesInsert } from '../database.types'

export type ConsentInsert = TablesInsert<'consents'>

/** 내가 기록한 동의 전체(정보주체 권리 — 데이터 내보내기용). RLS로 본인+기관 범위. */
export function useMyConsents(): UseQueryResult<ConsentRow[]> {
  return useQuery({
    queryKey: queryKeys.myConsents,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('consents')
        .select('*')
        .order('granted_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 특정 어르신의 동의 이력(최신순). */
export function useConsents(profileId: string | undefined): UseQueryResult<ConsentRow[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.consents(profileId) : ['consents', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('consents')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('granted_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 동의 기록. user_id는 호출자가 현재 사용자 id로 지정한다(수집자). */
export function useRecordConsent(): UseMutationResult<ConsentRow, Error, ConsentInsert> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ConsentInsert) => {
      const { data, error } = await getGiokonClient()
        .from('consents')
        .insert(input)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      if (row.profile_id) {
        // 등록 직후 상세 화면으로 이동할 때 refetch를 기다리지 않아도 방금 저장한
        // 동의가 즉시 체크 상태로 보이도록 캐시에 증빙을 먼저 반영한다.
        qc.setQueryData<ConsentRow[]>(queryKeys.consents(row.profile_id), (current) => [
          row,
          ...(current ?? []).filter((item) => item.id !== row.id),
        ])
        void qc.invalidateQueries({ queryKey: queryKeys.consents(row.profile_id) })
      }
    },
  })
}

/** 동의 철회(삭제가 아니라 revoked_at 기록 + granted=false). */
export function useRevokeConsent(): UseMutationResult<ConsentRow, Error, { id: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { data, error } = await getGiokonClient()
        .from('consents')
        .update({ revoked_at: new Date().toISOString(), granted: false })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      if (row.profile_id) {
        qc.setQueryData<ConsentRow[]>(queryKeys.consents(row.profile_id), (current) =>
          (current ?? []).map((item) => (item.id === row.id ? row : item)),
        )
        void qc.invalidateQueries({ queryKey: queryKeys.consents(row.profile_id) })
      }
    },
  })
}
