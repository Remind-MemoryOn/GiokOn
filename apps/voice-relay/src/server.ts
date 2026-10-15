import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { attachRelay, logRelayEvent, type RelayDependencies } from './relay'

/**
 * 업그레이드 요청의 Origin 허용 여부.
 *
 * React Native 는 Android(OkHttp `WebSocketModule`)·iOS(SocketRocket) 모두 Origin 헤더를 **자동으로** 붙인다 —
 * 값은 연결 주소의 https 형태(`wss://호스트/voice` → `https://호스트`), 즉 같은 출처다. 예전에는 Origin 이 있으면
 * 무조건 끊어서 실제 앱 연결이 핸드셰이크에서 전부 거절됐다(2026-10-15 실기기 — 대화 시작 불가).
 * 막아야 하는 것은 **다른 출처의 브라우저 페이지**(교차 출처 WebSocket 탈취)다. 중계는 HTML 을 내지 않으므로
 * 같은 출처 페이지는 존재하지 않는다. Origin 이 없는 클라이언트(테스트·서버)는 그대로 허용한다.
 * Origin 은 인증이 아니다 — 자격은 첫 메시지의 JWT 와 서버 판정(session_tick)이 정한다.
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true
  if (!host) return false
  const o = origin.toLowerCase()
  const h = host.toLowerCase()
  return o === `https://${h}` || o === `http://${h}`
}

export function createRelayServer(deps: RelayDependencies) {
  let draining = false
  let shutdownWork: Promise<void> | undefined
  const connections = new Map<object, () => void>()
  const server = createServer((req, res) => {
    const status = req.url === '/healthz' ? 'running' : req.url === '/readyz' ? draining ? 'draining' : 'ready' : null
    res.writeHead(status === null ? 404 : status === 'draining' ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(status === null ? '{}' : JSON.stringify({status}))
  })
  const log = deps.log ?? logRelayEvent
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false })
  server.on('upgrade', (req, socket, head) => {
    // 앱(React Native)은 같은 출처 Origin 을 자동으로 보낸다 — 다른 출처(브라우저 페이지)만 막는다(isAllowedOrigin).
    const refused = draining ? 'draining' : req.url !== '/voice' ? 'path' : !isAllowedOrigin(req.headers.origin, req.headers.host) ? 'origin' : sockets.clients.size >= 4 ? 'capacity' : null
    if (refused) {
      // 거절 이유만 남긴다(Origin 은 출처 주소라 개인정보가 아니다 — 거절 원인 확인용).
      log('upgrade_refused', { reason: refused, ...(refused === 'origin' ? { origin: String(req.headers.origin).slice(0, 200) } : {}) })
      socket.destroy(); return
    }
    log('upgrade_accepted')
    sockets.handleUpgrade(req, socket, head, ws => {
      connections.set(ws, attachRelay(ws, deps))
      ws.once('close', () => connections.delete(ws))
    })
  })
  function drain() { draining = true }
  function shutdown(): Promise<void> {
    if (shutdownWork) return shutdownWork
    drain()
    // Stop provider work and release active-session ownership before waiting for peers.
    for (const close of connections.values()) close()
    shutdownWork = new Promise<void>(resolve => {
      const deadline = setTimeout(() => {
        for (const socket of sockets.clients) socket.terminate()
        server.closeAllConnections()
      }, 5000)
      Promise.all([
        new Promise<void>(done => sockets.close(() => done())),
        new Promise<void>(done => server.close(() => done())),
      ]).then(() => { clearTimeout(deadline); resolve() })
      server.closeIdleConnections()
    })
    return shutdownWork
  }
  return { server, sockets, drain, shutdown, close: () => { void shutdown() } }
}
