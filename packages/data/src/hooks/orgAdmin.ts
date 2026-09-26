// @giokon/data — 기관 관리(파일럿 D3 · 웹 W6 후반): 구성원 역할 지정 · 위임 권한표 · 기관 설정
//
// ⚠️ 판정은 서버가 한다 — 편집은 관리 역할(org_admin·center_director)만(RLS·RPC),
//    역할 지정은 자기 자신·보호자↔돌봄팀·마지막 기관 관리자 강등을 막는다(set_member_role).
//    오류는 코드 식별자(MEMBER_ROLE_*)로 오고, 웹이 문구로 바꾼다.
// ⚠️ 위임 대상은 3종뿐(일지 확정·공개 철회·보호자 연결 승인). 안전 구조(위기 대응·출력 검열 등)는 설정이 아니다.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { getGiokonClient } from '../client'
import { queryKeys } from '../query'
import type { Database, OrgCapability, OrgRole } from '../database.types'
import { DEFAULT_CAPABILITY_ROLES } from './programJournals'

/** 위임 권한 3종 — 화면 순서. */
export const ORG_CAPABILITIES: readonly OrgCapability[] = ['journal_finalize', 'share_revoke', 'guardian_link_approve']

/** 역할 지정·권한표에 쓰는 돌봄팀 역할(보호자 제외) — 화면 순서. */
export const CARE_TEAM_ROLES: readonly Exclude<OrgRole, 'guardian'>[] = [
  'org_admin',
  'center_director',
  'social_worker',
  'caregiver',
]

export type CapabilityTable = Record<OrgCapability, OrgRole[]>

/**
 * 권한표 행 → 3종 전부 채운 표. 행이 없는 권한은 서버와 같은 기본 집합으로 채운다(app.default_capability_roles).
 */
export function toCapabilityTable(
  rows: readonly { capability: OrgCapability; allowed_roles: OrgRole[] }[] | null | undefined,
): CapabilityTable {
  const table = {} as CapabilityTable
  for (const c of ORG_CAPABILITIES) {
    const row = rows?.find((r) => r.capability === c)
    table[c] = row ? [...row.allowed_roles] : [...DEFAULT_CAPABILITY_ROLES]
  }
  return table
}

/** 기관 권한표(돌봄팀 누구나 읽는다 — 누가 무엇을 할 수 있는지 직원도 안다). */
export function useOrgCapabilities(options?: { enabled?: boolean }): UseQueryResult<CapabilityTable> {
  return useQuery({
    queryKey: [...queryKeys.orgCapabilities, 'table'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await getGiokonClient().from('org_capabilities').select('capability, allowed_roles')
      if (error) throw new Error(error.message)
      return toCapabilityTable(data)
    },
  })
}

/** 권한표 저장 — 바뀐 권한만 upsert(한 번에). 수정자·시각은 서버가 채운다. */
export function useUpdateOrgCapabilities(): UseMutationResult<
  void,
  Error,
  { orgId: string; changes: Partial<CapabilityTable> }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orgId, changes }) => {
      const rows = (Object.keys(changes) as OrgCapability[]).map((capability) => ({
        org_id: orgId,
        capability,
        allowed_roles: changes[capability] ?? [],
      }))
      if (rows.length === 0) return
      const { error } = await getGiokonClient()
        .from('org_capabilities')
        .upsert(rows, { onConflict: 'org_id,capability' })
      if (error) throw new Error(error.message)
    },
    // 위임 판정(useHasCapability)도 같은 접두어라 함께 새로 고친다.
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.orgCapabilities }),
  })
}

export type OrgSettingsUpdate = Database['public']['Tables']['org_settings']['Update']

/** 기관 설정 저장(관리 역할만 — RLS). 행이 없던 기관도 저장되게 upsert. */
export function useUpdateOrgSettings(): UseMutationResult<void, Error, { orgId: string; patch: OrgSettingsUpdate }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orgId, patch }) => {
      const { error } = await getGiokonClient()
        .from('org_settings')
        .upsert({ org_id: orgId, ...patch }, { onConflict: 'org_id' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.orgSettings }),
  })
}

/** 구성원 역할 지정(set_member_role). */
export function useSetMemberRole(): UseMutationResult<void, Error, { userId: string; role: Exclude<OrgRole, 'guardian'> }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, role }) => {
      const { error } = await getGiokonClient().rpc('set_member_role', { p_target: userId, p_role: role })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.orgMembers })
      void qc.invalidateQueries({ queryKey: queryKeys.orgCapabilities })
    },
  })
}

/**
 * 기본 피할 주제 입력(쉼표·줄바꿈 구분) → 배열. 공백 제거 · 빈 값 제외 · 중복 제거 · 최대 30개(DB 제약).
 */
export function parseTopicList(text: string, max = 30): string[] {
  const out: string[] = []
  for (const raw of text.split(/[,\n]/)) {
    const t = raw.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out.slice(0, max)
}
