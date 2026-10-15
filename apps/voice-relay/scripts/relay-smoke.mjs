// 운영 음성 중계 점검(앱 없이) — 저장소 루트에서:
//   node apps/voice-relay/scripts/relay-smoke.mjs wss://<중계 호스트>/voice
//
// 앱(React Native)과 같은 방식으로 연결한다 — Origin 헤더 `https://<호스트>` 를 붙인다(2026-10-15 실기기 장애 원인).
//   1) /readyz            — 새 연결을 받을 수 있는가
//   2) WebSocket 핸드셰이크 — 같은 출처 Origin 연결이 열리는가(PR #61 반영 여부)
//   3) 가짜 인증 메시지     — 중계가 Supabase 로 로그인 확인을 하고 거절·종료하는가(중계 → Supabase 경로)
// 실제 로그인·세션·Gemini 는 쓰지 않는다(비용·DB 쓰기 없음). Gemini 연결은 gemini-smoke.ps1 과 앱 대화로 확인한다.
import { WebSocket } from 'ws'

const url = process.argv[2] ?? process.env.VOICE_RELAY_URL
if (!url || !/^wss?:\/\/[^/?#@]+\/voice$/.test(url)) {
  console.error('사용법: node apps/voice-relay/scripts/relay-smoke.mjs wss://<중계 호스트>/voice')
  process.exit(2)
}
// wss → https(운영) · ws → http(로컬 시험). 앱과 같은 규칙으로 Origin 을 만든다.
const web = url.startsWith('wss:') ? 'https' : 'http'
const host = new URL(url.replace(/^wss?:/, `${web}:`)).host
const ok = (m) => console.log(`[OK]   ${m}`)
const fail = (m) => { console.log(`[FAIL] ${m}`); process.exit(1) }

// 1) readyz
try {
  const res = await fetch(`${web}://${host}/readyz`, { signal: AbortSignal.timeout(20000) })
  const body = await res.text()
  if (res.status !== 200) fail(`/readyz ${res.status} ${body}`)
  ok(`/readyz 200 ${body}`)
} catch (e) { fail(`/readyz 접속 실패: ${e instanceof Error ? e.message : e}`) }

// 2) 핸드셰이크(앱과 같은 Origin) → 3) 가짜 인증
const ws = new WebSocket(url, { origin: `${web}://${host}`, handshakeTimeout: 20000 })
const opened = await new Promise((resolve) => {
  ws.once('open', () => resolve(true))
  ws.once('unexpected-response', (_req, res) => { console.log(`       핸드셰이크 응답 ${res.statusCode}`); resolve(false) })
  ws.once('error', (e) => { console.log(`       ${e.message}`); resolve(false) })
})
if (!opened) fail('앱과 같은 Origin 으로 연결이 열리지 않음 — 중계가 아직 옛 이미지(Origin 거절)이거나 주소가 틀림')
ok('WebSocket 핸드셰이크(앱과 같은 Origin) 열림')

const started = Date.now()
const closed = new Promise((resolve) => ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() })))
ws.send(JSON.stringify({ relayAuth: { sessionId: '00000000-0000-0000-0000-000000000000', accessToken: 'relay-smoke-invalid-token', protocolVersion: 2 } }))
const result = await Promise.race([closed, new Promise((resolve) => setTimeout(() => resolve(null), 15000))])
if (!result) { ws.terminate(); fail('가짜 인증 뒤 15초 동안 종료되지 않음 — 중계가 Supabase 에 접속하지 못하고 기다리는 중일 수 있음') }
ok(`가짜 인증은 거절·종료됨(${Date.now() - started}ms, close ${result.code} ${result.reason}) — 중계가 인증 단계를 처리함`)
console.log('\n다음: Cloud Run 로그에서 {"voiceRelay":"closed","stage":"auth","reason":"AUTH_FAILED"} 줄이 보이면 중계 → Supabase 경로 정상.')
console.log('      (진단 로그가 들어간 이미지에서만 보인다.) 이어서 앱에서 대화를 시작해 보세요.')
