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

/**
 * 코드 회전(유출 대비) — 서버가 새 코드를 발급(rotate_elder_code RPC).
 * 코드는 서버에서 매번 새로 생성되어 예측·재사용이 불가능하며(클라이언트 생성 금지),
 * profile_id 는 불변이므로 기존 보호자 연결(profile_id 기준)은 그대로 유지된다.
 */
export function useRotateElderCode(): UseMutationResult<
  ElderCodeRow,
  Error,
  { profileId: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ profileId }) => {
      const { data, error } = await getGiokonClient().rpc('rotate_elder_code', {
        p_profile_id: profileId,
      })
      if (error) throw new Error(error.message)
      return data as ElderCodeRow
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
      void qc.invalidateQueries({ queryKey: queryKeys.orgPendingAssignments })
      void qc.invalidateQueries({ queryKey: queryKeys.profiles })
      void qc.invalidateQueries({ queryKey: queryKeys.recentSessions })
    },
  })
}

/**
 * 배정 승인(approve_caregiver_assignment RPC) — 관리자/활성 담당이 pending → active.
 * 신규 합류 요양보호사의 기관 접근을 승인 게이트로 확정한다(본인 자가승인 불가).
 */
export function useApproveCaregiverAssignment(): UseMutationResult<
  ProfileCaregiverRow,
  Error,
  { id: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { data, error } = await getGiokonClient().rpc('approve_caregiver_assignment', {
        p_id: id,
      })
      if (error) throw new Error(error.message)
      return data as ProfileCaregiverRow
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.profileCaregivers(row.profile_id) })
      void qc.invalidateQueries({ queryKey: queryKeys.myAssignments })
      void qc.invalidateQueries({ queryKey: queryKeys.orgPendingAssignments })
    },
  })
}

/** 내 배정 중 승인 대기(pending) 목록 — 기관 합류 요청 상태 표시용. */
export function useMyPendingAssignments(
  userId: string | undefined,
): UseQueryResult<ProfileCaregiverRow[]> {
  return useQuery({
    queryKey: queryKeys.myAssignments,
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('profile_caregivers')
        .select('*')
        .eq('caregiver_user_id', userId as string)
        .eq('status', 'pending')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/**
 * 기관에 들어온 **승인 대기 배정 전부**(합류 승인 화면).
 * RLS 가 같은 기관·비보호자만 통과시키므로 여기서 기관을 다시 거르지 않는다.
 * ⚠️ 자기 자신의 요청은 승인할 수 없다(서버가 3중으로 막는다) — 화면도 그렇게 그린다.
 */
export function useOrgPendingAssignments(options?: {
  enabled?: boolean
}): UseQueryResult<CaregiverAssignmentWithUser[]> {
  return useQuery({
    queryKey: queryKeys.orgPendingAssignments,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('profile_caregivers')
        .select('*')
        .eq('status', 'pending')
        .order('assigned_at', { ascending: true })
      if (error) throw new Error(error.message)
      return attachCaregivers(data)
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
      void qc.invalidateQueries({ queryKey: queryKeys.orgPendingAssignments })
    },
  })
}
