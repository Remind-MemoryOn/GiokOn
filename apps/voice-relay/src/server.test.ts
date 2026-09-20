import { afterEach, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocket } from 'ws'
import { createRelayServer } from './server'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

it('separates liveness from admission and refuses upgrades while draining', async () => {
  const authorize = vi.fn()
  const service = createRelayServer({authorize, connectProvider:vi.fn(), clova:{clientId:'synthetic',clientSecret:'synthetic'}})
  cleanups.push(service.close)
  service.server.listen(0,'127.0.0.1'); await once(service.server,'listening')
  const base = `127.0.0.1:${(service.server.address() as AddressInfo).port}`
  expect((await fetch(`http://${base}/readyz`)).status).toBe(200)
  service.drain()
  expect((await fetch(`http://${base}/readyz`)).status).toBe(503)
  expect((await fetch(`http://${base}/healthz`)).status).toBe(200)
  const socket = new WebSocket(`ws://${base}/voice`)
  await new Promise<void>(resolve => { socket.on('error', () => resolve()); socket.on('open', () => { socket.close(); throw new Error('admitted during drain') }) })
  expect(authorize).not.toHaveBeenCalled()
  await service.shutdown()
  await service.shutdown()
  expect(service.server.listening).toBe(false)
})
