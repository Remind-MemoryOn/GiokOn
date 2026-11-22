import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import {
  createRelayReviewPauseHandler, MAX_BODY_BYTES, RELAY_SECRET_HEADER, type RelayReviewPauseDeps,
} from '../../../supabase/functions/relay-review-pause/handler'

// CTX-CLS-S6 — 분류기 직원 확인 일시정지의 시스템 원인 기록 창구(Edge relay-review-pause)
const SECRET = 'synthetic-relay-secret-0123456789abcdef'
const USER = 'a0000000-0000-4000-8000-000000000002'
const SESSION = '11111111-2222-4333-8444-555555555555'
const HOLDER = '22222222-0000-4000-8000-000000000001'
const EVENT = '33333333-0000-4000-8000-000000000001'
const JWT = 'Bearer synthetic.jwt.token'

function deps(over: Partial<RelayReviewPauseDeps> = {}) {
  return {
    relaySecret: SECRET,
    userIdOf: vi.fn(async () => USER as string | null),
    pause: vi.fn(async () => ({ data: { safety_event_id: EVENT, state: 'paused' } as unknown, error: null })),
    observe: vi.fn(async () => ({ data: true as unknown, error: null })),
    ...over,
  }
}
const PAUSE = { kind: 'pause', session_id: SESSION, lease_holder: HOLDER, event_id: EVENT, reason: 'classifier_crisis_direct',
  categories: ['medical_emergency'], excerpt: '숨이 턱턱 막혀요', model_version: 'm1', policy_version: 'p1' }
const OBSERVE = { kind: 'observe', session_id: SESSION, lease_holder: HOLDER, turn_id: 't1', input_revision: 0,
  reason: 'classifier_context_logged', action: 'continue', categories: [], model_version: 'm1', policy_version: 'p1' }
function post(headers: Record<string, string>, body: unknown = PAUSE) {
  return new Request('https://synthetic.invalid/functions/v1/relay-review-pause', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
const ok = (secret = SECRET) => ({ Authorization: JWT, [RELAY_SECRET_HEADER]: secret })

describe('relay-review-pause — 중계 전용 자격', () => {
  it('비밀이 없거나 틀리면 403 — JWT·DB 를 보지 않는다', async () => {
    for (const headers of [{ Authorization: JWT }, ok('wrong-secret-wrong-secret-wrong-secret!!')]) {
      const d = deps()
      const res = await createRelayReviewPauseHandler(d)(post(headers))
      expect(res.status).toBe(403)
      expect(d.userIdOf).not.toHaveBeenCalled()
      expect(d.pause).not.toHaveBeenCalled()
    }
  })

  it('비밀이 설정되지 않았거나 짧으면 처리하지 않는다(500)', async () => {
    for (const relaySecret of ['', 'short']) {
      const d = deps({ relaySecret })
      expect((await createRelayReviewPauseHandler(d)(post(ok(relaySecret)))).status).toBe(500)
      expect(d.pause).not.toHaveBeenCalled()
    }
  })

  it('JWT 가 없거나 유효하지 않으면 401', async () => {
    const d = deps({ userIdOf: vi.fn(async () => null) })
    expect((await createRelayReviewPauseHandler(d)(post({ [RELAY_SECRET_HEADER]: SECRET }))).status).toBe(401)
    expect((await createRelayReviewPauseHandler(d)(post(ok()))).status).toBe(401)
    expect(d.pause).not.toHaveBeenCalled()
  })

  it('POST 만', async () => {
    const res = await createRelayReviewPauseHandler(deps())(new Request('https://synthetic.invalid/x', { method: 'GET' }))
    expect(res.status).toBe(405)
  })
})

describe('relay-review-pause — 일시정지 기록', () => {
  it('정상 — 직원 id 는 JWT 에서, 나머지는 본문에서. 응답은 사건 id·상태만(원문 없음)', async () => {
    const d = deps()
    const res = await createRelayReviewPauseHandler(d)(post(ok()))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = await res.json()
    expect(body).toEqual({ safetyEventId: EVENT, state: 'paused' })
    expect(JSON.stringify(body)).not.toContain('숨이')
    expect(d.pause).toHaveBeenCalledWith({
      p_session_id: SESSION, p_lease_holder: HOLDER, p_requested_by: USER, p_event_id: EVENT,
      p_reason: 'classifier_crisis_direct', p_categories: ['medical_emergency'], p_excerpt: '숨이 턱턱 막혀요',
      p_model_version: 'm1', p_policy_version: 'p1',
    })
  })

  it('본문에 직원 id 를 넣어 바꿀 수 없다 — 모르는 칸은 400', async () => {
    const d = deps()
    const res = await createRelayReviewPauseHandler(d)(post(ok(), { ...PAUSE, requested_by: 'a0000000-0000-4000-8000-000000000009' }))
    expect(res.status).toBe(400)
    expect(d.pause).not.toHaveBeenCalled()
  })

  it.each([
    ['session_id 형식', { session_id: 'x' }], ['lease_holder 없음', { lease_holder: undefined }],
    ['event_id 없음', { event_id: undefined }], ['모르는 reason', { reason: 'classifier_context_logged' }],
    ['모르는 범주', { categories: ['fire'] }], ['범주 중복', { categories: ['abuse', 'abuse'] }],
    ['발췌 200자 초과', { excerpt: '가'.repeat(201) }], ['정책 버전 없음', { policy_version: '' }],
    ['모델 버전 형식', { model_version: 5 }], ['모르는 kind', { kind: 'delete' }],
  ])('입력 검증: %s → 400', async (_, patch) => {
    const d = deps()
    expect((await createRelayReviewPauseHandler(d)(post(ok(), { ...PAUSE, ...patch }))).status).toBe(400)
    expect(d.pause).not.toHaveBeenCalled()
  })

  it('JSON 이 아니면 400 · 본문이 크면 413', async () => {
    expect((await createRelayReviewPauseHandler(deps())(post(ok(), '{broken'))).status).toBe(400)
    expect((await createRelayReviewPauseHandler(deps())(post(ok(), { ...PAUSE, pad: 'x'.repeat(MAX_BODY_BYTES) }))).status).toBe(413)
  })

  it('실패 사유(분류기 시간 초과)는 모델 버전 없이도 기록한다', async () => {
    const pause = vi.fn(async (_args: unknown) => ({ data: { safety_event_id: EVENT, state: 'paused' } as unknown, error: null }))
    const { model_version: _omit, ...rest } = PAUSE
    const res = await createRelayReviewPauseHandler(deps({ pause }))(post(ok(), { ...rest, reason: 'classifier_unavailable', categories: [] }))
    expect(res.status).toBe(200)
    expect(pause.mock.calls[0]?.[0]).toMatchObject({ p_model_version: null, p_categories: [] })
  })

  it('DB 판정을 그대로 전한다 — 연결 증명 실패 403 · 사건 id 충돌 409 · 입력 오류 400 · 그 밖 503', async () => {
    const cases: [{ code?: string; message?: string }, number][] = [
      [{ code: '42501', message: 'SYSTEM_PAUSE_FORBIDDEN' }, 403],
      [{ code: '23505', message: 'SYSTEM_PAUSE_EVENT_CONFLICT' }, 409],
      [{ code: '22023', message: 'SYSTEM_PAUSE_CATEGORIES' }, 400],
      [{ code: 'XX000', message: 'boom' }, 503],
    ]
    for (const [error, status] of cases) {
      const d = deps({ pause: vi.fn(async () => ({ data: null, error })) })
      const res = await createRelayReviewPauseHandler(d)(post(ok()))
      expect(res.status).toBe(status)
      expect(await res.text()).not.toContain(error.message ?? '')
    }
    const thrown = deps({ pause: vi.fn(async () => { throw new Error('network') }) })
    expect((await createRelayReviewPauseHandler(thrown)(post(ok()))).status).toBe(503)
  })
})

describe('relay-review-pause — 관찰 기록', () => {
  it('정상 — 원문 칸이 없다', async () => {
    const d = deps()
    const res = await createRelayReviewPauseHandler(d)(post(ok(), OBSERVE))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ recorded: true })
    expect(d.observe).toHaveBeenCalledWith(expect.objectContaining({ p_requested_by: USER, p_turn_id: 't1', p_input_revision: 0 }))
    expect(d.pause).not.toHaveBeenCalled()
  })
  it.each([
    ['발췌를 실어 보내면 거절', { excerpt: '원문' }], ['모르는 reason', { reason: 'classifier_ambiguous' }],
    ['모르는 action', { action: 'staff_review_pause' }], ['입력 개정 음수', { input_revision: -1 }],
    ['입력 개정 소수', { input_revision: 1.5 }], ['모델 버전 없음', { model_version: undefined }],
  ])('입력 검증: %s → 400', async (_, patch) => {
    const d = deps()
    expect((await createRelayReviewPauseHandler(d)(post(ok(), { ...OBSERVE, ...patch }))).status).toBe(400)
    expect(d.observe).not.toHaveBeenCalled()
  })
})

