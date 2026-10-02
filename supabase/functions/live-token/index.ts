// Edge Function: live-token — Gemini Live API **ephemeral token** 발급
//
// 대화 AI는 gemini-3.8-live(Live API, WebSocket)를 쓴다. 클라이언트가
// 본 API 키를 들고 있으면 유출 시 과금·대화 탈취로 이어지므로, Live API 정책상
// 클라이언트 직결에는 단기 토큰(ephemeral token)이 필요하다. 이 함수가 그 발급 창구다.
//
//   중계 →(x-relay-secret + 요양보호사 JWT + { session_id })→ 이 함수
//        → DB RPC `reserve_live_token`(자격·동의·한도를 한 트랜잭션에서 검사·계량)
//        →(GEMINI_API_KEY)→ Google auth_tokens
//   중계 ← { token, model } ←
//
// 호출자는 **음성 중계 서버 하나뿐**이다(`apps/voice-relay/src/live-token.ts`). 앱의 직접 호출은 M1 에서 지웠고,
// T23.5(2026-10-02)부터 중계만 가진 공유 시크릿(`VOICE_RELAY_SECRET` → `x-relay-secret` 헤더)이 사용자 JWT 에
// **더해** 있어야 발급한다 — 없으면 403(JWT·DB 한도 검사보다 먼저). 설정이 빠지면 발급하지 않는다(500).
// 발급 로직은 `handler.ts`(packages/data 가 테스트한다). Gemini 키는 Supabase 밖으로 나가지 않는다.
//
// ── R005 하드닝(2026-09-09, 마이그레이션 `20260909010000_live_token_authorization`) ──
// 그전에는 로그인만 확인하고 토큰을 내줬다. 지금은 **DB가 판정한다**:
//   · 입력은 `session_id` 하나뿐이다. 다른 키가 섞이면 400 — 클라이언트가 role·user_id 를
//     바꿔 보내 판정을 흔들 수 없다. RPC 는 `auth.uid()` 를 쓰고 anon 은 실행 권한이 없다.
//   · DB 가 보는 것: 온보딩 · 돌봄팀 역할(caregiver·org_admin·social_worker·center_director) · 기관 일치
//     · `active` 세션 · **필수 동의 3종의 현행 v1.0·미철회**
//     (파일럿 D4 `20260924030000` — 담당 배정 검사는 없어졌다. 같은 기관 돌봄팀이면 교대 근무자도 진행한다.
//      운영 DB 에 적용되기 전까지는 옛 규칙(caregiver/org_admin + 활성 배정)이 그대로 판정한다.)
//     (동의 검사는 R010 에서 `can_process_session` 과 같은 조건으로 합쳐졌다).
//   · 한도(`app.live_token_limits` 기본값 `(3, 20, 200, 2000)`): 사용자 분당 3 ·
//     사용자 일 20 · 기관 일 200 · 프로젝트 일 2,000. 일 경계는 Asia/Seoul.
//     조건부 UPSERT 로 증가시키고 **어느 하나라도 초과하면 그 호출의 증가를 전부 롤백**한다.
//     공급자 요청이 실패해도 **예약 횟수를 돌려주지 않는다**(반복 실패를 이용한 우회 차단).
//   · 본문은 스트림에서 1KB 로 자른다(Content-Length 만 믿지 않는다).
//   · 응답: 400 잘못된 입력 · 401 인증 없음 · 403 중계 자격 없음·자격/동의 부족 · 413 본문 초과 ·
//     429 한도 초과 · 502 공급자 오류 · 503 DB 확인 실패. 전부 `no-store`.
//
// ⚠️ 이 한도는 **발급 횟수 상한**이다. 이미 발급한 토큰이나 열려 있는 연결을 취소하지
//    못하고, 실제 과금액을 제한하지도 않는다. 중계 전용화(T23.5)는 **새 발급**만 막는다 —
//    **R010 은 여전히 부분 해결**이다(매 전송·연결 수명 통제는 중계가 맡는다).
//    이 파일을 고칠 때 그 한계를 해결했다고 적지 말 것.
//
// 토큰 제약: 1회 사용(uses=1), 신규 세션 시작 90초, 연결 유지 30분 — 재접속
// (sessionResumption)은 동일 토큰으로 가능하다. `liveConnectConstraints` 로 모델과
// 모달리티(AUDIO)를 잠가 이 토큰이 다른 모델에 쓰이지 못하게 한다. 모델명은
// GEMINI_LIVE_MODEL 시크릿으로 결정한다(코드 고정 금지 원칙 — 교체 시 시크릿만 바꾼다).
//
// 배포(2026-09-09 확정 — CLI 우선, 단일 함수만, 배포 후 소스 일치 확인):
//   supabase secrets set --env-file supabase/.env   (GEMINI_API_KEY · GEMINI_LIVE_MODEL · VOICE_RELAY_SECRET)
//   supabase functions deploy live-token            (verify_jwt=true 유지)
//   ⚠️ 순서(T23.5): 중계에 같은 VOICE_RELAY_SECRET 을 넣고 새 중계를 먼저 배포 → 그다음 이 함수 배포 → 헤더 없이 JWT 만으로
//      부르면 403 인지 확인. 역순이면 그 사이 모든 음성 세션 시작이 403 으로 막힌다.

// @ts-nocheck  (Deno 런타임 — 저장소 TS 빌드 대상 아님. 발급 로직 handler.ts 는 packages/data 가 검사·테스트한다)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createLiveTokenHandler } from './handler.ts'

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
const client = (authorization: string) => createClient(supabaseUrl, supabaseKey, {
  global: { headers: { Authorization: authorization } },
})

serve(createLiveTokenHandler({
  apiKey: Deno.env.get('GEMINI_API_KEY') ?? '',
  relaySecret: Deno.env.get('VOICE_RELAY_SECRET') ?? '',
  model: Deno.env.get('GEMINI_LIVE_MODEL') ?? '',
  verifyUser: async (authorization) => {
    const { data, error } = await client(authorization).auth.getUser()
    return !error && !!data?.user
  },
  reserve: (authorization, sessionId) => client(authorization).rpc('reserve_live_token', { p_session_id: sessionId }),
  fetch,
}))
