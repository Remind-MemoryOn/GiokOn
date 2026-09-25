import { describe, expect, it } from 'vitest'
import { isAwaitingOrgJoin } from './orgJoin'

const base = { onboarded_at: '2026-09-25T00:00:00Z', role: 'caregiver' as const, org_id: null }

describe('isAwaitingOrgJoin', () => {
  it('treats an onboarded care-team account without an organization as waiting for approval', () => {
    expect(isAwaitingOrgJoin(base)).toBe(true)
    expect(isAwaitingOrgJoin({ ...base, role: 'social_worker' })).toBe(true)
  })

  it('does not hold back members, guardians or accounts that have not finished onboarding', () => {
    expect(isAwaitingOrgJoin({ ...base, org_id: 'org-1' })).toBe(false)
    expect(isAwaitingOrgJoin({ ...base, role: 'guardian' })).toBe(false)
    expect(isAwaitingOrgJoin({ ...base, onboarded_at: null })).toBe(false)
    expect(isAwaitingOrgJoin(null)).toBe(false)
  })
})