// 배포 진입점의 환경 연결(live-token-entrypoint.test.ts 와 같은 방식) — 서버 키만 쓰고 사용자 JWT 를 RPC 에 싣지 않는다.
function boot(env: Record<string, string>) {
  const rpc = vi.fn(async () => ({ data: true, error: null }))
  const getUser = vi.fn(async () => ({ data: { user: { id: USER } }, error: null }))
  const createClient = vi.fn((_url: string, _key: string, _options: unknown) => ({ auth: { getUser }, rpc }))
  let d!: RelayReviewPauseDeps
  const source = readFileSync(new URL('../../../supabase/functions/relay-review-pause/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
  runInNewContext(source, {
    Deno: { env: { get: (key: string) => env[key] } },
    createClient, serve: vi.fn(),
    createRelayReviewPauseHandler: (value: RelayReviewPauseDeps) => { d = value },
  })
  return { createClient, rpc, getUser, deps: d }
}

describe('relay-review-pause 배포 환경', () => {
  it('JSON 키 맵에서 기본 키를 꺼내고, 사용자 Authorization 을 클라이언트에 싣지 않는다', async () => {
    const f = boot({ SUPABASE_URL: 'https://synthetic.invalid', VOICE_RELAY_SECRET: SECRET,
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'synthetic-secret-key' }), SUPABASE_SERVICE_ROLE_KEY: 'legacy' })
    expect(f.createClient.mock.calls[0]?.[1]).toBe('synthetic-secret-key')
    expect(JSON.stringify(f.createClient.mock.calls[0]?.[2] ?? {})).not.toContain('Authorization')
    expect(f.deps.relaySecret).toBe(SECRET)
    expect(await f.deps.userIdOf('Bearer synthetic-user-jwt')).toBe(USER)
    expect(f.getUser).toHaveBeenCalledWith('synthetic-user-jwt')
    await f.deps.pause({} as never)
    expect(f.rpc).toHaveBeenCalledWith('system_pause_for_review', {})
    await f.deps.observe({} as never)
    expect(f.rpc).toHaveBeenCalledWith('record_classifier_observation', {})
  })
  it('anon 키로 대체하지 않는다', () => {
    const f = boot({ SUPABASE_ANON_KEY: 'synthetic-anon' })
    expect(f.createClient.mock.calls[0]?.[1]).toBe('')
  })
})
