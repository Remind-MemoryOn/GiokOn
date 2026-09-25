// @giokon/data — Supabase Realtime 구독 훅 (T-E3 / Phase W2)
//
// 앱(모바일)에서 세션이 종료되면 sessions·session_analyses 가 insert/update 되고,
// 웹 대시보드·분석 화면은 이 훅으로 postgres_changes 를 구독해 해당 TanStack
// Query 캐시를 무효화한다(폴링 대체). guardian_shares 변경은 보호자 화면을
// 실시간 갱신한다. postgres_changes 는 RLS 를 준수한다(권한 밖 행 미전달).
//
// 전제: 마이그레이션이 대상 테이블을 supabase_realtime publication 에 추가
// (20260718125000_realtime_publication.sql 등). 미추가 테이블은 이벤트가 오지
// 않을 뿐 오류는 아니다.

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'

/** 실시간 감시 대상 테이블. */
export type RealtimeTable =
  | 'profiles'
  | 'chronicle_entries'
  | 'sessions'
  | 'session_logs'
  | 'session_analyses'
  | 'guardian_shares'
  | 'safety_events'
  | 'notifications'
  | 'messages'
  | 'program_journal_photos'
  | 'program_journals'
  | 'consents'
  | 'elder_codes'
  | 'inquiries'
  | 'profile_caregivers'
  | 'profile_guardians'
  | 'session_interventions'

export interface RealtimeEvent {
  table: RealtimeTable
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  /** 변경 행(스키마는 테이블별 Row — 소비자가 좁혀 사용). */
  row: Record<string, unknown> | null
}

export interface UseGiokonRealtimeOptions {
  enabled?: boolean
  /** 인증 주체 변경 시 채널을 다시 연결한다. */
  scopeKey?: string
  tables?: RealtimeTable[]
  /** 배지·토스트 등 화면 반응용 콜백(캐시 무효화는 훅이 자동 수행). */
  onEvent?: (event: RealtimeEvent) => void
}

/**
 * 기본 구독 대상.
 *
 * profiles·chronicle_entries 는 **웹에서 고친 내용이 앱에 반영되는 유일한 실시간
 * 경로**다(2026-08-18 추가). 이전에는 publication 에 없어 앱이 복귀 시 재조회로만
 * 따라잡았고, 화면을 켜 둔 채로는 영영 반영되지 않았다.
 * session_logs 는 진행 중 대화를 다른 화면(웹 대시보드)에서 지켜보기 위한 것이다.
 * notifications 는 탑바 벨 배지를 즉시 갱신한다(트리거가 만드는 행이라 폴링만으로는 늦다).
 *
 * ⚠️ journal_photos 는 **DB publication 에는 2026-08-28부터 있었지만 여기에 없어서
 * 아무도 구독하지 않았다**(2026-09-04 발견). DB 가 변경을 방송해도 받는 쪽이 없어
 * 요양일지 사진은 실시간 갱신되지 않았다 — "publication 에 있다"와 "연결돼 있다"는
 * 다른 이야기다. 20260906050000에서 추가한 6개 테이블도 아래 목록에 함께 등록한다.
 */
const DEFAULT_TABLES: RealtimeTable[] = [
  'profiles',
  'chronicle_entries',
  'sessions',
  'session_logs',
  'session_analyses',
  'guardian_shares',
  'safety_events',
  'notifications',
  'messages',
  'program_journal_photos',
  'program_journals',
  'consents',
  'elder_codes',
  'inquiries',
  'profile_caregivers',
  'profile_guardians',
  // 감독 개입 기록(파일럿 D9) — 다른 감독자가 멈추거나 재개한 것을 즉시 본다.
  'session_interventions',
]

