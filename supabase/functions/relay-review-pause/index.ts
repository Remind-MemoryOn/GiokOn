// Edge Function: relay-review-pause — 전사 문맥 분류기 직원 확인 일시정지의 시스템 원인 기록(CTX-CLS-S6)
//
//   중계 →(x-relay-secret + 요양보호사 JWT + { kind, session_id, lease_holder, … })→ 이 함수
//        → service_role RPC `system_pause_for_review` / `record_classifier_observation`
//
// 로직은 handler.ts(packages/data 가 테스트한다). 설계: docs/plans/2026-11-15-ctx-cls-s6-db-design.md
// 직원 JWT 는 **신원 확인(getUser)에만** 쓰고, RPC 는 서버 키로만 부른다 — 두 RPC 는 authenticated 에 닫혀 있다.
//
// 배포(사용자 승인 사항 · 마이그레이션 20261115000000·010000 운영 적용 뒤):
//   새 시크릿 없음 — `VOICE_RELAY_SECRET` 은 live-token 과 같은 값(이미 설정됨).
//   supabase functions deploy relay-review-pause   (verify_jwt=true — live-token 과 같게)
//   확인: 헤더 없이 JWT 만으로 부르면 403, 비밀 + 남의 점유 holder 로 부르면 403.

// @ts-nocheck  (Deno 런타임 — 저장소 TS 빌드 대상 아님. 로직 handler.ts 는 packages/data 가 검사·테스트한다)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createRelayReviewPauseHandler } from './handler.ts'

// 복수형은 키 자체가 아니라 { default: key, ... } JSON 맵이다(live-token 과 같은 함정 — AGENTS.md).
function defaultSecretKey() {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
    return typeof keys?.default === 'string' ? keys.default.trim() : ''
  } catch { return '' }
}
// 서버 키만 — anon 키로는 service_role 전용 RPC 를 부를 수 없으므로 대체 키를 두지 않는다(설정 누락은 503 으로 드러난다).
const serviceKey =
  Deno.env.get('SUPABASE_SECRET_KEY')?.trim() ||
  defaultSecretKey() ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
  ''
const supabaseUrl =
  Deno.env.get('SUPABASE_URL') ?? `https://${Deno.env.get('SUPABASE_PROJECT_REF') ?? ''}.supabase.co`
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

serve(createRelayReviewPauseHandler({
  relaySecret: Deno.env.get('VOICE_RELAY_SECRET') ?? '',
  userIdOf: async (authorization) => {
    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data, error } = await service.auth.getUser(token)
    return !error && data?.user?.id ? data.user.id : null
  },
  pause: (args) => service.rpc('system_pause_for_review', args),
  observe: (args) => service.rpc('record_classifier_observation', args),
}))
