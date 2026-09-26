import { describe, it, expect, vi } from 'vitest'
import { synthesizeValidated, wavToPcm24k } from './output'

function wav(rate = 24000) {
  const b = Buffer.alloc(48)
  b.write('RIFF', 0); b.writeUInt32LE(40, 4); b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(4, 40); b.writeInt16LE(100, 44)
  return b
}

const config = { apiKey: 'synthetic-key' }
const response = (audio = wav()) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: audio.toString('base64'), mimeType: 'audio/wav' } }] } }] }), { headers: { 'content-type': 'application/json' } })

describe('validated Gemini TTS output', () => {
  it.each([[429,'GEMINI_TTS_RATE_LIMIT'],[503,'GEMINI_TTS_UNAVAILABLE'],[401,'GEMINI_TTS_FAILED']] as const)('rejects HTTP %s without retrying or reading its error text', async (status,code) => {
    const fetcher = vi.fn(async()=>new Response('provider diagnostic must not be exposed',{status}))
    await expect(synthesizeValidated('안녕하세요.',config,new AbortController().signal,fetcher)).rejects.toThrow(code)
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('applies the request timeout to a stalled response body', async () => {
    const timeout = new AbortController()
    const stub = vi.spyOn(AbortSignal,'timeout').mockReturnValue(timeout.signal)
    try {
      const fetcher = vi.fn(async()=>new Response(new ReadableStream<Uint8Array>()))
      const pending = synthesizeValidated('안녕하세요.',config,new AbortController().signal,fetcher)
      const failed = expect(pending).rejects.toThrow('test timeout')
      await new Promise(resolve=>setTimeout(resolve,0))
      timeout.abort(new Error('test timeout'))
      await failed
      expect(stub).toHaveBeenCalledWith(15000)
    } finally { stub.mockRestore() }
  })
  it('settles cancellation even when the provider fetch does not settle', async () => {
    const abort = new AbortController()
    let resolve!: (value: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(done => {resolve=done}))
    let error: unknown
    const pending = synthesizeValidated('안녕하세요.', config, abort.signal, fetcher).catch(e => {error=e})
    abort.abort()
    await new Promise(done => setTimeout(done, 0))
    try { expect(error).toBeInstanceOf(Error) }
    finally { resolve(response()); await pending }
  })
  it('settles cancellation while reading a body whose read and cancel never settle', async () => {
    const abort = new AbortController()
    const body = new ReadableStream<Uint8Array>({cancel:()=>new Promise(()=>{})})
    const fetcher = vi.fn(async()=>new Response(body))
    let error: unknown
    const pending = synthesizeValidated('안녕하세요.', config, abort.signal, fetcher).catch(e => {error=e})
    await new Promise(done => setTimeout(done, 0)); abort.abort()
    await new Promise(done => setTimeout(done, 0))
    expect(error).toBeInstanceOf(Error)
    await pending
  })
  it('rejects trailing partial RIFF chunks instead of accepting ambiguous audio', () => {
    const b = Buffer.concat([wav(), Buffer.alloc(3)])
    b.writeUInt32LE(b.length-8,4)
    expect(()=>wavToPcm24k(b)).toThrow()
  })
  it.each(['', '바보', '가'.repeat(201)])('does not call Gemini TTS for invalid output', async text => {
    const fetcher = vi.fn()
    await expect(synthesizeValidated(text, config, new AbortController().signal, fetcher)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requests WAV 24k and returns only its PCM, never Gemini audio', async () => {
    const fetcher = vi.fn(async () => response())
    const result = await synthesizeValidated('오늘 어떤 이야기를 나눌까요?', config, new AbortController().signal, fetcher)
    expect(result.pcm).toEqual(wav().subarray(44))
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(request[0]).toContain('/models/gemini-3.8-flash-tts:generateContent')
    expect(request[1].headers).toEqual(expect.objectContaining({ 'x-goog-api-key': 'synthetic-key' }))
    const body = JSON.parse(String(request[1].body))
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(body.generationConfig.responseFormat.audio).toEqual({ mimeType: 'AUDIO_WAV', sampleRate: 24000 })
    expect(body.generationConfig.speechConfig).toEqual({ voiceConfig: { voice: 'Kore' }, languageCode: 'ko-KR' })
    expect(body.contents[0].parts[0].text).toBe('오늘 어떤 이야기를 나눌까요?')
  })
  it.each([16000, 48000])('rejects unexpected sample rate %s', rate => {
    expect(() => wavToPcm24k(wav(rate))).toThrow()
  })
  it('rejects malformed and truncated provider output', () => {
    expect(() => wavToPcm24k(Buffer.from('not audio'))).toThrow()
    expect(() => wavToPcm24k(wav().subarray(0, 46))).toThrow()
  })
  it('does not return a late result after cancellation', async () => {
    const abort = new AbortController()
    const fetcher = vi.fn(async () => { abort.abort(); return response() })
    await expect(synthesizeValidated('안녕하세요.', config, abort.signal, fetcher)).rejects.toThrow()
  })
})
