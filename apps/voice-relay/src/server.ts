import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { attachRelay, type RelayDependencies } from './relay'

export function createRelayServer(deps: RelayDependencies) {
  const server = createServer((req, res) => {
    res.writeHead(req.url === '/healthz' ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(req.url === '/healthz' ? '{"status":"running"}' : '{}')
  })
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false })
  server.on('upgrade', (req, socket, head) => {
    // Native app has no Origin. No cross-origin browser interface in this slice.
    if (req.url !== '/voice' || req.headers.origin || sockets.clients.size >= 4) { socket.destroy(); return }
    sockets.handleUpgrade(req, socket, head, ws => attachRelay(ws, deps))
  })
  return { server, sockets, close: () => { for (const s of sockets.clients) s.terminate(); sockets.close(); server.close() } }
}
