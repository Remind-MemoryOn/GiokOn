// @giokon/data — 보호자 연결 TanStack Query 훅 (T17.7 재설계 / 어르신 영속 코드)
//
// 흐름: 어르신은 영속 코드(elder_codes)를 가진다 → 보호자가 온보딩/로그인 후
// "어르신 연결"에서 코드 사용(link RPC·비소진·멱등) → pending → 요양보호사
// 승인(approved) → 보호자는 공개 커밋(guardian_shares) 경유 열람.
// RLS: 연결=보호자 본인 행 + 기관 돌봄 구성원. (어르신 코드·요양보호사 배정은
// hooks/assignments.ts 참조.)

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import { linkGuardianByElderCode } from '../auth'
import type { ProfileGuardianRow, UserRow } from '../database.types'

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

/** 어르신 영속 코드로 연결(보호자 — 온보딩·로그인 후 "어르신 연결" 공용, 비소진). */
export function useLinkGuardianByElderCode(): UseMutationResult<
  ProfileGuardianRow,
  Error,
  { code: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code }) => linkGuardianByElderCode(code),
    onSuccess: (row) => invalidateLinks(qc, row),
  })
}
