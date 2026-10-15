import { afterEach, expect, it, vi } from 'vitest'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocket } from 'ws'
import { createRelayServer, isAllowedOrigin } from './server'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

it('separates liveness from admission and refuses upgrades while draining', async () => {
  const authorize = vi.fn()
  const service = createRelayServer({authorize, connectProvider:vi.fn(), geminiTts:{apiKey:'synthetic'}})
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

it('accepts the same-origin Origin that React Native adds and refuses other origins', () => {
  // Android OkHttp WebSocketModule / iOS SocketRocket: wss://host/voice → Origin https://host
  expect(isAllowedOrigin('https://voice-relay-abc-du.a.run.app', 'voice-relay-abc-du.a.run.app')).toBe(true)
  expect(isAllowedOrigin('http://127.0.0.1:8080', '127.0.0.1:8080')).toBe(true)
  expect(isAllowedOrigin('HTTPS://Relay.Example', 'relay.example')).toBe(true)
  expect(isAllowedOrigin(undefined, 'relay.example')).toBe(true)
  expect(isAllowedOrigin('https://evil.example', 'relay.example')).toBe(false)
  expect(isAllowedOrigin('https://relay.example.evil.example', 'relay.example')).toBe(false)
  expect(isAllowedOrigin('null', 'relay.example')).toBe(false)
  expect(isAllowedOrigin('https://relay.example', undefined)).toBe(false)
})

it('admits an app upgrade carrying its own origin and refuses a cross-origin browser upgrade', async () => {
  const service = createRelayServer({authorize:vi.fn(), connectProvider:vi.fn(), geminiTts:{apiKey:'synthetic'}})
  cleanups.push(service.close)
  service.server.listen(0,'127.0.0.1'); await once(service.server,'listening')
  const base = `127.0.0.1:${(service.server.address() as AddressInfo).port}`
  const outcome = (origin: string) => new Promise<'open' | 'refused'>(resolve => {
    const ws = new WebSocket(`ws://${base}/voice`, { origin })
    ws.on('open', () => { ws.close(); resolve('open') })
    ws.on('error', () => resolve('refused'))
  })
  expect(await outcome(`http://${base}`)).toBe('open')
  expect(await outcome('https://evil.example')).toBe('refused')
  await service.shutdown()
})
