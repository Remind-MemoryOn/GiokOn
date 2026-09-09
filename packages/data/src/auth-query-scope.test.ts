import { describe, expect, it } from 'vitest'
import { AuthQueryScope, queryKeys } from './query'

describe('account query isolation', () => {
  it('new accounts cannot see stale records, names or signed URLs under identical keys', () => {
    const scope = new AuthQueryScope()
    const a = scope.capture()
    a.client.setQueryData(queryKeys.profiles, [{ name: 'synthetic A', photo: 'https://example.invalid/signed-a' }])
    a.client.setQueryData(queryKeys.organization, { name: 'org A' })
    scope.reset()
    const b = scope.capture()
    expect(b.client).not.toBe(a.client)
    expect(b.client.getQueryData(queryKeys.profiles)).toBeUndefined()
    expect(b.client.getQueryData(queryKeys.organization)).toBeUndefined()
    expect(a.assertCurrent).toThrow()
    expect(b.current()).toBe(true)
    // Even a mutation callback that ignored cancellation writes only to its old client.
    a.client.setQueryData(queryKeys.profiles, [{ name: 'late A' }])
    expect(b.client.getQueryData(queryKeys.profiles)).toBeUndefined()
  })
  it('cancels an in-flight query and keeps its delayed response outside the new cache', async () => {
    const scope = new AuthQueryScope()
    const a = scope.capture()
    let done!: (value: string[]) => void
    const response = new Promise<string[]>(resolve => { done = resolve })
    const request = a.client.fetchQuery({ queryKey: queryKeys.myShares, queryFn: () => response })
    const stopped = request.catch(() => 'cancelled')
    scope.reset()
    expect(await stopped).toBe('cancelled')
    done(['private A'])
    await response
    expect(scope.getSnapshot().client.getQueryData(queryKeys.myShares)).toBeUndefined()
  })
})
