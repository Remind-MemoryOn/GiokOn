import { describe, expect, it, vi } from 'vitest'
import { createSessionLease, tickWithLease, type LeaseRpc } from './lease'

const SESSION = '11111111-2222-4333-8444-555555555555'
const HOLDER = 'aaaaaaaa-0000-4000-8000-000000000001'
const ok = (data: unknown) => Promise.resolve({ data, error: null })

describe('createSessionLease (T26.1)', () => {
  it('acquires with its own holder and reports SESSION_BUSY when another live connection holds it', async () => {
    const rpc = vi.fn<LeaseRpc>(() => ok(false))
    await expect(createSessionLease(rpc, SESSION, HOLDER).acquire()).rejects.toThrow('SESSION_BUSY')
    expect(rpc).toHaveBeenCalledWith('acquire_voice_lease', { p_session_id: SESSION, p_holder: HOLDER })
  })

  it('fails closed (LEASE_FAILED) when the RPC errors, e.g. before the migration is applied', async () => {
    const rpc = vi.fn<LeaseRpc>(() => Promise.resolve({ data: null, error: { code: 'PGRST202' } }))
    await expect(createSessionLease(rpc, SESSION, HOLDER).acquire()).rejects.toThrow('LEASE_FAILED')
  })

  it('renews only while the lease is still ours — lost, errored or thrown renewals are false', async () => {
    const answers: (() => ReturnType<LeaseRpc>)[] = [() => ok(true), () => ok(true), () => ok(false),
      () => Promise.resolve({ data: true, error: { code: 'X' } }), () => Promise.reject(new Error('network'))]
    const rpc = vi.fn<LeaseRpc>(() => answers.shift()!())
    const lease = createSessionLease(rpc, SESSION, HOLDER)
    await lease.acquire()
    expect(await lease.renew()).toBe(true)
    expect(await lease.renew()).toBe(false)
    expect(await lease.renew()).toBe(false)
    expect(await lease.renew()).toBe(false)
    expect(rpc).toHaveBeenNthCalledWith(2, 'renew_voice_lease', { p_session_id: SESSION, p_holder: HOLDER })
  })

  it('does not renew or release a lease it never acquired', async () => {
    const rpc = vi.fn<LeaseRpc>(() => ok(false))
    const lease = createSessionLease(rpc, SESSION, HOLDER)
    await lease.acquire().catch(() => {})
    expect(await lease.renew()).toBe(false)
    lease.release()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('releases its own holder exactly once, swallowing failures (expiry frees it)', async () => {
    const rpc = vi.fn<LeaseRpc>((fn) => fn === 'release_voice_lease' ? Promise.reject(new Error('down')) : ok(true))
    const lease = createSessionLease(rpc, SESSION, HOLDER)
    await lease.acquire()
    lease.release(); lease.release()
    await Promise.resolve()
    expect(rpc.mock.calls.filter(([fn]) => fn === 'release_voice_lease')).toEqual([['release_voice_lease', { p_session_id: SESSION, p_holder: HOLDER }]])
    expect(await lease.renew()).toBe(false)
  })
})

describe('tickWithLease (T26.1)', () => {
  const allowed = { allowed: true as const, phase: 'intro' }
  it('passes the server tick through only while the lease is held', async () => {
    expect(await tickWithLease(async () => allowed, { renew: async () => true })).toBe(allowed)
  })
  it('denies when the lease was lost even though the server allows', async () => {
    expect(await tickWithLease(async () => allowed, { renew: async () => false })).toEqual({ allowed: false })
  })
  it('denies when the server denies even though the lease is held', async () => {
    expect(await tickWithLease(async () => ({ allowed: false }), { renew: async () => true })).toEqual({ allowed: false })
  })
})
