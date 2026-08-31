// @giokon/data — 요양일지 사진(journal_photos) TanStack Query 훅
//
// 새 웹 디자인은 일지에 사진을 **여러 장** 붙이고(221:1196), 보호자는 그것을 날짜순
// 갤러리로 본다(55:2035). 파일은 private 버킷 `journal-photos` 에 두고 이 표에는
// 경로만 저장한다 — 표시용 URL 은 화면에서 signed URL 로 바꾼다.
//
// ⚠️ 경로 규약 `<profile_id>/<파일명>` — Storage 정책이 첫 구간으로 기관을 확인한다.
// ⚠️ 파기 순서: 행보다 **파일을 먼저** 지운다(프로필이 사라지면 파일을 못 지운다).
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { JournalPhotoRow, TablesInsert } from '../database.types'

export type JournalPhotoInsert = TablesInsert<'journal_photos'>

/** 일지 한 건의 첨부 사진(정렬순). */
export function useJournalPhotos(
  journalId: string | undefined,
): UseQueryResult<JournalPhotoRow[]> {
  return useQuery({
    queryKey: journalId ? queryKeys.journalPhotos(journalId) : ['journal_photos', 'none'],
    enabled: Boolean(journalId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('journal_photos')
        .select('*')
        .eq('journal_id', journalId as string)
        .order('sort', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/**
 * 여러 일지의 사진을 한 번에(보호자 갤러리·목록 카드의 "관련 사진 (n장)").
 * `journalIds` 가 비면 요청하지 않는다.
 */
export function useJournalPhotosByJournals(
  journalIds: string[],
  options?: { enabled?: boolean },
): UseQueryResult<JournalPhotoRow[]> {
  const ids = [...new Set(journalIds)].sort()
  return useQuery({
    queryKey: [...queryKeys.orgJournalPhotos, ids],
    enabled: (options?.enabled ?? true) && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('journal_photos')
        .select('*')
        .in('journal_id', ids)
        .order('sort', { ascending: true })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 첨부 추가(업로드는 화면에서 먼저 하고 경로만 넘긴다). */
export function useAddJournalPhoto(): UseMutationResult<
  JournalPhotoRow,
  Error,
  JournalPhotoInsert
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const { data, error } = await getGiokonClient()
        .from('journal_photos')
        .insert(input)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.journalPhotos(row.journal_id) })
      void qc.invalidateQueries({ queryKey: queryKeys.orgJournalPhotos })
    },
  })
}

/** 첨부 제거 — 행만 지운다. **파일 삭제는 호출부가 먼저** 한다(정책 순서). */
export function useRemoveJournalPhoto(): UseMutationResult<
  void,
  Error,
  { id: string; journalId: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await getGiokonClient().from('journal_photos').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_r, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.journalPhotos(vars.journalId) })
      void qc.invalidateQueries({ queryKey: queryKeys.orgJournalPhotos })
    },
  })
}
