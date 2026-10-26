import { describe, expect, it, vi } from 'vitest'
import { generateReport } from '../../../supabase/functions/_shared/report-generation'

const turns = [{ id: 't1', speaker: 'Elderly', text: '고향 시장에서 어머니와 장을 봤어요.' }]
const claim = { text: '고향 시장을 회상했습니다.', evidence: [{ turnId: 't1', quote: '고향 시장' }] }
const result = { summary: [claim], topics: [], journal: [claim] }
const config = { apiKey: 'synthetic', model: 'gemini-test' }
const reply = (finishReason = 'STOP', value: unknown = result) => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] })

describe('Gemini report REST adapter', () => {
  it('uses server credentials and structured output, preserving unmeasured usage as null', async () => {
    const fetcher = vi.fn(async () => reply())
    const report = await generateReport(turns, config, new AbortController().signal, fetcher)
    expect(report.result).toEqual(result)
    expect(report.usage.totalTokens).toBeNull()
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain('synthetic')
    expect(JSON.parse(init.body as string).generationConfig.responseMimeType).toBe('application/json')
  })
  it('rejects truncated provider results even when the text is valid JSON', async () => {
    await expect(generateReport(turns, config, new AbortController().signal, async () => reply('MAX_TOKENS'))).rejects.toThrow('REPORT_INCOMPLETE')
  })
  it('does not expose provider error bodies', async () => {
    await expect(generateReport(turns, config, new AbortController().signal, async () => new Response('secret details', { status: 429 }))).rejects.toThrow('REPORT_PROVIDER_LIMIT')
  })
  it.each([400, 401, 403, 404, 429, 500, 503])('retains HTTP %s for operator diagnosis without retaining the response body', async status => {
    const response = new Response('private transcript and API key', { status })
    const read = vi.spyOn(response, 'text')
    const error = await generateReport(turns, config, new AbortController().signal, async () => response).catch(e => e)
    expect(error.httpStatus).toBe(status)
    expect(error.message).toBe(status === 429 ? 'REPORT_PROVIDER_LIMIT' : 'REPORT_PROVIDER_FAILED')
    expect(JSON.stringify(error)).not.toContain('private')
    expect(read).not.toHaveBeenCalled()
  })
  it('rejects invented evidence returned by the real-response parser', async () => {
    const bad = { ...result, journal: [{ ...claim, evidence: [{ turnId: 'other', quote: '고향' }] }] }
    await expect(generateReport(turns, config, new AbortController().signal, async () => reply('STOP', bad))).rejects.toThrow('INVALID_EVIDENCE')
  })
})
