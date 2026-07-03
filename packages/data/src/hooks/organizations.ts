// @giokon/data — organizations·users(조직/RBAC) TanStack Query 훅 (M14)
//
// RLS가 격리를 담당한다: 본인 users 행 + (org_admin이면) 같은 기관 구성원·기관 행만
// 노출된다. 따라서 훅은 조직/사용자 필터를 별도로 걸지 않는다.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { OrganizationRow, UserRow } from '../database.types'

/** 현재 로그인 사용자(users 행 — 역할·소속 기관 포함). 비로그인/미부트스트랩 시 null. */
export function useCurrentUser(): UseQueryResult<UserRow | null> {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: async () => {
      const client = getGiokonClient()
      const { data: auth } = await client.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return null
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('id', uid)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 현재 사용자가 속한 기관(RLS로 본인 기관 1행만). */
export function useOrganization(): UseQueryResult<OrganizationRow | null> {
  return useQuery({
    queryKey: queryKeys.organization,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('organizations')
        .select('*')
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 소속 기관 구성원 목록. org_admin이면 기관 전체, 아니면 본인만(RLS). */
export function useOrgMembers(): UseQueryResult<UserRow[]> {
  return useQuery({
    queryKey: queryKeys.orgMembers,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('users')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 기관 정보 수정(org_admin만 — RLS로 강제). */
export function useUpdateOrganization(): UseMutationResult<
  OrganizationRow,
  Error,
  { id: string; name: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }) => {
      const { data, error } = await getGiokonClient()
        .from('organizations')
        .update({ name })
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.organization })
    },
  })
}
