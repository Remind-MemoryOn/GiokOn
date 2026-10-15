/**
 * Edge `live-token` 에서 Gemini Live 단기 토큰을 받는다(T23.5).
 * 요양보호사 JWT 에 **더해** 중계만 가진 공유 시크릿을 `x-relay-secret` 헤더로 보낸다 —
 * `live-token` 은 이 헤더가 없으면 403 이다(앱·JWT 소지자의 직접 발급 차단).
 * 시크릿은 프로세스 환경(`VOICE_RELAY_SECRET`)에서만 오고, 로그·오류 메시지에 넣지 않는다.
 */
export const RELAY_SECRET_HEADER = 'x-relay-secret'
/** `live-token` 과 같은 하한 — 짧은 값은 시작 시점에 거절한다(배포 뒤 전 세션 403 을 미리 막는다). */
export const MIN_RELAY_SECRET_LENGTH = 32

export interface LiveTokenRequest {
  supabaseUrl: string
  publishableKey: string
  relaySecret: string
  accessToken: string
  sessionId: string
}

export async function requestLiveToken(fetcher: typeof fetch, r: LiveTokenRequest): Promise<{ token: string; model: string }> {
  const response = await fetcher(`${r.supabaseUrl}/functions/v1/live-token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${r.accessToken}`,
      apikey: r.publishableKey,
      [RELAY_SECRET_HEADER]: r.relaySecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: r.sessionId }),
  })
  // 상태 코드를 코드에 담는다(원인 확인 로그용): 403 = 중계 비밀값 불일치·자격/동의 부족 · 429 = 한도 · 500 = Edge 비밀값 누락 · 502 = Gemini 오류.
  if (!response.ok) throw new Error(`TOKEN_FAILED_${response.status}`)
  const token = await response.json() as { token?: unknown; model?: unknown }
  if (typeof token.token !== 'string' || typeof token.model !== 'string') throw new Error('INVALID_TOKEN')
  return { token: token.token, model: token.model }
}
