import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { attachRelay, type RelayDependencies } from './relay'

export function createRelayServer(deps: RelayDependencies) {
  let draining = false
  let shutdownWork: Promise<void> | undefined
  const connections = new Map<object, () => void>()
  const server = createServer((req, res) => {
    const status = req.url === '/healthz' ? 'running' : req.url === '/readyz' ? draining ? 'draining' : 'ready' : null
    res.writeHead(status === null ? 404 : status === 'draining' ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(status === null ? '{}' : JSON.stringify({status}))
  })
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false })
  server.on('upgrade', (req, socket, head) => {
    // Native app has no Origin. No cross-origin browser interface in this slice.
    if (draining || req.url !== '/voice' || req.headers.origin || sockets.clients.size >= 4) { socket.destroy(); return }
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
