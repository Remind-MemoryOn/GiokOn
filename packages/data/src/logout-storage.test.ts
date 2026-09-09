import { afterEach, describe, expect, it, vi } from 'vitest'
import { logoutStorage } from './logout-storage'
import { createGiokonClient, initGiokonData, signOutGiokonClient } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('local logout', () => {
  it('deletes a delayed disk save and blocks token resurrection while clearing', async () => {
    const disk = new Map<string, string>()
    let finish!: () => void
    const gate = logoutStorage({
      getItem: key => disk.get(key) ?? null,
      setItem: async (key, value) => {
        await new Promise<void>(resolve => { finish = resolve })
        disk.set(key, value)
      },
      removeItem: key => { disk.delete(key) },
    }, 'session')
    const save = gate.storage.setItem('session', 'synthetic')
    await Promise.resolve()
    const clear = gate.clear()
    const late = gate.storage.setItem('session', 'late synthetic')
    finish()
    await Promise.all([save, clear, late])
    expect(disk.has('session')).toBe(false)
    expect(await gate.storage.getItem('session')).toBeNull()
  })

  it('the real SDK signs out locally even if server-wide revocation fails offline', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('unexpected network'))))
    const key = 'sb-synthetic-auth-token'
    const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'a', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`
    const disk = new Map([[key, JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh',
      token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'a', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } })]])
    const client = initGiokonData(createGiokonClient({ url: 'https://synthetic.invalid', publishableKey: 'synthetic', detectSessionInUrl: false,
      storage: { getItem: key => disk.get(key) ?? null, setItem: (key, value) => { disk.set(key, value) }, removeItem: key => { disk.delete(key) } },
    }))
    try {
      expect((await client.auth.getSession()).data.session?.user.id).toBe('a')
      const events: string[] = []
      const listener = client.auth.onAuthStateChange(event => { events.push(event) })
      const revoke = vi.spyOn(client.auth.admin, 'signOut').mockRejectedValueOnce(new Error('offline'))
      await expect(signOutGiokonClient()).rejects.toThrow('offline')
      expect(revoke).toHaveBeenCalledExactlyOnceWith(token, 'global')
      expect(disk.has(key)).toBe(false)
      expect((await client.auth.getSession()).data.session).toBeNull()
      expect(events).toContain('SIGNED_OUT')
      listener.data.subscription.unsubscribe()
    } finally {
      await client.auth.stopAutoRefresh()
    }
  })
})
