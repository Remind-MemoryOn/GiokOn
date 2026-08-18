// @giokon/data — 세션 자동 분석(session_analyses) TanStack Query 훅 (T16.1·T16.4)
//
// 앱이 대화 종료 시 core/analysis.analyzeSession() 결과를 upsert 하고, 웹 분석
// 페이지(SCR-W07)·세션 상세가 조회한다. Realtime(T-E3)이 새 분석을 즉시 반영.
// ⚠️ 비의료: analysis 는 관찰 지표만 담는다(효능·향상 판정 아님).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import type { SessionAnalysis } from '@giokon/core'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import { fetchAllPages } from '../paging'
import type { SessionAnalysisRow, TablesInsert } from '../database.types'

export type SessionAnalysisInsert = TablesInsert<'session_analyses'>

/** 저장된 JSON 을 core SessionAnalysis 로 안전 캐스팅(형식 불일치 시 null). */
export function parseSessionAnalysis(row: SessionAnalysisRow): SessionAnalysis | null {
  const value = row.analysis
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.summary !== 'string' || typeof candidate.metrics !== 'object') return null
  return value as unknown as SessionAnalysis
}

/**
 * 기관 전체 최근 분석(분석 페이지 목록·대시보드 배지).
 *
 * `fetchAll` 을 주면 limit 대신 **전량**을 페이징으로 받는다 — 앱의 전체 분석·인지
 * 효과 분석·주제별 추이는 이 배열로 비율과 추이를 계산하므로, 잘린 데이터면 화면이
 * 조용히 틀린 값을 보여 준다.
 */
export function useOrgSessionAnalyses(options?: {
  limit?: number
  enabled?: boolean
  fetchAll?: boolean
}): UseQueryResult<SessionAnalysisRow[]> {
  const limit = options?.limit ?? 100
  const fetchAll = options?.fetchAll ?? false
  return useQuery({
    queryKey: [...queryKeys.orgSessionAnalyses, fetchAll ? 'all' : limit],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const base = () =>
        getGiokonClient()
          .from('session_analyses')
          .select('*')
          .order('created_at', { ascending: false })
      if (!fetchAll) {
        const { data, error } = await base().limit(limit)
        if (error) throw new Error(error.message)
        return data
      }
      const { rows } = await fetchAllPages<SessionAnalysisRow>(async (from, to) => {
        const { data, error } = await base().order('id', { ascending: true }).range(from, to)
        if (error) throw new Error(error.message)
        return data
      })
      return rows
    },
  })
}

/** 어르신별 분석 이력(개인 분석 화면). */
export function useSessionAnalyses(
  profileId: string | undefined,
): UseQueryResult<SessionAnalysisRow[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.sessionAnalyses(profileId) : ['session_analyses', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('session_analyses')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 특정 세션의 분석(세션 상세 카드). */
export function useSessionAnalysisBySession(
  sessionId: string | undefined,
): UseQueryResult<SessionAnalysisRow | null> {
  return useQuery({
    queryKey: sessionId
      ? ['session_analyses', 'session', sessionId]
      : ['session_analyses', 'session', 'none'],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('session_analyses')
        .select('*')
        .eq('session_id', sessionId as string)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 분석 저장(앱: 대화 종료 시). 세션당 1건 — 재분석 시 갱신(upsert). */
export function useUpsertSessionAnalysis(): UseMutationResult<
  SessionAnalysisRow,
  Error,
  SessionAnalysisInsert
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SessionAnalysisInsert) => {
      const { data, error } = await getGiokonClient()
        .from('session_analyses')
        .upsert(input, { onConflict: 'session_id' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      void qc.invalidateQueries({ queryKey: queryKeys.orgSessionAnalyses })
      void qc.invalidateQueries({ queryKey: queryKeys.sessionAnalyses(row.profile_id) })
      void qc.invalidateQueries({ queryKey: ['session_analyses', 'session', row.session_id] })
    },
  })
}
