import { describe, expect, it } from 'vitest'
import { capabilityAllows, countByProfile, DEFAULT_CAPABILITY_ROLES } from './hooks/programJournals'

describe('capabilityAllows — 위임 권한 UI 판정(서버 app.has_capability 와 같은 규칙)', () => {
  const member = (role: string) => ({ role, org_id: 'org-a' })
  it('권한표 행이 없으면 기본 집합(관리자·사회복지사·센터장)으로 폴백한다', () => {
    expect(DEFAULT_CAPABILITY_ROLES).toEqual(['org_admin', 'social_worker', 'center_director'])
    for (const role of DEFAULT_CAPABILITY_ROLES) expect(capabilityAllows(member(role), null)).toBe(true)
    expect(capabilityAllows(member('caregiver'), null)).toBe(false)
  })
  it('권한표 행이 있으면 그 역할만', () => {
    expect(capabilityAllows(member('caregiver'), ['caregiver'])).toBe(true)
    expect(capabilityAllows(member('social_worker'), ['org_admin'])).toBe(false)
  })
  it('보호자·기관 없는 사용자는 어떤 위임도 받지 못한다', () => {
    expect(capabilityAllows(member('guardian'), ['guardian'])).toBe(false)
    expect(capabilityAllows({ role: 'org_admin', org_id: null }, ['org_admin'])).toBe(false)
    expect(capabilityAllows(null, ['org_admin'])).toBe(false)
  })
})

describe('countByProfile — 어르신별 확인 대기 수', () => {
  it('같은 어르신 행을 센다 · 없으면 빈 객체', () => {
    expect(countByProfile([{ profile_id: 'a' }, { profile_id: 'b' }, { profile_id: 'a' }])).toEqual({ a: 2, b: 1 })
    expect(countByProfile([])).toEqual({})
  })
})
