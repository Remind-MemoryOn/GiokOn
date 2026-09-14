import { describe, expect, it, vi } from 'vitest'
import { createReportHandler, ReportError, sourceHash, type ReportContext } from '../../../supabase/functions/session-report/handler'

const sessionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const turns = [{ id: 't1', speaker: 'Elderly', text: '어머니와 시장에서 장을 봤어요.' }]
const claim = { text: '시장을 회상했습니다.', evidence: [{ turnId: 't1', quote: '시장' }] }
const generated = { result: { summary: [claim], topics: [], journal: [claim] }, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } }
const request = (body: unknown = { session_id: sessionId }) => new Request('https://synthetic.invalid', { method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: JSON.stringify(body) })
function fixture() {
  const allowed = vi.fn(async () => true), save = vi.fn(async () => {})
  const context: ReportContext = { userId: 'u1', turns, cached: null, allowed, save }
  const authorize = vi.fn(async () => context)
  const generate = vi.fn(async (_turns: typeof turns) => structuredClone(generated))
  const handle = createReportHandler({ model: 'gemini-test', apiKey: 'synthetic', authorize, generate })
  return { handle, context, authorize, generate, allowed, save }
}
describe('session-report authorized lifecycle', () => {
  it('generates from server records and persists before reporting success', async () => {
    const f = fixture(); const response = await f.handle(request())
    expect(response.status).toBe(200)
    expect(f.generate.mock.calls[0]?.[0]).toEqual(turns)
    expect(f.save).toHaveBeenCalledOnce()
    expect(await response.json()).toMatchObject({ report: { sourceSessionId: sessionId } })
  })
  it('rejects caller supplied transcripts and anonymous callers before loading records', async () => {
    const f = fixture()
    expect((await f.handle(request({ session_id: sessionId, turns }))).status).toBe(400)
    expect((await f.handle(new Request('https://synthetic.invalid', { method: 'POST' }))).status).toBe(401)
    expect(f.authorize).not.toHaveBeenCalled()
  })
  it('does not call the provider when authorization or consent fails', async () => {
    const f = fixture(); f.authorize.mockRejectedValueOnce(new ReportError(403, 'denied'))
    expect((await f.handle(request())).status).toBe(403)
    f.allowed.mockResolvedValue(false)
    expect((await f.handle(request())).status).toBe(403)
    expect(f.generate).not.toHaveBeenCalled()
  })
  it('discards a result if consent is withdrawn during generation', async () => {
    const f = fixture(); f.allowed.mockResolvedValueOnce(true).mockResolvedValue(false)
    expect((await f.handle(request())).status).toBe(403)
    expect(f.save).not.toHaveBeenCalled()
  })
  it('reuses a validated source-matching report without another paid call', async () => {
    const f = fixture()
    f.context.cached = { ...generated, schemaVersion: 'session-report-v1', sourceHash: await sourceHash(turns), sourceSessionId: sessionId }
    const response = await f.handle(request())
    expect(await response.json()).toMatchObject({ cached: true })
    expect(f.generate).not.toHaveBeenCalled()
  })
  it('does not report success when persistence fails', async () => {
    const f = fixture(); f.save.mockRejectedValue(new ReportError(409, 'changed'))
    expect((await f.handle(request())).status).toBe(409)
  })
  it('limits repeated paid attempts even when they fail', async () => {
    const f = fixture(); f.generate.mockRejectedValue(new Error('provider'))
    for (let n = 0; n < 3; n++) expect((await f.handle(request())).status).toBe(502)
    expect((await f.handle(request())).status).toBe(429)
    expect(f.generate).toHaveBeenCalledTimes(3)
  })
})
