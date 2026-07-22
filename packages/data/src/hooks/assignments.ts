// @giokon/data — 어르신 영속 코드 + 요양보호사 배정(데이터 연속성) 훅
// (2026-07-22 재설계 — 담당 변경/추가 시 기존 기록 인계)
//
// - elder_codes: 어르신별 영속·비소진 코드. 요양보호사는 조회/회전, 보호자는
//   link RPC 입력으로만 사용(직접 조회 불가 — RLS).
// - profile_caregivers: 어르신↔요양보호사 배정. 코드로 self-claim(claim RPC).
//   배정된 요양보호사는 그 어르신의 기존·신규 기록을 읽고 쓸 수 있다(RLS).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import { claimElderByCode } from '../auth'
import type { ElderCodeRow, ProfileCaregiverRow, UserRow } from '../database.types'

/** 어르신의 영속 코드(요양보호사 화면 — 상시 표시·복사·QR). 미배정 시 RLS로 null. */
export function useElderCode(profileId: string | undefined): UseQueryResult<ElderCodeRow | null> {
  return useQuery({
    queryKey: profileId ? queryKeys.elderCode(profileId) : ['elder_codes', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('elder_codes')
        .select('*')
        .eq('profile_id', profileId as string)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 코드 회전(유출 대비) — 새 코드 발급. 기존 보호자 연결(profile_id 기준)은 유지. */
export function useRotateElderCode(): UseMutationResult<
  ElderCodeRow,
  Error,
  { id: string; newCode: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, newCode }) => {
      const { data, error } = await getGiokonClient()
        .from('elder_codes')
        .update({ code: newCode.toUpperCase(), rotated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.elderCode(row.profile_id) })
    },
  })
}

/** 배정 + 요양보호사 계정 정보(담당 관리 화면). */
export interface CaregiverAssignmentWithUser extends ProfileCaregiverRow {
  caregiver: Pick<UserRow, 'id' | 'name' | 'phone' | 'email'> | null
}

async function attachCaregivers(
  rows: ProfileCaregiverRow[],
): Promise<CaregiverAssignmentWithUser[]> {
  if (rows.length === 0) return []
  const ids = [...new Set(rows.map((r) => r.caregiver_user_id))]
  const { data: users, error } = await getGiokonClient()
    .from('users')
    .select('id, name, phone, email')
    .in('id', ids)
  if (error) throw new Error(error.message)
  const byId = new Map((users ?? []).map((u) => [u.id, u]))
  return rows.map((r) => ({ ...r, caregiver: byId.get(r.caregiver_user_id) ?? null }))
}

/** 특정 어르신의 담당 요양보호사 배정 목록(어르신 상세). */
export function useProfileCaregivers(
  profileId: string | undefined,
): UseQueryResult<CaregiverAssignmentWithUser[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.profileCaregivers(profileId) : ['profile_caregivers', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('profile_caregivers')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('assigned_at', { ascending: true })
      if (error) throw new Error(error.message)
      return attachCaregivers(data)
    },
  })
}

/** 어르신 코드로 담당 배정 self-claim(같은 기관·멱등). 기존 이력 인계. */
export function useClaimElderByCode(): UseMutationResult<
  ProfileCaregiverRow,
  Error,
  { code: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code }) => claimElderByCode(code),
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.profileCaregivers(row.profile_id) })
      void qc.invalidateQueries({ queryKey: queryKeys.myAssignments })
      void qc.invalidateQueries({ queryKey: queryKeys.profiles })
      void qc.invalidateQueries({ queryKey: queryKeys.recentSessions })
    },
  })
}

/** 배정 해제(org_admin/본인) — 소프트 제거(status=removed). */
export function useRemoveCaregiverAssignment(): UseMutationResult<
  ProfileCaregiverRow,
  Error,
  { id: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { data, error } = await getGiokonClient()
        .from('profile_caregivers')
        .update({ status: 'removed', removed_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.profileCaregivers(row.profile_id) })
      void qc.invalidateQueries({ queryKey: queryKeys.myAssignments })
    },
  })
}
