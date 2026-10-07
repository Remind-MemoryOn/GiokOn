// live-token 발급 로직 — 런타임·환경 import 없음(packages/data 가 테스트한다). 진입점은 index.ts.
//
// 호출자는 **음성 중계 서버 하나뿐**이다(T23.5 · 2026-10-02). 앱의 직접 호출 코드는 M1(2026-09-24)에서 지웠지만,
// 사용자 JWT 만으로 발급되면 구버전 앱·JWT 소지자가 중계(출력 검열)를 건너뛰어 Gemini 에 직접 붙을 수 있었다.
// 그래서 중계만 가진 공유 시크릿(`VOICE_RELAY_SECRET` → `x-relay-secret` 헤더)을 사용자 JWT 에 **더해** 요구한다.
//   · 시크릿 검사는 JWT·DB 한도보다 **먼저** 한다 — 자격 없는 요청이 사용자 한도를 깎지 못하게.
//   · 시크릿이 설정되지 않았거나 너무 짧으면 **발급하지 않는다**(fail closed — 설정 누락이 우회 경로가 되지 않게).
//   · 비교는 길이·내용과 무관한 시간으로 한다(SHA-256 다이제스트 비교).
// ⚠️ 이것으로 "검열되지 않은 AI 음성이 어르신에게 가는 경로"가 **새 발급**에서 닫힌다. 이미 발급된 토큰(최대 30분)이나
//    열려 있는 연결을 끊지는 못한다 — R010 은 여전히 부분 해결이다(서버 통제는 중계가 맡는다).

