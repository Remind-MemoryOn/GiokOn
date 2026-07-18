// @giokon/data — 보호자 초대·연결 TanStack Query 훅 (T17.1·T17.7 / Phase W1)
//
// 흐름: 요양보호사가 어르신별 초대 코드 발급(1회성·72h, QR=코드 URL) → 보호자가
// 온보딩 또는 로그인 후 "어르신 연결"에서 코드 사용(redeem RPC) → pending →
// 요양보호사 승인(approved) → 보호자는 공개 커밋(guardian_shares) 경유 열람.
// RLS: 초대=기관 돌봄 구성원 전용 / 연결=보호자 본인 행 + 기관 돌봄 구성원.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import { redeemGuardianInvite } from '../auth'
import type { GuardianInviteRow, ProfileGuardianRow, UserRow } from '../database.types'

/** 특정 어르신의 초대 코드 이력(요양보호사 화면, 최신순). */
export function useGuardianInvites(
  profileId: string | undefined,
): UseQueryResult<GuardianInviteRow[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.guardianInvites(profileId) : ['guardian_invites', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('guardian_invites')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 초대 코드 발급(1회성·72h). 반환 row 의 code 를 QR/복사로 보호자에게 전달. */
export function useCreateGuardianInvite(): UseMutationResult<
  GuardianInviteRow,
  Error,
  { profileId: string; createdBy: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ profileId, createdBy }) => {
      const { data, error } = await getGiokonClient()
        .from('guardian_invites')
        .insert({ profile_id: profileId, created_by: createdBy })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.guardianInvites(row.profile_id) })
    },
  })
}

/** 초대 코드 취소(미사용 코드 무효화). */
export function useRevokeGuardianInvite(): UseMutationResult<
  GuardianInviteRow,
  Error,
  { id: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { data, error } = await getGiokonClient()
        .from('guardian_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.guardianInvites(row.profile_id) })
    },
  })
}

/** 연결 + 보호자 계정 정보(승인 화면 표시용). */
export interface GuardianLinkWithUser extends ProfileGuardianRow {
  guardian: Pick<UserRow, 'id' | 'name' | 'phone' | 'email'> | null
}

async function attachGuardianUsers(
  links: ProfileGuardianRow[],
): Promise<GuardianLinkWithUser[]> {
  if (links.length === 0) return []
  const ids = [...new Set(links.map((l) => l.guardian_user_id))]
  const { data: users, error } = await getGiokonClient()
    .from('users')
    .select('id, name, phone, email')
    .in('id', ids)
  if (error) throw new Error(error.message)
  const byId = new Map((users ?? []).map((u) => [u.id, u]))
  return links.map((l) => ({ ...l, guardian: byId.get(l.guardian_user_id) ?? null }))
}

/** 기관의 보호자 연결 전체(요양보호사 승인 관리 — 대기/승인/철회 포함). */
export function useOrgGuardianLinks(options?: {
  enabled?: boolean
}): UseQueryResult<GuardianLinkWithUser[]> {
  return useQuery({
    queryKey: queryKeys.orgGuardianLinks,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('profile_guardians')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return attachGuardianUsers(data)
    },
  })
}

/** 특정 어르신의 보호자 연결 목록(어르신 상세 화면). */
export function useGuardianLinks(
  profileId: string | undefined,
): UseQueryResult<GuardianLinkWithUser[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.guardianLinks(profileId) : ['profile_guardians', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('profile_guardians')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return attachGuardianUsers(data)
    },
  })
}

/** 보호자 본인의 연결 목록(보호자 대시보드 — RLS 가 본인 행만 반환). */
export function useMyGuardianLinks(options?: {
  enabled?: boolean
}): UseQueryResult<ProfileGuardianRow[]> {
  return useQuery({
    queryKey: queryKeys.myGuardianLinks,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('profile_guardians')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

function invalidateLinks(qc: ReturnType<typeof useQueryClient>, row: ProfileGuardianRow): void {
  void qc.invalidateQueries({ queryKey: queryKeys.orgGuardianLinks })
  void qc.invalidateQueries({ queryKey: queryKeys.guardianLinks(row.profile_id) })
  void qc.invalidateQueries({ queryKey: queryKeys.myGuardianLinks })
}

/** 연결 승인(요양보호사) — 승인자·시각 기록. */
export function useApproveGuardianLink(): UseMutationResult<
  ProfileGuardianRow,
  Error,
  { id: string; userId: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, userId }) => {
      const { data, error } = await getGiokonClient()
        .from('profile_guardians')
        .update({
          status: 'approved',
          approved_by: userId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => invalidateLinks(qc, row),
  })
}

/** 연결 철회(요양보호사) — 거절·해지 공용(이력 보존, 삭제 아님). */
export function useRevokeGuardianLink(): UseMutationResult<
  ProfileGuardianRow,
  Error,
  { id: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { data, error } = await getGiokonClient()
        .from('profile_guardians')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => invalidateLinks(qc, row),
  })
}

/** 초대 코드 사용(보호자 — 온보딩·로그인 후 "어르신 연결" 공용). */
export function useRedeemGuardianInvite(): UseMutationResult<
  ProfileGuardianRow,
  Error,
  { code: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code }) => redeemGuardianInvite(code),
    onSuccess: (row) => invalidateLinks(qc, row),
  })
}
