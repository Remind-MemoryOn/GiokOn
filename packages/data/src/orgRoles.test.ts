import { describe, expect, it } from 'vitest'
import { ORG_ROLE_LABEL, isOrgManagerRole, roleHonorific } from './orgRoles'

describe('org roles', () => {
  it('treats the center director as a manager, like the server does', () => {
    expect(isOrgManagerRole('org_admin')).toBe(true)
    expect(isOrgManagerRole('center_director')).toBe(true)
    expect(isOrgManagerRole('social_worker')).toBe(false)
    expect(isOrgManagerRole('caregiver')).toBe(false)
    expect(isOrgManagerRole('guardian')).toBe(false)
    expect(isOrgManagerRole(null)).toBe(false)
  })

  it('names every role, including the two pilot roles', () => {
    expect(ORG_ROLE_LABEL.social_worker).toBe('사회복지사')
    expect(ORG_ROLE_LABEL.center_director).toBe('센터장')
  })

  it('does not call social workers or directors caregivers', () => {
    expect(roleHonorific('social_worker')).toBe('사회복지사님')
    expect(roleHonorific('center_director')).toBe('센터장님')
    expect(roleHonorific('org_admin')).toBe('요양보호사님')
    expect(roleHonorific('guardian')).toBe('보호자님')
  })
})
