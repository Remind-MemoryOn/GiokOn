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

// ── 관리 역할(org_admin · center_director) 쪽 — 초대 코드 발급·회수 · 합류 승인·거절(웹 W6) ──────────
// 권한 판정은 RPC 가 한다(ORG_INVITE_FORBIDDEN · ORG_JOIN_FORBIDDEN). 읽기도 RLS 가 관리 역할 + 같은 기관만 준다.

export type OrgInviteRow = Database['public']['Tables']['org_invites']['Row']
/** 초대로 줄 수 있는 역할 — guardian·org_admin 은 서버가 거절한다(ORG_INVITE_ROLE). */
export type InvitableRole = 'caregiver' | 'social_worker' | 'center_director'

/** 아직 쓸 수 있는 초대 코드(회수·만료 제외, 최신순). */
export function useOrgInvites(options?: { enabled?: boolean }): UseQueryResult<OrgInviteRow[]> {
  return useQuery({
    queryKey: queryKeys.orgInvites,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('org_invites')
        .select('*')
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

export function useCreateOrgInvite(): UseMutationResult<OrgInviteRow, Error, { role: InvitableRole; validDays: number }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ role, validDays }) => {
      const { data, error } = await getGiokonClient().rpc('create_org_invite', { p_role: role, p_valid_days: validDays })
      if (error) throw new Error(error.message)
      return data as OrgInviteRow
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.orgInvites }),
  })
}

export function useRevokeOrgInvite(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getGiokonClient().rpc('revoke_org_invite', { p_invite_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.orgInvites }),
  })
}

/** 우리 기관으로 들어온 대기 중 합류 요청(오래된 순). */
export function useOrgJoinRequests(options?: { enabled?: boolean }): UseQueryResult<OrgJoinRequestRow[]> {
  return useQuery({
    queryKey: queryKeys.orgJoinRequests,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('org_join_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return data ?? []
    },
  })
}

function useDecideOrgJoin(fn: 'approve_org_join' | 'reject_org_join'): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await getGiokonClient().rpc(fn, { p_request_id: requestId })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.orgJoinRequests })
      // 승인되면 구성원 목록에 새 사람이 생긴다.
      void qc.invalidateQueries({ queryKey: queryKeys.orgMembers })
    },
  })
}

/** 합류 승인 — 승인되는 사람은 기관 전체 어르신 기록을 보게 된다(화면이 그 사실을 먼저 알린다). */
export const useApproveOrgJoin = () => useDecideOrgJoin('approve_org_join')
export const useRejectOrgJoin = () => useDecideOrgJoin('reject_org_join')
