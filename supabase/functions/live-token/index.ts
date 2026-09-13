// Edge Function: live-token — Gemini Live API **ephemeral token** 발급
//
// 대화 AI는 gemini-3.1-flash-live-preview(Live API, WebSocket)를 쓴다. 클라이언트가
// 본 API 키를 들고 있으면 유출 시 과금·대화 탈취로 이어지므로, Live API 정책상
// 클라이언트 직결에는 단기 토큰(ephemeral token)이 필요하다. 이 함수가 그 발급 창구다.
//
//   호출자 →(Supabase JWT + { session_id })→ 이 함수
//        → DB RPC `reserve_live_token`(자격·동의·한도를 한 트랜잭션에서 검사·계량)
//        →(GEMINI_API_KEY)→ Google auth_tokens
//   호출자 ← { token, model } ←
//
// 호출자는 둘이다: 앱이 직접(`apps/mobile/src/lib/live/engine.ts`) · 음성 중계 서버
// (`apps/voice-relay/src/main.ts` — 이 게이트를 그대로 재사용한다. Gemini 키는
// Supabase 밖으로 나가지 않는다).
//
// ── R005 하드닝(2026-09-09, 마이그레이션 `20260909010000_live_token_authorization`) ──
// 그전에는 로그인만 확인하고 토큰을 내줬다. 지금은 **DB가 판정한다**:
//   · 입력은 `session_id` 하나뿐이다. 다른 키가 섞이면 400 — 클라이언트가 role·user_id 를
//     바꿔 보내 판정을 흔들 수 없다. RPC 는 `auth.uid()` 를 쓰고 anon 은 실행 권한이 없다.
//   · DB 가 보는 것: 온보딩 · caregiver/org_admin 역할 · 기관 일치 · 활성 배정
//     (기관 관리자는 기관 범위) · `active` 세션 · **필수 동의 3종의 현행 v1.0·미철회**
//     (동의 검사는 R010 에서 `can_process_session` 과 같은 조건으로 합쳐졌다).
//   · 한도(`app.live_token_limits` 기본값 `(3, 20, 200, 2000)`): 사용자 분당 3 ·
//     사용자 일 20 · 기관 일 200 · 프로젝트 일 2,000. 일 경계는 Asia/Seoul.
//     조건부 UPSERT 로 증가시키고 **어느 하나라도 초과하면 그 호출의 증가를 전부 롤백**한다.
//     공급자 요청이 실패해도 **예약 횟수를 돌려주지 않는다**(반복 실패를 이용한 우회 차단).
//   · 본문은 스트림에서 1KB 로 자른다(Content-Length 만 믿지 않는다).
//   · 응답: 400 잘못된 입력 · 401 인증 없음 · 403 자격/동의 부족 · 413 본문 초과 ·
//     429 한도 초과 · 502 공급자 오류 · 503 DB 확인 실패. 전부 `no-store`.
//
// ⚠️ 이 한도는 **발급 횟수 상한**이다. 이미 발급한 토큰이나 열려 있는 연결을 취소하지
//    못하고, 실제 과금액을 제한하지도 않는다. 앱이 Gemini 에 직접 연결하는 구조가 남아
//    있는 한 **R010 은 부분 해결**이다(서버가 매 전송과 연결 수명을 통제하는 중계 구조가
//    필요하다). 이 파일을 고칠 때 그 한계를 해결했다고 적지 말 것.
//
// 토큰 제약: 1회 사용(uses=1), 신규 세션 시작 90초, 연결 유지 30분 — 재접속
// (sessionResumption)은 동일 토큰으로 가능하다. `liveConnectConstraints` 로 모델과
// 모달리티(AUDIO)를 잠가 이 토큰이 다른 모델에 쓰이지 못하게 한다. 모델명은
// GEMINI_LIVE_MODEL 시크릿으로 결정한다(코드 고정 금지 원칙 — 교체 시 시크릿만 바꾼다).
//
// 배포(2026-09-09 확정 — CLI 우선, 단일 함수만, 배포 후 소스 일치 확인):
//   supabase secrets set --env-file supabase/.env   (GEMINI_API_KEY · GEMINI_LIVE_MODEL)
//   supabase functions deploy live-token            (verify_jwt=true 유지)

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
  if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return json({ error: '유효한 session_id가 필요합니다.' }, 400)
  }
  const { data: allowed, error: gateError } = await supabase.rpc('reserve_live_token', { p_session_id: sessionId })
  if (gateError) {
    if (gateError.code === '42501') return json({ error: '세션 사용 권한 또는 필수 동의를 확인해 주세요.' }, 403)
    if (gateError.code === 'P0001' && gateError.message === 'LIVE_TOKEN_LIMIT') {
      return json({ error: 'Live 사용 한도에 도달했습니다. 잠시 후 또는 다음 날 다시 시도해 주세요.' }, 429)
    }
    return json({ error: '세션 사용 자격을 확인할 수 없습니다.' }, 503)
  }
  if (allowed !== true) return json({ error: '세션 사용 자격을 확인할 수 없습니다.' }, 503)

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
