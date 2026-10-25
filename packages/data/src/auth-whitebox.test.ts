import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConsentType } from '@giokon/core'
import { completeOnboarding, getCurrentUser, getCurrentUserRow, onAuthStateChange, setSessionFromTokens, signInWithEmail, signUpWithEmail } from './auth'

const mocks = vi.hoisted(() => ({
  wait: vi.fn(async () => {}), pending: false, rpc: vi.fn(), from: vi.fn(),
  auth: { setSession: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), getUser: vi.fn(), onAuthStateChange: vi.fn() },
}))
vi.mock('./client', () => ({
  getGiokonClient: () => ({ auth: mocks.auth, rpc: mocks.rpc, from: mocks.from }),
  signOutGiokonClient: vi.fn(), isLocalLogoutPending: () => mocks.pending, waitForSignOut: mocks.wait,
}))
afterEach(() => { vi.resetAllMocks(); mocks.pending = false })

describe('auth response and logout boundaries', () => {
  it('waits for the prior logout before handing new credentials to the client', async () => {
    let release!: () => void
    mocks.wait.mockReturnValue(new Promise<void>(resolve => { release = resolve }))
    const session = { access_token: 'synthetic' }
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null })
    const signingIn = signInWithEmail({ email: '  test@example.invalid  ', password: '  secret unchanged  ' })
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled()
    release()
    expect(await signingIn).toBe(session)
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'test@example.invalid', password: '  secret unchanged  ' })
  })

  it('never converts a server error or absent session into an authenticated result', async () => {
    const error = new Error('synthetic failure')
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error })
    await expect(signInWithEmail({ email: 'x', password: 'y' })).rejects.toBe(error)
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: null })
    await expect(signInWithEmail({ email: 'x', password: 'y' })).rejects.toThrow('로그인에 실패했습니다.')
    mocks.auth.setSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(setSessionFromTokens('synthetic-access', 'synthetic-refresh')).rejects.toThrow('세션을 세우지 못했습니다.')
    mocks.auth.setSession.mockResolvedValue({ data: { session: {} }, error })
    await expect(setSessionFromTokens('synthetic-access', 'synthetic-refresh')).rejects.toBe(error)
  })

  it.each([null, { access_token: 'synthetic' }])('keeps email confirmation state consistent with session %j', async session => {
    mocks.auth.signUp.mockResolvedValue({ data: { session }, error: null })
    expect(await signUpWithEmail({ email: ' x@example.invalid ', password: 'p', redirectTo: 'https://example.invalid/callback' })).toEqual({ session, needsConfirm: session === null })
    expect(mocks.auth.signUp).toHaveBeenCalledWith({ email: 'x@example.invalid', password: 'p', options: { emailRedirectTo: 'https://example.invalid/callback' } })
  })

  it('suppresses a late signed-in notification while local logout is pending', () => {
    let emit!: (event: string, session: unknown) => void
    const subscription = { unsubscribe: vi.fn() }
    mocks.auth.onAuthStateChange.mockImplementation(callback => { emit = callback; return { data: { subscription } } })
    const callback = vi.fn()
    expect(onAuthStateChange(callback)).toBe(subscription)
    const session = { access_token: 'synthetic' }
    mocks.pending = true; emit('SIGNED_IN', session)
    expect(callback).toHaveBeenLastCalledWith('SIGNED_IN', null)
    mocks.pending = false; emit('SIGNED_IN', session)
    expect(callback).toHaveBeenLastCalledWith('SIGNED_IN', session)
  })

  it('does not query a public user row when no authenticated user exists', async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await getCurrentUserRow()).toBeNull()
    expect(mocks.from).not.toHaveBeenCalled()
    mocks.auth.getUser.mockResolvedValue({ data: { user: {} }, error: new Error('untrusted user') })
    expect(await getCurrentUser()).toBeNull()
  })
})

describe('onboarding consent data flow', () => {
  it.each<{ consents: ConsentType[] }>([{ consents: [] }, { consents: ['privacy_required'] }])('passes the caller consent decision to the RPC without inventing consent: $consents', async ({ consents }) => {
    const row = { id: 'synthetic-user' }; mocks.rpc.mockResolvedValue({ data: row, error: null })
    expect(await completeOnboarding({ name: 'Test', phone: '010', role: 'caregiver', consents, consentVersion: 'test-v1', socialAcknowledged: false, inviteCode: '  invite  ' })).toBe(row)
    expect(mocks.rpc).toHaveBeenCalledWith('complete_onboarding', {
      p_name: 'Test', p_phone: '010', p_role: 'caregiver', p_org_name: null, p_elder_code: null,
      p_consents: consents.length ? consents : null, p_consent_version: 'test-v1', p_social_acknowledged: false, p_invite_code: 'invite',
    })
  })

  it('propagates server rejection, including stale consent versions', async () => {
    const error = new Error('CONSENT_VERSION_REQUIRED'); mocks.rpc.mockResolvedValue({ data: null, error })
    await expect(completeOnboarding({ name: 'Test', phone: '010', role: 'guardian', consents: [], consentVersion: 'old', socialAcknowledged: false, inviteCode: ' ' })).rejects.toBe(error)
    expect(mocks.rpc.mock.calls[0][1].p_invite_code).toBeNull()
  })
})
