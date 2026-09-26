// @giokon/data — 프로그램 일지(program_journals · 파일럿 D5) TanStack Query 훅
//
// 요양일지(care_journals)를 대체한다. 공단 서식 칸이 개별 컬럼이고, 상태는
// generating(워커가 초안 작성 중) → pending_review(확인 대기) → final(확정) | failed(생성 실패).
//
// ⚠️ 서버가 집행하는 규칙(트리거 — 화면에서 다시 판정하지 말 것):
//   · 확정은 사람 + 위임 권한(journal_finalize)만. 진행자(facilitator_user_id)가 있어야 한다.
//   · 확정은 되돌릴 수 없고, 확정 뒤 공단 칸 수정은 edit_reason 이 필수(이력으로 남는다).
//   · 확정자·보호자 문장 승인자·생성 칸은 서버가 채운다.
// 보호자는 이 표를 직접 읽지 못한다 — 공개된 확정 일지의 보호자 문장만 get_my_shared_journals 로 받는다.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type {
  OrgCapability,
  ProgramJournalRevisionRow,
  ProgramJournalRow,
  TablesInsert,
  TablesUpdate,
} from '../database.types'
import { useCurrentUser } from './organizations'

export type ProgramJournalInsert = TablesInsert<'program_journals'>
export type ProgramJournalUpdate = TablesUpdate<'program_journals'>

/** 어르신별 프로그램 일지(최신 날짜순). */
export function useProgramJournals(profileId: string | undefined): UseQueryResult<ProgramJournalRow[]> {
  return useQuery({
    queryKey: profileId ? queryKeys.programJournals(profileId) : ['program_journals', 'none'],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('program_journals')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('journal_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 기관 전체 최근 프로그램 일지(확인 대기 모아 보기·공개 체크리스트용). */
export function useOrgProgramJournals(options?: {
  limit?: number
  enabled?: boolean
}): UseQueryResult<ProgramJournalRow[]> {
  const limit = options?.limit ?? 100
  return useQuery({
    queryKey: [...queryKeys.orgProgramJournals, limit],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('program_journals')
        .select('*')
        .order('journal_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 어르신별 개수 — `{ profile_id }` 행 목록을 `{ [profile_id]: n }` 으로. */
export function countByProfile(rows: readonly { profile_id: string }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.profile_id] = (out[r.profile_id] ?? 0) + 1
  return out
}

/**
 * 어르신별 **확인 대기**(pending_review) 일지 수 — 목록 최상단 "확인 대기 N건"의 근거.
 * 기관 최근 N건(useOrgProgramJournals)으로 세면 오래된 대기가 빠진다 → 상태로 직접 거른다.
 */
export function usePendingJournalCounts(options?: { enabled?: boolean }): UseQueryResult<Record<string, number>> {
  return useQuery({
    queryKey: queryKeys.pendingJournalCounts,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('program_journals')
        .select('profile_id')
        .eq('status', 'pending_review')
      if (error) throw new Error(error.message)
      return countByProfile(data)
    },
  })
}

function invalidateJournals(qc: ReturnType<typeof useQueryClient>, profileId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.programJournals(profileId) })
  void qc.invalidateQueries({ queryKey: queryKeys.orgProgramJournals })
  void qc.invalidateQueries({ queryKey: queryKeys.pendingJournalCounts })
}

/** 수기 일지 작성(확인 대기 또는 — 위임 권한이 있으면 — 바로 확정). */
export function useCreateProgramJournal(): UseMutationResult<ProgramJournalRow, Error, ProgramJournalInsert> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const { data, error } = await getGiokonClient().from('program_journals').insert(input).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => invalidateJournals(qc, row.profile_id),
  })
}

/** 일지 수정·확정·보호자 문장 승인(한 번의 UPDATE — 서버 트리거가 규칙을 집행한다). */
export function useUpdateProgramJournal(): UseMutationResult<
  ProgramJournalRow,
  Error,
  { id: string; patch: ProgramJournalUpdate }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { data, error } = await getGiokonClient()
        .from('program_journals')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (row) => {
      invalidateJournals(qc, row.profile_id)
      void qc.invalidateQueries({ queryKey: queryKeys.journalRevisions(row.id) })
    },
  })
}

/** 확정 전 수기 일지 삭제(만든 사람·관리 역할 — 확정·세션 일지는 RLS 가 막는다). */
export function useDeleteProgramJournal(): UseMutationResult<void, Error, { id: string; profileId: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      // RLS 가 막으면 오류 없이 0건이다 — "삭제했어요"가 거짓말이 되지 않게 지운 행 수를 본다.
      const { data, error } = await getGiokonClient().from('program_journals').delete().eq('id', id).select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) throw new Error('확정했거나 대화에서 만들어진 일지는 삭제할 수 없어요.')
    },
    onSuccess: (_r, vars) => invalidateJournals(qc, vars.profileId),
  })
}

/** 생성 실패한 세션 일지를 다시 대기열에(같은 기관 돌봄팀). */
export function useRetryJournalGeneration(): UseMutationResult<void, Error, { id: string; profileId: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await getGiokonClient().rpc('retry_journal_generation', { p_journal_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_r, vars) => invalidateJournals(qc, vars.profileId),
  })
}

/** 확정 뒤 수정 이력(최신순). */
export function useJournalRevisions(journalId: string | undefined): UseQueryResult<ProgramJournalRevisionRow[]> {
  return useQuery({
    queryKey: journalId ? queryKeys.journalRevisions(journalId) : ['program_journal_revisions', 'none'],
    enabled: Boolean(journalId),
    queryFn: async () => {
      const { data, error } = await getGiokonClient()
        .from('program_journal_revisions')
        .select('*')
        .eq('journal_id', journalId as string)
        .order('changed_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

/** 기관 권한표 기본 허용 역할(DB app.default_capability_roles 와 같다 — 행이 없을 때의 폴백). */
export const DEFAULT_CAPABILITY_ROLES = ['org_admin', 'social_worker', 'center_director'] as const

/**
 * 권한표 한 행으로 판정한다(행이 없으면 기본 집합) — app.has_capability 와 같은 규칙.
 * 보호자·기관 없는 사용자는 어떤 위임도 받지 못한다.
 */
export function capabilityAllows(
  user: { role: string; org_id: string | null } | null | undefined,
  allowedRoles: readonly string[] | null | undefined,
): boolean {
  if (!user?.org_id || user.role === 'guardian') return false
  return (allowedRoles ?? DEFAULT_CAPABILITY_ROLES).includes(user.role)
}

/**
 * 위임 권한 여부 — **UI 활성·비활성의 단일 근거**(역할 이름을 화면에서 직접 비교하지 말 것).
 * 최종 판정은 서버(app.has_capability)가 한다. 이 값은 버튼을 켜고 끄는 데만 쓴다.
 */
export function useHasCapability(capability: OrgCapability, options?: { enabled?: boolean }): UseQueryResult<boolean> {
  const me = useCurrentUser()
  const row = me.data
  return useQuery({
    queryKey: [...queryKeys.orgCapabilities, capability, row?.id ?? 'none', row?.role ?? 'none'],
    enabled: (options?.enabled ?? true) && me.isSuccess,
    queryFn: async () => {
      if (!row?.org_id || row.role === 'guardian') return false
      const { data, error } = await getGiokonClient()
        .from('org_capabilities')
        .select('allowed_roles')
        .eq('org_id', row.org_id)
        .eq('capability', capability)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return capabilityAllows(row, data?.allowed_roles)
    },
  })
}
