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
import { purgeElderFiles } from '../storage'
import type { ProfileRow, TablesInsert, TablesUpdate } from '../database.types'

export type ProfileInsert = TablesInsert<'profiles'>
export type ProfileUpdate = TablesUpdate<'profiles'>

/** 담당 어르신 목록(최신순). enabled=false로 유휴화 가능(미설정 클라이언트 보호). */
export function useProfiles(options?: { enabled?: boolean }): UseQueryResult<ProfileRow[]> {
  return useQuery({
    queryKey: queryKeys.profiles,
    enabled: options?.enabled ?? true,
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
    onSuccess: (row) => {
      // 상세 캐시를 미리 채운다 — 등록 직후 `/elder/{id}` 로 이동해도 조회를 기다리는
      // 동안 "어르신을 찾을 수 없어요"가 보이지 않게 한다.
      qc.setQueryData(queryKeys.profile(row.id), row)
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

/**
 * 어르신 삭제 — 그 어르신에 딸린 **모든 정보**를 함께 파기한다.
 *
 * DB 는 profiles 를 지우면 연대기·세션·대화·분석·동의·안전 이벤트·요양일지·코드·
 * 배정·공유가 FK cascade 로 함께 사라진다. 하지만 **Storage 객체는 cascade 되지
 * 않아** 사진만 남았다(감사 지적). 그래서 파일을 먼저 지운다.
 *
 * ⚠️ 순서를 바꾸면 안 된다: Storage 삭제 정책이 경로의 profile_id 로 profiles 를
 * 조회해 기관을 확인하므로, 행을 먼저 지우면 파일을 지울 권한이 사라진다.
 */
export function useDeleteProfile(): UseMutationResult<string, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await purgeElderFiles(id)
      // delete()만 호출하면 RLS로 대상 행이 보이지 않거나 이미 삭제된 경우에도
      // PostgREST가 오류 없이 0건 삭제로 응답할 수 있다. 삭제된 id를 돌려받아 실제
      // 파기 여부를 확인해야 화면에서 거짓 성공을 표시하지 않는다.
      const { data, error } = await getGiokonClient()
        .from('profiles')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) {
        throw new Error('삭제 권한이 없거나 이미 삭제된 어르신입니다. 목록을 새로고침해 주세요.')
      }
      return id
    },
    onSuccess: (id) => {
      // 삭제 직후 목록으로 이동할 때 이전 캐시가 잠깐 다시 보이지 않게 즉시 제거한다.
      qc.setQueryData<ProfileRow[]>(queryKeys.profiles, (rows) =>
        rows?.filter((row) => row.id !== id),
      )
      qc.removeQueries({ queryKey: queryKeys.profile(id) })
      void qc.invalidateQueries({ queryKey: queryKeys.profiles })
    },
  })
}
