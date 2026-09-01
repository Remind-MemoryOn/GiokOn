// @giokon/data — 알림(notifications) TanStack Query 훅
//
// 신규 웹 디자인의 탑바 벨 + 개수 배지가 읽는 값이다. 전용 알림 센터 화면은
// 디자인에 없으므로 **벨 배지와 드롭다운까지**가 이 테이블의 소비처다.
//
// 알림은 클라이언트가 만들지 않는다 — 안전 이벤트·보호자 확인에서 DB 트리거가
// 파생한다(마이그레이션 20260901010000). 그래서 insert 훅이 없고, RLS 도
// select/update(본인 것) 두 정책뿐이다. 읽음 처리 = `read_at` 채우기.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { NotificationRow } from '../database.types'

/** 내 알림함(최신순). RLS 가 `user_id = auth.uid()` 로 좁힌다. */
export function useMyNotifications(options?: {
  enabled?: boolean
  /** 벨 드롭다운은 최근 것만 보여준다. */
  limit?: number
}): UseQueryResult<NotificationRow[]> {
  const limit = options?.limit ?? 30
  return useQuery({
    queryKey: queryKeys.myNotifications,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 알림 하나를 읽음 처리(이미 읽은 알림은 시각을 덮어쓰지 않는다). */
export function useMarkNotificationRead(): UseMutationResult<NotificationRow, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await getGiokonClient()
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.myNotifications })
    },
  })
}

/** 드롭다운의 "모두 읽음" — 안 읽은 것만 갱신한다. */
export function useMarkAllNotificationsRead(): UseMutationResult<number, Error, void> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null)
        .select('id')
      if (error) throw new Error(error.message)
      return (data ?? []).length
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.myNotifications })
    },
  })
}

/** 안 읽은 알림 수 — 배지에 그대로 쓴다(0 이면 배지를 감춘다). */
export function unreadCount(rows: NotificationRow[] | undefined): number {
  return (rows ?? []).filter((r) => r.read_at === null).length
}
