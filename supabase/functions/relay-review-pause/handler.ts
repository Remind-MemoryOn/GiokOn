// relay-review-pause 로직 — 런타임·환경 import 없음(packages/data 가 테스트한다). 진입점은 index.ts.
//
// 전사 문맥 분류기(CTX-CLS-S6 · 설계 docs/plans/2026-11-15-ctx-cls-s6-db-design.md)의 **시스템 원인 기록** 창구.
// 호출자는 음성 중계 서버 하나뿐이다. 직원 토큰만으로는 "시스템이 걸었다"를 증명할 수 없어서(사용자 확정 D7·Q9):
//   ⓪ 중계 전용 비밀(`x-relay-secret` = 기존 `VOICE_RELAY_SECRET` 재사용) — JWT·DB 보다 먼저 · 설정 누락이면 처리하지 않는다
//   ① 직원 JWT → 사용자 id(신원 확인에만 쓴다 — DB 호출에는 싣지 않는다)
//   ② service_role 전용 RPC 로 기록. DB 가 **살아 있는 점유(holder)와 그 직원**을 다시 확인한다(비밀이 새어도 다른 세션 불가).
// 동작 두 가지:
//   · kind=pause   → public.system_pause_for_review — 안전 사건 + 시스템 일시정지 + 개입 기록(같은 사건 id 재시도는 무변경)
//   · kind=observe → public.record_classifier_observation — "계속 + 기록"(원문 없음)
// 원문(excerpt)은 로그·응답에 싣지 않는다. 응답은 전부 no-store.

import { MIN_RELAY_SECRET_LENGTH, RELAY_SECRET_HEADER, secretMatches } from '../live-token/handler.ts'

export { RELAY_SECRET_HEADER }
export const MAX_BODY_BYTES = 2048
export const PAUSE_REASONS = [
  'classifier_unavailable', 'classifier_crisis_direct', 'classifier_distress_direct',
  'classifier_ambiguous', 'classifier_out_of_scope', 'classifier_self_harm_context',
] as const
export const OBSERVATION_REASONS = ['classifier_context_logged', 'classifier_closing'] as const
export const OBSERVATION_ACTIONS = ['continue', 'elder_closing'] as const
const CATEGORIES = ['self_harm', 'medical_emergency', 'abuse']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }

export interface PauseArgs {
  p_session_id: string; p_lease_holder: string; p_requested_by: string; p_event_id: string
  p_reason: string; p_categories: string[]; p_excerpt: string | null; p_model_version: string | null; p_policy_version: string
}
export interface ObserveArgs {
  p_session_id: string; p_lease_holder: string; p_requested_by: string; p_turn_id: string; p_input_revision: number
  p_reason: string; p_action: string; p_categories: string[]; p_model_version: string; p_policy_version: string
}

export interface RelayReviewPauseDeps {
  /** 중계와 공유하는 비밀값(`VOICE_RELAY_SECRET` — live-token 과 같은 값). */
  relaySecret: string
  /** Authorization 헤더의 JWT 주인 id(유효하지 않으면 null). */
  userIdOf(authorization: string): Promise<string | null>
  /** service_role 로 `system_pause_for_review`. */
  pause(args: PauseArgs): Promise<RpcResult>
  /** service_role 로 `record_classifier_observation`. */
  observe(args: ObserveArgs): Promise<RpcResult>
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-relay-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const isOneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
function categoriesOf(v: unknown): string[] | null {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > 3 || v.some(c => !CATEGORIES.includes(c)) || new Set(v).size !== v.length) return null
  return v as string[]
}
function keysOnly(o: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(o).every(k => allowed.includes(k))
}

const PAUSE_KEYS = ['kind', 'session_id', 'lease_holder', 'event_id', 'reason', 'categories', 'excerpt', 'model_version', 'policy_version']
const OBSERVE_KEYS = ['kind', 'session_id', 'lease_holder', 'turn_id', 'input_revision', 'reason', 'action', 'categories', 'model_version', 'policy_version']

