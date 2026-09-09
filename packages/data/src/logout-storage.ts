import type { GiokonAuthStorage } from './client'

/** Serialize disk writes so a pending token save cannot land after logout's deletion. */
export function logoutStorage(base: GiokonAuthStorage, sessionKey: string) {
  let blocked = false
  let tail: Promise<unknown> = Promise.resolve()
  const keys = [sessionKey, `${sessionKey}-code-verifier`, `${sessionKey}-user`]
  function enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = tail.then(operation)
    tail = result.catch(() => {})
    return result
  }
  return {
    storage: {
      getItem: (key: string) => enqueue(() => blocked && keys.includes(key) ? null : base.getItem(key)),
      setItem: (key: string, value: string) => enqueue(() => {
        if (!blocked || !keys.includes(key)) return base.setItem(key, value)
      }),
      removeItem: (key: string) => enqueue(() => base.removeItem(key)),
    } satisfies GiokonAuthStorage,
    clear: () => {
      blocked = true
      return enqueue(async () => { for (const key of keys) await base.removeItem(key) })
    },
    resume: () => { blocked = false },
  }
}
