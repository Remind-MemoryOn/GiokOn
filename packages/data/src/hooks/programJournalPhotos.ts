// @giokon/data — 프로그램 일지 사진(program_journal_photos · 파일럿 D5) TanStack Query 훅
//
// 파일은 private 버킷 `journal-photos` 를 그대로 쓰고(경로 규약 `<profile_id>/<파일명>` —
// Storage 정책이 첫 구간으로 기관을 확인한다) 이 표에는 경로만 둔다. 표시 URL 은 화면이 signed URL 로 만든다.
// ⚠️ 파기 순서: 행보다 **파일을 먼저** 지운다. 확정 일지의 사진은 뺄 수 없다(RLS).
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { ProgramJournalPhotoRow, TablesInsert } from '../database.types'

export type ProgramJournalPhotoInsert = TablesInsert<'program_journal_photos'>

/** 일지 한 건의 첨부 사진(정렬순). */
export function useProgramJournalPhotos(journalId: string | undefined): UseQueryResult<ProgramJournalPhotoRow[]> {
  return useQuery({
    queryKey: journalId ? queryKeys.programJournalPhotos(journalId) : ['program_journal_photos', 'none'],
    enabled: Boolean(journalId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('program_journal_photos')
        .select('*')
        .eq('journal_id', journalId as string)
        .order('sort', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 여러 일지의 사진을 한 번에(목록 카드 "관련 사진 (n장)"). `journalIds` 가 비면 요청하지 않는다. */
export function useProgramJournalPhotosByJournals(
  journalIds: string[],
  options?: { enabled?: boolean },
): UseQueryResult<ProgramJournalPhotoRow[]> {
  const ids = [...new Set(journalIds)].sort()
  return useQuery({
    queryKey: [...queryKeys.orgProgramJournalPhotos, ids],
    enabled: (options?.enabled ?? true) && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('program_journal_photos')
        .select('*')
        .in('journal_id', ids)
        .order('sort', { ascending: true })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 첨부 추가(업로드는 화면에서 먼저 하고 경로만 넘긴다). */
export function useAddProgramJournalPhoto(): UseMutationResult<ProgramJournalPhotoRow, Error, ProgramJournalPhotoInsert> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const { data, error } = await getGiokonClient().from('program_journal_photos').insert(input).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.programJournalPhotos(row.journal_id) })
      void qc.invalidateQueries({ queryKey: queryKeys.orgProgramJournalPhotos })
    },
  })
}

/** 첨부 제거 — 행만 지운다. **파일 삭제는 호출부가 먼저** 한다(정책 순서). */
export function useRemoveProgramJournalPhoto(): UseMutationResult<void, Error, { id: string; journalId: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await getGiokonClient().from('program_journal_photos').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_r, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.programJournalPhotos(vars.journalId) })
      void qc.invalidateQueries({ queryKey: queryKeys.orgProgramJournalPhotos })
    },
  })
}