/** 본문 검증 — 실패하면 null. 모르는 칸이 하나라도 있으면 거절한다. */
export function parseBody(input: unknown, userId: string): { kind: 'pause'; args: PauseArgs } | { kind: 'observe'; args: ObserveArgs } | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const b = input as Record<string, unknown>
  if (!isUuid(b.session_id) || !isUuid(b.lease_holder)) return null
  const categories = categoriesOf(b.categories)
  if (!categories) return null
  if (b.kind === 'pause') {
    if (!keysOnly(b, PAUSE_KEYS) || !isUuid(b.event_id) || !isOneOf(b.reason, PAUSE_REASONS) || !isText(b.policy_version, 100)) return null
    if (b.excerpt !== undefined && b.excerpt !== null && !(typeof b.excerpt === 'string' && b.excerpt.length <= 200)) return null
    if (b.model_version !== undefined && b.model_version !== null && !isText(b.model_version, 100)) return null
    return {
      kind: 'pause',
      args: {
        p_session_id: b.session_id, p_lease_holder: b.lease_holder, p_requested_by: userId, p_event_id: b.event_id,
        p_reason: b.reason, p_categories: categories,
        p_excerpt: typeof b.excerpt === 'string' && b.excerpt.trim() ? b.excerpt : null,
        p_model_version: typeof b.model_version === 'string' ? b.model_version : null, p_policy_version: b.policy_version,
      },
    }
  }
  if (b.kind === 'observe') {
    if (!keysOnly(b, OBSERVE_KEYS) || !isText(b.turn_id, 100) || !Number.isInteger(b.input_revision) || (b.input_revision as number) < 0
        || !isOneOf(b.reason, OBSERVATION_REASONS) || !isOneOf(b.action, OBSERVATION_ACTIONS)
        || !isText(b.model_version, 100) || !isText(b.policy_version, 100)) return null
    return {
      kind: 'observe',
      args: {
        p_session_id: b.session_id, p_lease_holder: b.lease_holder, p_requested_by: userId, p_turn_id: b.turn_id,
        p_input_revision: b.input_revision as number, p_reason: b.reason, p_action: b.action, p_categories: categories,
        p_model_version: b.model_version, p_policy_version: b.policy_version,
      },
    }
  }
  return null
}

/** DB 오류 → 응답. 원문은 싣지 않는다. */
function fromDbError(error: { code?: string; message?: string }): Response {
  const message = error.message ?? ''
  if (error.code === '42501' || message.includes('SYSTEM_PAUSE_FORBIDDEN')) return json({ error: '이 연결로는 기록할 수 없습니다.' }, 403)
  if (error.code === '23505' || message.includes('SYSTEM_PAUSE_EVENT_CONFLICT')) return json({ error: '사건 id 가 다른 기록과 겹칩니다.' }, 409)
  if (error.code === '22023' || error.code === '23514') return json({ error: '입력이 올바르지 않습니다.' }, 400)
  return json({ error: 'DB 기록에 실패했습니다.' }, 503)
}

export function createRelayReviewPauseHandler(deps: RelayReviewPauseDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
    if (req.method !== 'POST') return json({ error: 'POST 만 허용됩니다.' }, 405)
    if (deps.relaySecret.length < MIN_RELAY_SECRET_LENGTH) {
      return json({ error: '중계 자격(VOICE_RELAY_SECRET)이 설정되지 않았습니다.' }, 500)
    }

    // ⓪ 중계 서버만 — JWT·DB 보다 먼저.
    const relayCredential = req.headers.get(RELAY_SECRET_HEADER) ?? ''
    if (!relayCredential || !await secretMatches(relayCredential, deps.relaySecret)) {
      return json({ error: '음성 중계 서버를 통해서만 기록할 수 있습니다.' }, 403)
    }

    // ① 직원 신원
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: '인증 정보가 없습니다.' }, 401)
    const userId = await deps.userIdOf(authorization)
    if (!userId || !UUID.test(userId)) return json({ error: '유효하지 않은 세션입니다.' }, 401)

    // 본문 — 스트림에서 크기를 자른다(Content-Length 만 믿지 않는다).
    const reader = req.body?.getReader()
    let raw = ''
    if (reader) {
      const decoder = new TextDecoder()
      let bytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel()
          return json({ error: '요청이 너무 큽니다.' }, 413)
        }
        raw += decoder.decode(value, { stream: true })
      }
      raw += decoder.decode()
    }
    let parsed: ReturnType<typeof parseBody> = null
    try { parsed = parseBody(JSON.parse(raw), userId) } catch { parsed = null }
    if (!parsed) return json({ error: '입력이 올바르지 않습니다.' }, 400)

    // ② 기록(service_role)
    let result: RpcResult
    try {
      result = parsed.kind === 'pause' ? await deps.pause(parsed.args) : await deps.observe(parsed.args)
    } catch {
      return json({ error: 'DB 기록에 실패했습니다.' }, 503)
    }
    if (result.error) return fromDbError(result.error)
    if (parsed.kind === 'pause') {
      const data = (result.data ?? {}) as { safety_event_id?: unknown; state?: unknown }
      return json({ safetyEventId: data.safety_event_id ?? parsed.args.p_event_id, state: data.state ?? null })
    }
    return json({ recorded: result.data === true })
  }
}
