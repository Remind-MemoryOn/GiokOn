import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { InquiryReplyRow, InquiryRow, InquiryStatus, InquiryVisibility, TablesInsert, TablesUpdate } from '../database.types'

export interface InquiryListItem {
  id: string
  title: string
  masked_author: string
  visibility: InquiryVisibility
  status: InquiryStatus
  created_at: string
  reply_count: number
  /** true = 비공개 문의를 남이 본 것. 제목·작성자는 서버가 이미 가려서 보냈고 본문은 열 수 없다. */
  locked: boolean
  /** 필터 없는 전체 건수(행마다 같다) — "더보기" 가 남은 개수를 안다. */
  total: number
}

export interface InquiryPage {
  items: InquiryListItem[]
  /** 서버가 센 전체 건수. 0건이면 0(빈 목록과 조회 실패를 화면이 구분할 수 있게). */
  total: number
}

/**
 * 문의 목록 한 페이지. `limit` 만 늘려 "더보기" 를 구현한다(offset 페이징은 새 글이
 * 끼어들면 행이 밀린다 — 목록이 짧고 최신순이라 누적 조회가 더 정확하다).
 * 서버가 100건에서 자른다.
 */
export function useInquiryList(
  limit = 20,
  options?: { enabled?: boolean },
): UseQueryResult<InquiryPage> {
  return useQuery({
    queryKey: [...queryKeys.inquiries, limit],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient().rpc('list_inquiries', {
        p_limit: limit,
        p_offset: 0,
      })
      if (error) throw new Error(error.message)
      const items = (data ?? []) as InquiryListItem[]
      return { items, total: items[0]?.total ?? 0 }
    },
  })
}

export function useInquiry(id: string | undefined, options?: { enabled?: boolean }): UseQueryResult<InquiryRow | null> {
  return useQuery({
    queryKey: id ? queryKeys.inquiry(id) : ['inquiries', 'detail', 'none'],
    enabled: Boolean(id) && (options?.enabled ?? true),
    queryFn: async () => {
      const { data, error } = await getGiokonClient().from('inquiries').select('*').eq('id', id as string).maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useInquiryReplies(id: string | undefined, options?: { enabled?: boolean }): UseQueryResult<InquiryReplyRow[]> {
  return useQuery({
    queryKey: id ? queryKeys.inquiryReplies(id) : ['inquiry_replies', 'none'],
    enabled: Boolean(id) && (options?.enabled ?? true),
    queryFn: async () => {
      const { data, error } = await getGiokonClient().from('inquiry_replies').select('*').eq('inquiry_id', id as string).order('created_at')
      if (error) throw new Error(error.message)
      return data
    },
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>, id?: string) {
  void qc.invalidateQueries({ queryKey: queryKeys.inquiries })
  if (id) {
    void qc.invalidateQueries({ queryKey: queryKeys.inquiry(id) })
    void qc.invalidateQueries({ queryKey: queryKeys.inquiryReplies(id) })
  }
}

export function useCreateInquiry(): UseMutationResult<InquiryRow, Error, TablesInsert<'inquiries'>> {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (input) => { const { data, error } = await getGiokonClient().from('inquiries').insert(input).select().single(); if (error) throw new Error(error.message); return data }, onSuccess: (row) => invalidate(qc, row.id) })
}

export function useUpdateInquiry(): UseMutationResult<InquiryRow, Error, { id: string; patch: TablesUpdate<'inquiries'> }> {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async ({ id, patch }) => { const { data, error } = await getGiokonClient().from('inquiries').update(patch).eq('id', id).select().single(); if (error) throw new Error(error.message); return data }, onSuccess: (row) => invalidate(qc, row.id) })
}

export function useDeleteInquiry(): UseMutationResult<void, Error, string> {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id) => { const { error } = await getGiokonClient().from('inquiries').delete().eq('id', id); if (error) throw new Error(error.message) }, onSuccess: () => invalidate(qc) })
}

export function useCreateInquiryReply(): UseMutationResult<InquiryReplyRow, Error, TablesInsert<'inquiry_replies'>> {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (input) => { const { data, error } = await getGiokonClient().from('inquiry_replies').insert(input).select().single(); if (error) throw new Error(error.message); return data }, onSuccess: (row) => invalidate(qc, row.inquiry_id) })
}

export function useUpdateInquiryReply(): UseMutationResult<InquiryReplyRow, Error, { id: string; inquiryId: string; content: string }> {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async ({ id, content }) => { const { data, error } = await getGiokonClient().from('inquiry_replies').update({ content }).eq('id', id).select().single(); if (error) throw new Error(error.message); return data }, onSuccess: (row) => invalidate(qc, row.inquiry_id) })
}

export function useDeleteInquiryReply(): UseMutationResult<void, Error, { id: string; inquiryId: string }> {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async ({ id }) => { const { error } = await getGiokonClient().from('inquiry_replies').delete().eq('id', id); if (error) throw new Error(error.message) }, onSuccess: (_data, vars) => invalidate(qc, vars.inquiryId) })
}
