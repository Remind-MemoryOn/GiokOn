// Edge Function: naver-auth — 네이버 소셜 로그인 세션 발급
//
// Supabase 에 네이버 네이티브 provider 가 없어(설계 확정 M17.5) 이 함수가 다음을 한다:
//   앱: S256 challenge → 서버 authorize/callback → 일회성 handoff + verifier 교환
//   웹: GET /authorize → 네이버 동의 화면 → GET /callback → 웹으로 되돌림
//   서버: ① 네이버 토큰 교환(client secret 보관) → ② 프로필 조회
//         → ③ users 보장(admin.createUser, 이미 있으면 생략)
//         → ④ magiclink 생성 링크 → verify 엔드포인트를 서버에서 호출해
//            access/refresh token 을 받아 돌려준다.
//
// ⚠️ 배포는 **--no-verify-jwt**(로그인 전 익명 호출이 정상 흐름이다):
//   supabase functions deploy naver-auth --no-verify-jwt --project-ref ufkbzpdjomtmxjipmwub
//
// 보안 — 웹 흐름의 state 는 **서버가 서명**하고(HMAC-SHA256, 만료 10분)
// **HttpOnly 쿠키의 nonce 와 대조**한다. 브라우저는 남이 만든 인가 URL 로도 끌려갈 수
// 있어 서명만으로는 부족하다(쿠키가 있어야 이 브라우저가 시작한 로그인임이 증명된다).
// 서명 키는 서비스 롤 키에서 파생한다(새 시크릿을 요구하지 않는다 — 서버에만 있는 값).
// 앱도 서버 서명 state/쿠키를 검증한다. 딥링크에는 세션 토큰/네이버 코드를 싣지 않는다.
// redirect_to 는 **허용 오리진 목록**(WEB_ORIGINS, 없으면 SITE_URL)로 제한한다 —
// 열려 있으면 토큰을 임의 사이트로 실어 보내는 오픈 리다이렉트가 된다.

// @ts-nocheck  (Deno 런타임 — 저장소 TS 빌드 대상 아님)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const TOKEN_URL = 'https://nid.naver.com/oauth2.0/token'
const PROFILE_URL = 'https://openapi.naver.com/v1/nid/me'
const AUTHORIZE_URL = 'https://nid.naver.com/oauth2.0/authorize'
/** state 유효 시간 — 동의 화면에 머무는 시간을 넉넉히 덮되 무한하지 않게. */
const STATE_TTL_MS = 10 * 60 * 1000
const NONCE_COOKIE = 'giokon_naver_nonce'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  })
}

function serviceKey(): string {
  return (
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    ''
  )
}

