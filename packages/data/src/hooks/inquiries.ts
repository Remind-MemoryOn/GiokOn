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
}

export function useInquiryList(options?: { enabled?: boolean }): UseQueryResult<InquiryListItem[]> {
  return useQuery({
    queryKey: queryKeys.inquiries,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient().rpc('list_inquiries')
      if (error) throw new Error(error.message)
      return (data ?? []) as InquiryListItem[]
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