export const RELAY_SECRET_HEADER = 'x-relay-secret'
/** 공유 시크릿 최소 길이 — 이보다 짧으면 설정 오류로 보고 발급하지 않는다(예: `openssl rand -hex 32` = 64자). */
export const MIN_RELAY_SECRET_LENGTH = 32
export const AUTH_TOKENS_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens'
/** 토큰에 잠그는 setup 필드(FieldMask JSON = 쉼표 구분 문자열). 나머지는 중계 setup 값이 쓰인다. */
export const LOCKED_SETUP_FIELDS = 'model,generationConfig.responseModalities,sessionResumption'
export const DEFAULT_MODEL = 'gemini-3.8-live'
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface LiveTokenDeps {
  /** Gemini API 키(`GEMINI_API_KEY`). */
  apiKey: string
  /** 중계와 공유하는 비밀값(`VOICE_RELAY_SECRET`). */
  relaySecret: string
  /** 모델 ID(`GEMINI_LIVE_MODEL`) — 비어 있으면 기본값. */
  model: string
  /** Authorization 헤더의 JWT 가 이 프로젝트의 로그인 사용자인지. */
  verifyUser(authorization: string): Promise<boolean>
  /** DB RPC `reserve_live_token` — 자격·동의·한도를 한 트랜잭션에서 검사·계량한다. */
  reserve(authorization: string, sessionId: string): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  fetch?: typeof fetch
  now?: () => number
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

/** 길이·내용과 무관한 시간으로 비교한다(다이제스트끼리 비교 — 원문 길이가 새지 않는다). */
export async function secretMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function createLiveTokenHandler(deps: LiveTokenDeps) {
  const doFetch = deps.fetch ?? fetch
  const now = deps.now ?? Date.now
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST') return json({ error: 'POST 만 허용됩니다.' }, 405)

    if (!deps.apiKey) return json({ error: 'GEMINI_API_KEY 시크릿이 설정되지 않았습니다.' }, 500)
    if (deps.relaySecret.length < MIN_RELAY_SECRET_LENGTH) {
      return json({ error: '중계 자격(VOICE_RELAY_SECRET)이 설정되지 않았습니다.' }, 500)
    }

    // ⓪ 중계 서버만 발급받는다(T23.5) — JWT·DB 보다 먼저.
    const relayCredential = req.headers.get(RELAY_SECRET_HEADER) ?? ''
    if (!relayCredential || !await secretMatches(relayCredential, deps.relaySecret)) {
      return json({ error: '음성 중계 서버를 통해서만 발급할 수 있습니다.' }, 403)
    }

    // ① 호출자(중계가 전달한 요양보호사 JWT)가 이 프로젝트의 로그인 사용자인지 검증한다.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: '인증 정보가 없습니다.' }, 401)
    if (!await deps.verifyUser(authHeader)) return json({ error: '유효하지 않은 세션입니다.' }, 401)

    // 세션 ID만 받는다. 역할·기관·배정·동의·상태 및 원자적 한도는 DB가 검사한다.
    // body 크기는 실제 스트림에서도 제한한다(Content-Length만 믿지 않는다).
    const reader = req.body?.getReader()
    let body = ''
    if (reader) {
      const decoder = new TextDecoder()
      let bytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 1024) {
          await reader.cancel()
          return json({ error: '요청이 너무 큽니다.' }, 413)
        }
        body += decoder.decode(value, { stream: true })
      }
      body += decoder.decode()
    }
    let sessionId: unknown
    try {
      const input = JSON.parse(body)
      if (!input || typeof input !== 'object' || Array.isArray(input) ||
          Object.keys(input).some((key) => key !== 'session_id')) throw new Error('invalid input')
      sessionId = input.session_id
    } catch {
      return json({ error: 'session_id가 필요합니다.' }, 400)
    }
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
      return json({ error: '유효한 session_id가 필요합니다.' }, 400)
    }
    const { data: allowed, error: gateError } = await deps.reserve(authHeader, sessionId)
    if (gateError) {
      if (gateError.code === '42501') return json({ error: '세션 사용 권한 또는 필수 동의를 확인해 주세요.' }, 403)
      if (gateError.code === 'P0001' && gateError.message === 'LIVE_TOKEN_LIMIT') {
        return json({ error: 'Live 사용 한도에 도달했습니다. 잠시 후 또는 다음 날 다시 시도해 주세요.' }, 429)
      }
      return json({ error: '세션 사용 자격을 확인할 수 없습니다.' }, 503)
    }
    if (allowed !== true) return json({ error: '세션 사용 자격을 확인할 수 없습니다.' }, 503)

    // ② ephemeral token 발급 — 설정 잠금으로 이 토큰이 다른 모델·모달리티에 못 쓰게 좁힌다.
    //    REST 필드는 bidiGenerateContentSetup(+fieldMask)다. SDK 의 liveConnectConstraints 는
    //    SDK 전용 이름이라 REST 로 보내면 400 이다(2026-10-07 실 API 확인).
    //    fieldMask 를 빼면 '전부 잠금'이 되어 중계가 setup 에서 보내는 systemInstruction·전사·
    //    수동 VAD 설정이 무시될 수 있다 — 잠글 필드만 명시한다.
    const model = deps.model || DEFAULT_MODEL
    const issuedAt = now()
    const expireTime = new Date(issuedAt + 30 * 60 * 1000).toISOString() // 연결 유지 30분
    const newSessionExpireTime = new Date(issuedAt + 90 * 1000).toISOString() // 시작 윈도 90초

    let res: Response
    try {
      res = await doFetch(AUTH_TOKENS_URL, {
        method: 'POST',
        headers: { 'x-goog-api-key': deps.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uses: 1,
          expireTime,
          newSessionExpireTime,
          bidiGenerateContentSetup: {
            model: `models/${model}`,
            generationConfig: { responseModalities: ['AUDIO'] },
            sessionResumption: {},
          },
          fieldMask: LOCKED_SETUP_FIELDS,
        }),
      })
    } catch (e) {
      return json({ error: `Google 인증 서버에 접근할 수 없습니다: ${e}` }, 502)
    }

    const bodyText = await res.text()
    if (!res.ok) {
      console.error('[live-token] Google 오류', res.status, bodyText)
      return json({ error: `토큰 발급 실패(${res.status})` }, 502)
    }
    let tokenName = ''
    try {
      tokenName = (JSON.parse(bodyText) as { name?: string }).name ?? ''
    } catch {
      tokenName = ''
    }
    if (!tokenName) return json({ error: '토큰 응답 형식이 예상과 다릅니다.' }, 502)

    return json({ token: tokenName, model })
  }
}
