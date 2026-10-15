import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import type { LiveTokenDeps } from '../../../supabase/functions/live-token/handler'

// Exercise the deployed entrypoint's wiring, not only the injected handler mocks.
function boot(env: Record<string, string>) {
  const createClient = vi.fn((_url: string, _key: string, _options: unknown) => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'synthetic' } }, error: null })) },
    rpc: vi.fn(async () => ({ data: true, error: null })),
  }))
  let deps!: LiveTokenDeps
  const source = readFileSync(new URL('../../../supabase/functions/live-token/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/: string\b/g, '')
  runInNewContext(source, {
    Deno: { env: { get: (key: string) => env[key] } },
    createClient, serve: vi.fn(), fetch: vi.fn(),
    createLiveTokenHandler: (value: LiveTokenDeps) => { deps = value },
  })
  return { createClient, deps }
}

describe('live-token deployment environment', () => {
  it('extracts the default key from the injected JSON key map', async () => {
    const f = boot({ SUPABASE_URL: 'https://synthetic.invalid',
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'synthetic-secret-key', secondary: 'other-key' }),
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-key' })
    await f.deps.verifyUser('Bearer synthetic-user-jwt')
    expect(f.createClient.mock.calls[0]?.[1]).toBe('synthetic-secret-key')
    await f.deps.reserve('Bearer synthetic-user-jwt', 'synthetic-session')
    expect(f.createClient.mock.calls[1]?.[1]).toBe('synthetic-secret-key')
    expect(f.createClient.mock.calls[1]?.[2]).toMatchObject({ global: { headers: { Authorization: 'Bearer synthetic-user-jwt' } } })
  })

  it.each(['', '{broken', '{}', '{"default":123}'])('uses the legacy key when the map is unusable: %s', async raw => {
    const f = boot({ SUPABASE_SECRET_KEYS: raw, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-legacy' })
    await f.deps.verifyUser('Bearer synthetic-user-jwt')
    expect(f.createClient.mock.calls[0]?.[1]).toBe('synthetic-legacy')
  })

  it('preserves a configured scalar key and the caller authorization', async () => {
    const f = boot({ SUPABASE_SECRET_KEY: 'synthetic-scalar', SUPABASE_SECRET_KEYS: '{"default":"other"}' })
    await f.deps.verifyUser('Bearer synthetic-user-jwt')
    expect(f.createClient.mock.calls[0]?.[1]).toBe('synthetic-scalar')
    expect(f.createClient.mock.calls[0]?.[2]).toMatchObject({ global: { headers: { Authorization: 'Bearer synthetic-user-jwt' } } })
  })
})
