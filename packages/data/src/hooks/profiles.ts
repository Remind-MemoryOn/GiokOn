// @giokon/data — profiles(어르신 연대기) TanStack Query 훅
//
// RLS가 user_id = auth.uid()로 소유자 행만 노출하므로 클라이언트에서 별도
// user_id 필터를 걸 필요가 없다(insert 시에는 명시 필요).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { ProfileRow, TablesInsert, TablesUpdate } from '../database.types'

export type ProfileInsert = TablesInsert<'profiles'>
export type ProfileUpdate = TablesUpdate<'profiles'>

/** 담당 어르신 목록(최신순). */
export function useProfiles(): UseQueryResult<ProfileRow[]> {
  return useQuery({
    queryKey: queryKeys.profiles,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 단일 어르신 연대기. */
export function useProfile(id: string | undefined): UseQueryResult<ProfileRow | null> {
  return useQuery({
    queryKey: id ? queryKeys.profile(id) : ['profiles', 'detail', 'none'],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('profiles')
        .select('*')
        .eq('id', id as string)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 연대기 등록. */
export function useCreateProfile(): UseMutationResult<ProfileRow, Error, ProfileInsert> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ProfileInsert) => {
      const { data, error } = await getGiokonClient()
        .from('profiles')
        .insert(input)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.profiles })
    },
  })
}

/** 연대기 수정. */
export function useUpdateProfile(): UseMutationResult<
  ProfileRow,
  Error,
  { id: string; patch: ProfileUpdate }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { data, error } = await getGiokonClient()
        .from('profiles')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.profiles })
      void qc.invalidateQueries({ queryKey: queryKeys.profile(row.id) })
    },
  })
}

/** 연대기 삭제. */
export function useDeleteProfile(): UseMutationResult<string, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getGiokonClient().from('profiles').delete().eq('id', id)
      if (error) throw new Error(error.message)
      return id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.profiles })
    },
  })
}