// ── state 서명 ────────────────────────────────────────────────────────────
const enc = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function hmacKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(`naver-auth-state|${serviceKey()}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** payload 를 서명해 `<payload>.<sig>` 로 만든다. */
async function signState(payload: Record<string, unknown>): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)))
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(body)))
  return `${body}.${b64url(sig)}`
}

/** 서명·만료를 확인하고 payload 를 돌려준다(위조·만료면 null). */
async function readState(state: string): Promise<Record<string, unknown> | null> {
  try {
    if (typeof state !== 'string' || state.length > 4096 || state.split('.').length !== 2) return null
    const [body, sig] = state.split('.')
    if (!body || !sig) return null
    const expected = new Uint8Array(
      await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(body)),
    )
    const got = unb64url(sig)
    // 길이·내용 모두 상수시간 비교(타이밍으로 서명을 흘리지 않는다).
    if (got.length !== expected.length) return null
    let diff = 0
    for (let i = 0; i < expected.length; i++) diff |= got[i] ^ expected[i]
    if (diff !== 0) return null
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body)))
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null
    return payload
  } catch {
    return null
  }
}

function allowedMobileRedirect(raw: string): string | null {
  const allowed = (Deno.env.get('MOBILE_AUTH_REDIRECTS') ?? 'giokon://auth/callback').split(',').map(s => s.trim())
  return allowed.includes(raw) ? raw : null
}

function handoffClient() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** 허용 오리진 안에서만 되돌린다 — 오픈 리다이렉트 차단. */
function allowedRedirect(raw: string): string | null {
  const origins = (Deno.env.get('WEB_ORIGINS') ?? Deno.env.get('SITE_URL') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
  if (!origins.length) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  return origins.includes(u.origin) ? u.toString() : null
}

function cookieValue(req: Request, name: string): string {
  const raw = req.headers.get('cookie') ?? ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) {
      try { return decodeURIComponent(v.join('=')) } catch { return '' }
    }
  }
  return ''
}

/** 오류도 사용자가 보는 화면으로 되돌린다(함수 JSON 을 그대로 보여주지 않는다). */
function backWithError(redirectTo: string | null, message: string): Response {
  if (!redirectTo) return json({ error: message }, 400)
  const u = new URL(redirectTo)
  u.hash = `naver_error=${encodeURIComponent(message)}`
  return new Response(null, {
    status: 302,
    headers: { Location: u.toString(), 'Cache-Control': 'no-store' },
  })
}

/** 네이버 인가코드 → Supabase 세션 토큰. 웹·앱이 공유하는 본체. */
async function exchange(
  code: string,
  clientId: string,
  clientSecret: string,
  state: string,
): Promise<{ ok: true; access_token: string; refresh_token: string; email: string } | { ok: false; status: number; error: string }> {
  // ① 네이버 토큰 교환
  const tokenRes = await fetch(`${TOKEN_URL}?grant_type=authorization_code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state,
    }),
  })
  const tokenText = await tokenRes.text()
  if (!tokenRes.ok) return { ok: false as const, status: 502, error: `네이버 토큰 교환 실패(${tokenRes.status})` }
  let accessToken = ''
  try {
    accessToken = (JSON.parse(tokenText) as { access_token?: string }).access_token ?? ''
  } catch {
    accessToken = ''
  }
  if (!accessToken) return { ok: false as const, status: 502, error: `토큰 응답 이상: ${tokenText.slice(0, 80)}` }

  // ② 프로필(이름·이메일은 사용자가 제공 동의한 범위만 온다 — 없으면 파생 이메일)
  const profRes = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!profRes.ok) return { ok: false as const, status: 502, error: `프로필 조회 실패(${profRes.status})` }
  const profJson = (await profRes.json()) as {
    response?: { id?: string; name?: string; email?: string; mobile?: string }
  }
  const p = profJson.response ?? {}
  if (!p.id) return { ok: false as const, status: 502, error: '프로필에 id 가 없습니다.' }
  // 이메일 미동의 시 안정적 파생 이메일로 계정을 식별한다(재로그인 시 같은 계정).
  const email = p.email ?? `${p.id}@naver-users.giokon.kr`

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const admin = createClient(url, serviceKey(), { auth: { autoRefreshToken: false, persistSession: false } })

  // ③ users 보장 — 중복(422)이면 기존 계정 사용
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: p.name ?? '', provider: 'naver', phone: p.mobile ?? null },
  })
  if (createErr && !/already|duplicate|exists|been registered/i.test(createErr.message)) {
    return { ok: false as const, status: 502, error: `계정 생성 실패: ${createErr.message}` }
  }

  // ④ 세션 발급 — magiclink 생성 링크의 hashed_token 으로 verify 를 서버에서 호출하면
  //    Location 헤더에 access/refresh 가 담긴다(비밀번호를 만들지 않는 공식 경로).
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkErr || !link?.properties?.hashed_token) {
    return { ok: false as const, status: 502, error: `세션 링크 생성 실패: ${linkErr?.message ?? 'unknown'}` }
  }
  const verifyUrl =
    `${url}/auth/v1/verify?token=${encodeURIComponent(link.properties.hashed_token)}` +
    `&type=magiclink&redirect_to=${encodeURIComponent(url + '/auth/v1/logout?redirect_to=about:blank')}`
  const verifyRes = await fetch(verifyUrl, { redirect: 'manual' })
  const location = verifyRes.headers.get('location') ?? ''
  const rawFragment = location.includes('#')
    ? location.split('#')[1] ?? ''
    : location.split('?')[1] ?? ''
  const tokens = new URLSearchParams(rawFragment)
  const accessTokenOut = tokens.get('access_token')
  const refreshTokenOut = tokens.get('refresh_token')
  if (!accessTokenOut || !refreshTokenOut) {
    return { ok: false as const, status: 502, error: `verify 응답에 세션 토큰이 없습니다(status ${verifyRes.status})` }
  }

  return {
    ok: true as const,
    access_token: accessTokenOut,
    refresh_token: refreshTokenOut,
    email,
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const clientId = Deno.env.get('NAVER_CLIENT_ID')
  const clientSecret = Deno.env.get('NAVER_CLIENT_SECRET')
  if (!clientId || !clientSecret || !serviceKey()) {
    return json({ error: 'NAVER_CLIENT_ID/SECRET 시크릿이 없습니다.' }, 500)
  }

  const reqUrl = new URL(req.url)
  // 함수 경로는 `/functions/v1/naver-auth[/...]` — 뒤쪽 한 조각만 본다.
  const leaf = reqUrl.pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  // Gateway rewrites req.url to an internal http URL without /functions/v1.
  // Build provider callbacks from the public project URL, never that internal URL.
  const selfBase = `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/functions/v1/naver-auth`

  // ── 웹 ① 동의 화면으로 보낸다 ────────────────────────────────────────────
  if (req.method === 'GET' && leaf === 'authorize') {
    const mobile = reqUrl.searchParams.get('mode') === 'mobile'
    const redirectTo = (mobile ? allowedMobileRedirect : allowedRedirect)(reqUrl.searchParams.get('redirect_to') ?? '')
    if (!redirectTo) return json({ error: '허용되지 않은 redirect_to 입니다.' }, 400)

    const challenge = reqUrl.searchParams.get('challenge') ?? ''
    const appState = reqUrl.searchParams.get('app_state') ?? ''
    if (mobile && (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || !/^[A-Za-z0-9_-]{16,256}$/.test(appState))) {
      return json({ error: '올바른 앱 인증 요청이 필요합니다.' }, 400)
    }

    const nonce = crypto.randomUUID()
    const state = await signState({ nonce, redirectTo, exp: Date.now() + STATE_TTL_MS,
      ...(mobile ? { mobile: true, challenge, appState } : {}),
    })
    const naver = new URL(AUTHORIZE_URL)
    naver.searchParams.set('response_type', 'code')
    naver.searchParams.set('client_id', clientId)
    naver.searchParams.set('redirect_uri', `${selfBase}/callback`)
    naver.searchParams.set('state', state)

    // nonce 는 쿠키에만 둔다 — state 만으로는 남이 만든 로그인을 그대로 완주시킬 수 있다.
    // SameSite=None: 네이버에서 되돌아오는 크로스사이트 이동에도 쿠키가 실려야 한다.
    return new Response(null, {
      status: 302,
      headers: {
        Location: naver.toString(),
        'Cache-Control': 'no-store',
        'Set-Cookie': `${NONCE_COOKIE}=${nonce}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=None`,
      },
    })
  }

  // ── 웹 ② 네이버가 되돌려준 code 를 세션으로 바꿔 웹에 넘긴다 ──────────────
  if (req.method === 'GET' && leaf === 'callback') {
    const state = await readState(reqUrl.searchParams.get('state') ?? '')
    // state 가 깨졌으면 되돌릴 곳도 신뢰할 수 없다 — 그대로 400.
    if (!state) return json({ error: '로그인 요청이 만료되었거나 올바르지 않습니다.' }, 400)
    const mobile = state.mobile === true
    const redirectTo = (mobile ? allowedMobileRedirect : allowedRedirect)(String(state.redirectTo ?? ''))
    if (!redirectTo) return json({ error: '허용되지 않은 redirect_to 입니다.' }, 400)

    const clear = `${NONCE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`
    const withClear = (res: Response) => {
      res.headers.append('Set-Cookie', clear)
      return res
    }

    if (cookieValue(req, NONCE_COOKIE) !== String(state.nonce ?? '')) {
      return withClear(backWithError(redirectTo, '로그인 요청을 확인하지 못했습니다. 다시 시도해 주세요.'))
    }
    // 사용자가 동의를 취소하면 code 없이 error 만 돌아온다.
    const denied = reqUrl.searchParams.get('error')
    if (denied) return withClear(backWithError(redirectTo, '네이버 로그인이 취소되었습니다.'))
    const code = reqUrl.searchParams.get('code') ?? ''
    if (!code) return withClear(backWithError(redirectTo, '인가 코드를 받지 못했습니다.'))

    if (mobile) {
      if (code.length > 2048) return withClear(backWithError(redirectTo, '인가 코드가 올바르지 않습니다.'))
      const { data, error } = await handoffClient().rpc('store_naver_mobile_handoff', {
        p_id: state.nonce, p_challenge: state.challenge, p_code: code,
        p_state: reqUrl.searchParams.get('state'), p_expires_at: new Date(Number(state.exp)).toISOString(),
      })
      if (error || data !== true) return withClear(backWithError(redirectTo, '로그인 요청이 만료되었거나 사용되었습니다.'))
      const back = new URL(redirectTo)
      back.hash = new URLSearchParams({ transaction_id: String(state.nonce), state: String(state.appState) }).toString()
      return withClear(new Response(null, { status: 302, headers: { Location: back.toString(), 'Cache-Control': 'no-store' } }))
    }

    const out = await exchange(code, clientId, clientSecret, reqUrl.searchParams.get('state') ?? '')
    if (!out.ok) return withClear(backWithError(redirectTo, out.error))

    // 토큰은 **프래그먼트**로 넘긴다 — 쿼리스트링은 서버 로그·Referer 에 남는다.
    const back = new URL(redirectTo)
    back.hash =
      `access_token=${encodeURIComponent(out.access_token)}` +
      `&refresh_token=${encodeURIComponent(out.refresh_token)}` +
      `&provider=naver`
    return withClear(
      new Response(null, {
        status: 302,
        headers: { Location: back.toString(), 'Cache-Control': 'no-store' },
      }),
    )
  }

  // 앱이 보관한 verifier로만 일회성 서버 인가 코드를 가져올 수 있다.
  if (req.method === 'POST') {
    let input: { transaction_id?: string; code_verifier?: string }
    try {
      const reader = req.body?.getReader()
      const decoder = new TextDecoder()
      let body = ''
      let bytes = 0
      if (reader) {
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
      input = JSON.parse(body)
      if (!input || Object.keys(input).some(k => !['transaction_id','code_verifier'].includes(k))) throw new Error('invalid')
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.transaction_id ?? '') || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier ?? '')) throw new Error('invalid')
    } catch {
      return json({ error: '잘못된 요청 본문입니다.' }, 400)
    }
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(input.code_verifier))))
    const { data, error } = await handoffClient().rpc('consume_naver_mobile_handoff', { p_id: input.transaction_id, p_challenge: challenge })
    if (error) return json({ error: '로그인 요청을 확인할 수 없습니다.' }, 503)
    if (!data?.code || !data?.state) return json({ error: '로그인 요청이 만료되었거나 올바르지 않습니다.' }, 400)
    const out = await exchange(data.code, clientId, clientSecret, data.state)
    if (!out.ok) return json({ error: out.error }, out.status)
    return json({ access_token: out.access_token, refresh_token: out.refresh_token, email: out.email })
  }

  return json({ error: '지원하지 않는 요청입니다.' }, 405)
})
