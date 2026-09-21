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

describe('validated Clova output', () => {
  it.each([[429,'CLOVA_RATE_LIMIT'],[503,'CLOVA_UNAVAILABLE'],[401,'CLOVA_FAILED']] as const)('rejects HTTP %s without retrying or reading its error text', async (status,code) => {
    const fetcher = vi.fn(async()=>new Response('provider diagnostic must not be exposed',{status}))
    await expect(synthesizeValidated('안녕하세요.',{clientId:'synthetic',clientSecret:'synthetic'},new AbortController().signal,fetcher)).rejects.toThrow(code)
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('applies the request timeout to a stalled response body', async () => {
    const timeout = new AbortController()
    const stub = vi.spyOn(AbortSignal,'timeout').mockReturnValue(timeout.signal)
    try {
      const fetcher = vi.fn(async()=>new Response(new ReadableStream<Uint8Array>()))
      const pending = synthesizeValidated('안녕하세요.',{clientId:'synthetic',clientSecret:'synthetic'},new AbortController().signal,fetcher)
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
    const pending = synthesizeValidated('안녕하세요.', {clientId:'synthetic',clientSecret:'synthetic'}, abort.signal, fetcher).catch(e => {error=e})
    abort.abort()
    await new Promise(done => setTimeout(done, 0))
    try { expect(error).toBeInstanceOf(Error) }
    finally { resolve(new Response(new Uint8Array(wav()))); await pending }
  })
  it('settles cancellation while reading a body whose read and cancel never settle', async () => {
    const abort = new AbortController()
    const body = new ReadableStream<Uint8Array>({cancel:()=>new Promise(()=>{})})
    const fetcher = vi.fn(async()=>new Response(body))
    let error: unknown
    const pending = synthesizeValidated('안녕하세요.', {clientId:'synthetic',clientSecret:'synthetic'}, abort.signal, fetcher).catch(e => {error=e})
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
  it.each(['', '바보', '가'.repeat(201)])('does not call Clova for invalid output', async text => {
    const fetcher = vi.fn()
    await expect(synthesizeValidated(text, { clientId: 'synthetic', clientSecret: 'synthetic' }, new AbortController().signal, fetcher)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requests WAV 24k and returns only its PCM, never Gemini audio', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array(wav()), { headers: { 'content-type': 'audio/wav' } }))
    const result = await synthesizeValidated('오늘 어떤 이야기를 나눌까요?', { clientId: 'synthetic-id', clientSecret: 'synthetic-secret' }, new AbortController().signal, fetcher)
    expect(result.pcm).toEqual(wav().subarray(44))
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(request[1].body)).toContain('sampling-rate=24000')
    expect(String(request[1].body)).toContain('format=wav')
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
    const fetcher = vi.fn(async () => { abort.abort(); return new Response(new Uint8Array(wav())) })
    await expect(synthesizeValidated('안녕하세요.', { clientId: 'synthetic', clientSecret: 'synthetic' }, abort.signal, fetcher)).rejects.toThrow()
  })
})
