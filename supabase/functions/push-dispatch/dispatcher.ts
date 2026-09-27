// 안전 알림 앱 푸시 발송(파일럿 C4 · T21.9) — 런타임·환경 import 없음(packages/data 가 테스트한다).
//
// 흐름: pg_cron(10초) → pg_net POST(x-worker-secret) → claim(비밀값 확인 + 알림 잡기, 잡는 즉시 pushed_at) → 202
//       → 백그라운드: Expo Push 로 발송 → "기기에 앱 없음" 토큰 회수.
// ⚠️ 푸시는 **잠금화면에 보인다** — 어르신 성함·발화·위기 종류를 넣지 않는다. 고정 문구 + 알림 id 만 보낸다.
//    자세한 내용은 앱·웹(로그인 뒤, RLS 보호)에서 본다.
// 최대 한 번: claim 이 이미 pushed_at 을 찍으므로 발송이 실패해도 다시 보내지 않는다(같은 위기 알림이 여러 번 울리지 않게).

export interface ClaimedPush { notification_id: string; user_id: string; tokens: string[] }

export class WorkerAuthError extends Error {}

/** Expo Push 메시지(https://docs.expo.dev/push-notifications/sending-notifications/). */
export interface ExpoMessage {
  to: string
  title: string
  body: string
  sound: 'default'
  priority: 'high'
  channelId: string
  data: { type: 'safety'; notificationId: string }
}
/** Expo 발송 영수증(ticket). 오류면 details.error 로 이유가 온다. */
export interface ExpoTicket { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } }

export interface DispatchDeps {
  claim(secret: string, limit: number): Promise<ClaimedPush[]>
  /** 메시지 묶음(최대 100)을 보내고 같은 순서의 영수증을 돌려준다. */
  send(messages: ExpoMessage[]): Promise<ExpoTicket[]>
  revoke(secret: string, tokens: string[]): Promise<void>
  waitUntil?(promise: Promise<unknown>): void
}

/** 잠금화면 문구 — 개인정보(성함·발화·위기 종류) 없음. */
export const SAFETY_PUSH = {
  title: '안전 확인이 필요해요',
  body: '대화 중 확인이 필요한 말씀이 있었어요. 앱을 열어 확인해 주세요.',
} as const
/** 앱이 만드는 안드로이드 알림 채널(apps/mobile/src/lib/push.ts ANDROID_CHANNEL). */
export const ANDROID_CHANNEL = 'default'
export const CLAIM_LIMIT = 50
/** Expo Push 한 요청의 최대 메시지 수. */
export const EXPO_BATCH = 100

export function buildMessages(pushes: ClaimedPush[]): ExpoMessage[] {
  return pushes.flatMap(p => p.tokens.map(to => ({
    to,
    title: SAFETY_PUSH.title,
    body: SAFETY_PUSH.body,
    sound: 'default' as const,
    priority: 'high' as const,
    channelId: ANDROID_CHANNEL,
    data: { type: 'safety' as const, notificationId: p.notification_id },
  })))
}

export interface DispatchResult { messages: number; sent: number; failed: number; revoked: number }

/** 잡은 알림을 보낸다 — 어떤 경우에도 던지지 않는다(한 묶음 실패가 다른 묶음을 막지 않게). */
export async function dispatch(pushes: ClaimedPush[], secret: string, deps: DispatchDeps): Promise<DispatchResult> {
  const messages = buildMessages(pushes)
  const dead = new Set<string>()
  let sent = 0, failed = 0
  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const batch = messages.slice(i, i + EXPO_BATCH)
    let tickets: ExpoTicket[]
    try {
      tickets = await deps.send(batch)
    } catch {
      failed += batch.length
      continue
    }
    batch.forEach((message, index) => {
      const ticket = tickets[index]
      if (ticket?.status === 'ok') { sent++; return }
      failed++
      if (ticket?.details?.error === 'DeviceNotRegistered') dead.add(message.to)
    })
  }
  let revoked = 0
  if (dead.size) {
    try { await deps.revoke(secret, [...dead]); revoked = dead.size } catch { /* 다음 발송에서 다시 걸러진다 */ }
  }
  return { messages: messages.length, sent, failed, revoked }
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export function createDispatchHandler(deps: DispatchDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
    const secret = req.headers.get('x-worker-secret') ?? ''
    if (!secret) return json({ error: 'unauthorized' }, 401)
    let pushes: ClaimedPush[]
    try {
      pushes = await deps.claim(secret, CLAIM_LIMIT)
    } catch (error) {
      if (error instanceof WorkerAuthError) return json({ error: 'unauthorized' }, 401)
      return json({ error: 'claim failed' }, 503)
    }
    const work = dispatch(pushes, secret, deps)
    if (deps.waitUntil) {
      deps.waitUntil(work)
      return json({ claimed: pushes.length }, 202)
    }
    return json({ claimed: pushes.length, ...(await work) }, 200)
  }
}

/** Expo Push HTTP 호출 — 응답 형식이 틀리면 묶음 전체를 실패로 본다. */
export async function sendToExpo(messages: ExpoMessage[], fetcher: typeof fetch, accessToken?: string): Promise<ExpoTicket[]> {
  const response = await fetcher('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) { await response.body?.cancel(); throw new Error('EXPO_PUSH_FAILED') }
  const body = await response.json() as { data?: unknown }
  if (!Array.isArray(body.data) || body.data.length !== messages.length) throw new Error('EXPO_PUSH_RESPONSE')
  return body.data as ExpoTicket[]
}