function invalidateFor(
  qc: ReturnType<typeof useQueryClient>,
  event: RealtimeEvent,
): void {
  const profileId =
    typeof event.row?.profile_id === 'string' ? (event.row.profile_id as string) : undefined
  switch (event.table) {
    case 'program_journals':
      // 생성 중 → 확인 대기 전환(워커)·확정이 목록에 바로 보이게. 보호자 문장 공개 여부도 바뀔 수 있다.
      void qc.invalidateQueries({ queryKey: ['program_journals'] })
      void qc.invalidateQueries({ queryKey: queryKeys.myShares })
      break
    case 'consents':
      // DELETE는 PK만 올 수 있어 대상별 키와 계정 동의를 모두 재검증한다.
      void qc.invalidateQueries({ queryKey: ['consents'] })
      break
    case 'elder_codes':
      void qc.invalidateQueries({ queryKey: ['elder_codes'] })
      break
    case 'inquiries':
      void qc.invalidateQueries({ queryKey: ['inquiries'] })
      break
    case 'profile_caregivers':
    case 'profile_guardians':
      // 배정/연결 변경은 자료를 볼 수 있는 범위 자체를 바꾼다.
      void qc.invalidateQueries()
      break
    case 'profiles': {
      // profiles 는 자기 자신이 id — profile_id 컬럼이 없다.
      const id = typeof event.row?.id === 'string' ? (event.row.id as string) : undefined
      void qc.invalidateQueries({ queryKey: queryKeys.profiles })
      if (id) void qc.invalidateQueries({ queryKey: queryKeys.profile(id) })
      break
    }
    case 'chronicle_entries':
      void qc.invalidateQueries({ queryKey: queryKeys.chronicleCounts })
      if (profileId) void qc.invalidateQueries({ queryKey: queryKeys.chronicles(profileId) })
      break
    case 'sessions':
      void qc.invalidateQueries({ queryKey: queryKeys.activeOrgSessions })
      void qc.invalidateQueries({ queryKey: queryKeys.recentSessions })
      void qc.invalidateQueries({ queryKey: queryKeys.sessionCounts })
      if (profileId) void qc.invalidateQueries({ queryKey: queryKeys.sessions(profileId) })
      break
    case 'session_logs': {
      const sessionId =
        typeof event.row?.session_id === 'string' ? (event.row.session_id as string) : undefined
      if (sessionId) void qc.invalidateQueries({ queryKey: queryKeys.sessionLogs(sessionId) })
      break
    }
    case 'session_analyses':
      void qc.invalidateQueries({ queryKey: queryKeys.orgSessionAnalyses })
      if (profileId) {
        void qc.invalidateQueries({ queryKey: queryKeys.sessionAnalyses(profileId) })
      }
      break
    case 'guardian_shares':
      void qc.invalidateQueries({ queryKey: queryKeys.myShares })
      if (profileId) {
        void qc.invalidateQueries({ queryKey: queryKeys.guardianShares(profileId) })
      }
      break
    case 'session_interventions':
      void qc.invalidateQueries({ queryKey: ['session_interventions'] })
      void qc.invalidateQueries({ queryKey: queryKeys.activeOrgSessions })
      break
    case 'safety_events':
      void qc.invalidateQueries({ queryKey: queryKeys.unacknowledgedSafetyEvents })
      if (profileId) {
        void qc.invalidateQueries({ queryKey: queryKeys.safetyEvents(profileId) })
      }
      break
    case 'notifications':
      // RLS 가 본인 알림만 전달하므로 수신 자체가 내 알림함 변경이다.
      void qc.invalidateQueries({ queryKey: queryKeys.myNotifications })
      break
    case 'messages':
      void qc.invalidateQueries({ queryKey: queryKeys.myMessages })
      if (profileId) void qc.invalidateQueries({ queryKey: queryKeys.messages(profileId) })
      break
    case 'program_journal_photos': {
      // 사진 행은 일지에 매달린다 — profile_id 가 아니라 journal_id 를 본다.
      const journalId =
        typeof event.row?.journal_id === 'string' ? (event.row.journal_id as string) : undefined
      void qc.invalidateQueries({ queryKey: queryKeys.orgProgramJournalPhotos })
      if (journalId) void qc.invalidateQueries({ queryKey: queryKeys.programJournalPhotos(journalId) })
      break
    }
  }
}

/**
 * 기억온 실시간 구독 — 대상 테이블 변경 시 관련 쿼리 캐시를 자동 무효화한다.
 * 반환값 connected 는 구독 채널 상태(배지 표시용).
 */
export function useGiokonRealtime(options?: UseGiokonRealtimeOptions): { connected: boolean } {
  const qc = useQueryClient()
  const enabled = options?.enabled ?? true
  const [connected, setConnected] = useState(false)
  const tablesKey = (options?.tables ?? DEFAULT_TABLES).join(',')
  const onEvent = options?.onEvent
  const scopeKey = options?.scopeKey

  useEffect(() => {
    if (!enabled) return
    const client = getGiokonClient()
    const tables = tablesKey.split(',') as RealtimeTable[]

    let channel = client.channel('giokon-db-changes')
    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          const event: RealtimeEvent = {
            table,
            eventType: payload.eventType as RealtimeEvent['eventType'],
            row: (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown> | null,
          }
          invalidateFor(qc, event)
          onEvent?.(event)
        },
      )
    }
    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED')
      // 최초 연결/재연결 전 놓친 이벤트도 따라잡는다.
      if (status === 'SUBSCRIBED') void qc.invalidateQueries()
    })

    return () => {
      void client.removeChannel(channel)
    }
  }, [enabled, tablesKey, qc, onEvent, scopeKey])

  return { connected }
}
