/**
 * 음성 세션 점유(T26.1) — "같은 세션에 연결 1개"를 프로세스 메모리 대신 DB 에서 잡는다.
 * 인스턴스가 여럿이거나 리비전 교체 중이어도 같은 세션이 두 번 연결되지 않는다.
 *
 * 연결마다 holder(UUID)를 만들어 `acquire_voice_lease` 로 잡고, 2초 폴마다 `renew_voice_lease` 로 15초씩 늘리고,
 * 닫을 때 `release_voice_lease` 로 놓는다. 프로세스가 죽어 놓지 못한 점유는 DB 에서 15초 뒤 만료된다.
 * RPC 가 없거나(마이그레이션 전) 실패하면 연결을 받지 않는다(fail closed) — 배포 순서는 DB 마이그레이션 → 중계.
 */
type RpcResult = { data: unknown; error: unknown }
export type LeaseRpc = (fn: 'acquire_voice_lease' | 'renew_voice_lease' | 'release_voice_lease',
  args: { p_session_id: string; p_holder: string }) => PromiseLike<RpcResult>

export interface SessionLease {
  /** 잡지 못하면 던진다 — 다른 연결이 살아 있으면 `SESSION_BUSY`, 그 밖의 실패는 `LEASE_FAILED`. */
  acquire(): Promise<void>
  /** 아직 이 연결의 점유이면 true. 빼앗겼거나 확인 실패면 false(중계는 연결을 닫는다). */
  renew(): Promise<boolean>
  /** 자기 점유를 놓는다. 한 번만 보내고 실패는 무시한다(만료가 대신 푼다). */
  release(): void
}

export function createSessionLease(rpc: LeaseRpc, sessionId: string, holder: string): SessionLease {
  const args = { p_session_id: sessionId, p_holder: holder }
  let acquired = false, released = false
  return {
    async acquire() {
      const result = await rpc('acquire_voice_lease', args)
      if (result.error) throw new Error('LEASE_FAILED')
      if (result.data !== true) throw new Error('SESSION_BUSY')
      acquired = true
    },
    async renew() {
      if (!acquired || released) return false
      try {
        const result = await rpc('renew_voice_lease', args)
        return !result.error && result.data === true
      } catch { return false }
    },
    release() {
      if (!acquired || released) return
      released = true
      try { void Promise.resolve(rpc('release_voice_lease', args)).catch(() => {}) } catch { /* 만료가 푼다 */ }
    },
  }
}

/**
 * 2초 폴 판정에 점유 갱신을 묶는다 — 서버가 허용해도 점유를 잃었으면(다른 연결이 가져갔거나 갱신 실패) 허용하지 않는다.
 * 두 요청은 함께 보낸다(폴 지연을 늘리지 않게).
 */
export async function tickWithLease<T extends { allowed: boolean }>(tick: () => Promise<T>, lease: Pick<SessionLease, 'renew'>): Promise<T | { allowed: false }> {
  const [result, held] = await Promise.all([tick(), lease.renew()])
  return result.allowed === true && held ? result : { allowed: false }
}
