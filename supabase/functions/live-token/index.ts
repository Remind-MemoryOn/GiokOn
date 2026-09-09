// Edge Function: live-token — Gemini Live API **ephemeral token** 발급
//
// 대화 AI는 gemini-3.1-flash-live-preview(Live API, WebSocket)를 쓴다. 클라이언트가
// 본 API 키를 들고 있으면 유출 시 과금·대화 탈취로 이어지므로, Live API 정책상
// 클라이언트 직결에는 단기 토큰(ephemeral token)이 필요하다. 이 함수가 그 발급 창구다.
//
//   앱 →(Supabase JWT)→ 이 함수 →(GEMINI_API_KEY)→ Google auth_tokens
//   앱 ← { token, model } ←
//
// 토큰 제약: 1회 사용(uses=1), 신규 세션 시작 90초, 연결 유지 30분 — 재접속
// (sessionResumption)은 동일 토큰으로 가능하다. 모델명은 GEMINI_LIVE_MODEL 시크릿으로
// 결정한다(코드 고정 금지 원칙 — 교체 시 시크릿만 바꾼다).
//
// 배포:
//   supabase secrets set --env-file supabase/.env   (GEMINI_API_KEY · GEMINI_LIVE_MODEL)
//   supabase functions deploy live-token

// @ts-nocheck  (Deno 런타임 — 저장소 TS 빌드 대상 아님)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const AUTH_TOKENS_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens'
const DEFAULT_MODEL = 'gemini-3.1-flash-live-preview'

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST 만 허용됩니다.' }, 405)

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    return json({ error: 'GEMINI_API_KEY 시크릿이 설정되지 않았습니다.' }, 500)
  }

  // ① 호출자가 우리 프로젝트의 **로그인된 요양보호사**인지 검증한다(익명 발급 방지).
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: '인증 정보가 없습니다.' }, 401)
  // 클라이언트 생성에는 키 이름 어느 하나만 있으면 충분하다(getUser 는 전달된
  // Authorization 헤더의 JWT 를 검증한다). 등록 명칭 차이(단수/복수·레거시)에 흔들리지
  // 않게 폴백 사슬로 읽는다.
  const supabaseKey =
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEYS') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_ANON_KEY') ??
    ''
  const supabaseUrl =
    Deno.env.get('SUPABASE_URL') ?? `https://${Deno.env.get('SUPABASE_PROJECT_REF') ?? ''}.supabase.co`
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    return json({ error: '유효하지 않은 세션입니다.' }, 401)
  }

  // ② ephemeral token 발급 — 설정 잠금(liveConnectConstraints)으로 이 토큰이
  //    다른 모델·모달리티에 못 쓰게 좁힌다.
  const model = Deno.env.get('GEMINI_LIVE_MODEL') || DEFAULT_MODEL
  const now = Date.now()
  const expireTime = new Date(now + 30 * 60 * 1000).toISOString() // 연결 유지 30분
  const newSessionExpireTime = new Date(now + 90 * 1000).toISOString() // 시작 윈도 90초

  let res: Response
  try {
    res = await fetch(AUTH_TOKENS_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: `models/${model}`,
          config: {
            sessionResumption: {},
            responseModalities: ['AUDIO'],
          },
        },
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
})
