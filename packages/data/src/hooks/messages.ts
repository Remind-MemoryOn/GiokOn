// @giokon/data — 보호자 메시지(messages) TanStack Query 훅
//
// 보호자 → 담당 요양보호사 **단방향**(디자인 확정). 요양보호사는 읽기만 하고,
// 수신 자체는 알림으로 간다(트리거 app.notify_message). 이용 안내 모달이
// "내용과 전송 시간이 자동으로 저장됩니다" 라고 약속하므로 append-only 다 —
// 수정·삭제 훅을 두지 않는다(서버에도 정책이 없다).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { MessageRow } from '../database.types'

/** 어르신 단위 메시지(최신순) — 담당 요양보호사와 보낸 보호자만 보인다(RLS). */
export function useMessages(
  profileId: string | undefined,
  options?: { enabled?: boolean },
): UseQueryResult<MessageRow[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.messages(profileId) : ['messages', 'none'],
    enabled: Boolean(profileId) && (options?.enabled ?? true),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('messages')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 보호자가 보낸 메시지 전체(연결 어르신이 여럿일 수 있다). */
export function useMyMessages(options?: { enabled?: boolean }): UseQueryResult<MessageRow[]> {
  return useQuery({
    queryKey: queryKeys.myMessages,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export interface SendMessageInput {
  profileId: string
  senderUserId: string
  body: string
}

/** 메시지 보내기 — 승인된 연결의 보호자만 통과한다(RLS). */
export function useSendMessage(): UseMutationResult<MessageRow, Error, SendMessageInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ profileId, senderUserId, body }) => {
      const { data, error } = await getGiokonClient()
        .from('messages')
        .insert({ profile_id: profileId, sender_user_id: senderUserId, body: body.trim() })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.messages(row.profile_id) })
      void qc.invalidateQueries({ queryKey: queryKeys.myMessages })
    },
  })
}
