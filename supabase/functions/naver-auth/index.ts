// Edge Function: naver-auth — 네이버 소셜 로그인 세션 발급
//
// Supabase 에 네이버 네이티브 provider 가 없어(설계 확정 M17.5) 이 함수가 다음을 한다:
//   앱: 네이버 인가 코드 획득(openAuthSessionAsync) → POST { code, state }
//   서버: ① 네이버 토큰 교환(client secret 보관) → ② 프로필 조회
//         → ③ users 보장(admin.createUser, 이미 있으면 생략)
//         → ④ magiclink 생성 링크 → verify 엔드포인트를 서버에서 호출해
//            access/refresh token 을 받아 앱에 돌려준다.
//
// ⚠️ 배포는 **--no-verify-jwt**(로그인 전 익명 호출이 정상 흐름이다):
//   supabase functions deploy naver-auth --no-verify-jwt --project-ref ufkbzpdjomtmxjipmwub
// 보안: state 는 앱이 생성·검증하고, code 는 1회성이라 재사용 불가. 필요 시 IP/레이트
// 리밋은 게이트웨어 단에서 후속 강화한다.

// @ts-nocheck  (Deno 런타임 — 저장소 TS 빌드 대상 아님)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const TOKEN_URL = 'https://nid.naver.com/oauth2.0/token'
const PROFILE_URL = 'https://openapi.naver.com/v1/nid/me'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST 만 허용됩니다.' }, 405)

  const clientId = Deno.env.get('NAVER_CLIENT_ID')
  const clientSecret = Deno.env.get('NAVER_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return json({ error: 'NAVER_CLIENT_ID/SECRET 시크릿이 없습니다.' }, 500)
  }

  let code = ''
  try {
    const body = (await req.json()) as { code?: string; state?: string }
    code = body.code ?? ''
    if (!code) return json({ error: 'code 가 필요합니다.' }, 400)
  } catch {
    return json({ error: '잘못된 요청 본문입니다.' }, 400)
  }

  // ① 네이버 토큰 교환
  const tokenRes = await fetch(`${TOKEN_URL}?grant_type=authorization_code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  })
  const tokenText = await tokenRes.text()
  if (!tokenRes.ok) return json({ error: `네이버 토큰 교환 실패(${tokenRes.status})` }, 502)
  let accessToken = ''
  try {
    accessToken = (JSON.parse(tokenText) as { access_token?: string }).access_token ?? ''
  } catch {
    accessToken = ''
  }
  if (!accessToken) return json({ error: `토큰 응답 이상: ${tokenText.slice(0, 80)}` }, 502)

  // ② 프로필(이름·이메일은 사용자가 제공 동의한 범위만 온다 — 없으면 파생 이메일)
  const profRes = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!profRes.ok) return json({ error: `프로필 조회 실패(${profRes.status})` }, 502)
  const profJson = (await profRes.json()) as {
    response?: { id?: string; name?: string; email?: string; mobile?: string }
  }
  const p = profJson.response ?? {}
  if (!p.id) return json({ error: '프로필에 id 가 없습니다.' }, 502)
  // 이메일 미동의 시 안정적 파생 이메일로 계정을 식별한다(재로그인 시 같은 계정).
  const email = p.email ?? `${p.id}@naver-users.giokon.kr`

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEYS') ??
    Deno.env.get('SUPABASE_ANON_KEY') ??
    ''
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // ③ users 보장 — 중복(422)이면 기존 계정 사용
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: p.name ?? '', provider: 'naver', phone: p.mobile ?? null },
  })
  if (createErr && !/already|duplicate|exists|been registered/i.test(createErr.message)) {
    return json({ error: `계정 생성 실패: ${createErr.message}` }, 502)
  }

  // ④ 세션 발급 — magiclink 생성 링크의 hashed_token 으로 verify 를 서버에서 호출하면
  //    Location 헤더에 access/refresh 가 담긴다(비밀번호를 만들지 않는 공식 경로).
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkErr || !link?.properties?.hashed_token) {
    return json({ error: `세션 링크 생성 실패: ${linkErr?.message ?? 'unknown'}` }, 502)
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
    return json({ error: `verify 응답에 세션 토큰이 없습니다(status ${verifyRes.status})` }, 502)
  }

  return json({ access_token: accessTokenOut, refresh_token: refreshTokenOut, email })
})
