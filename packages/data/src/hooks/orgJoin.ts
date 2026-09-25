// @giokon/data — 직원 합류 요청(파일럿 D3 · 웹 W9): 요청자 본인 쪽 훅
//
// 쓰기는 전부 RPC 다(org_join_requests 는 Insert/Update never). 읽기는 RLS 가 본인 행만 준다.
// 오류는 서버의 코드 식별자(ORG_INVITE_INVALID · ORG_JOIN_PENDING · ORG_JOIN_FORBIDDEN · ORG_JOIN_NOT_FOUND)를
// 그대로 던진다 — 문구 변환은 화면이 한다.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { Database } from '../database.types'

export type OrgJoinRequestRow = Database['public']['Tables']['org_join_requests']['Row']

/** 내 합류 요청(최신순). 승인 대기 화면이 가장 최근 요청의 상태를 보여 준다. */
export function useMyOrgJoinRequests(options?: { enabled?: boolean }): UseQueryResult<OrgJoinRequestRow[]> {
  return useQuery({
    queryKey: queryKeys.myOrgJoinRequests,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const client = getGiokonClient()
      const { data: auth } = await client.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return []
      const { data, error } = await client
        .from('org_join_requests')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

/** 거절·취소 뒤 다른 초대 코드로 다시 요청(RPC request_org_join). */
export function useRequestOrgJoin(): UseMutationResult<OrgJoinRequestRow, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await getGiokonClient().rpc('request_org_join', { p_code: code.trim() })
      if (error) throw new Error(error.message)
      return data as OrgJoinRequestRow
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.myOrgJoinRequests }),
  })
}

/** 대기 중인 합류 요청 취소(RPC cancel_org_join). */
export function useCancelOrgJoin(): UseMutationResult<void, Error, void> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await getGiokonClient().rpc('cancel_org_join', {})
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.myOrgJoinRequests }),
  })
}
