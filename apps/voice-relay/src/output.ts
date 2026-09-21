import { screenAiUtterance } from '@giokon/core'

export interface ClovaCredentials { clientId: string; clientSecret: string }

function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, {once:true})
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort() }
  })
}

/** Parse RIFF chunks rather than assuming the provider always uses a 44-byte header. */
export function wavToPcm24k(b: Buffer): Buffer {
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE' || b.readUInt32LE(4) + 8 !== b.length) throw new Error('INVALID_WAV')
  let format = false
  let pcm: Buffer | undefined
  let p = 12
  for (; p + 8 <= b.length;) {
    const size = b.readUInt32LE(p + 4), start = p + 8, end = start + size
    if (end > b.length) throw new Error('TRUNCATED_WAV')
    const kind = b.toString('ascii', p, p + 4)
    if (kind === 'fmt ') {
      if (format || size < 16 || b.readUInt16LE(start) !== 1 || b.readUInt16LE(start + 2) !== 1 || b.readUInt32LE(start + 4) !== 24000 || b.readUInt32LE(start + 8) !== 48000 || b.readUInt16LE(start + 12) !== 2 || b.readUInt16LE(start + 14) !== 16) throw new Error('UNSUPPORTED_WAV')
      format = true
    }
    if (kind === 'data') {
      if (pcm || size === 0 || size % 2 !== 0) throw new Error('INVALID_PCM')
      pcm = b.subarray(start, end)
    }
    p = end + (size % 2)
  }
  if (p !== b.length) throw new Error('TRUNCATED_WAV')
  if (!format || !pcm) throw new Error('MISSING_WAV_DATA')
  return pcm
}

export async function synthesizeValidated(text: string, credentials: ClovaCredentials, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<{ text: string; pcm: Buffer }> {
  // Initial integration gate: existing deterministic guard + bounded complete text.
  // This is not a full semantic/factual validator. A rejected turn closes the relay
  // rather than silently replacing speech and leaving Gemini's history divergent.
  if (!text.trim() || text.length > 200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) || !screenAiUtterance(text).allowed) throw new Error('OUTPUT_REJECTED')
  signal.throwIfAborted()
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15000)])
  const request = fetcher('https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts', {
    method: 'POST',
    headers: { 'X-NCP-APIGW-API-KEY-ID': credentials.clientId, 'X-NCP-APIGW-API-KEY': credentials.clientSecret, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ speaker: 'nara', speed: '0', volume: '0', pitch: '0', format: 'wav', 'sampling-rate': '24000', text }),
    signal: requestSignal,
  }).then(response => {
    if (requestSignal.aborted) {
      void response.body?.cancel().catch(() => {})
      requestSignal.throwIfAborted()
    }
    return response
  })
  const response = await untilAborted(request, requestSignal)
  if (!response.ok || !response.body) {
    void response.body?.cancel().catch(() => {})
    throw new Error(response.status === 429 ? 'CLOVA_RATE_LIMIT' : response.status >= 500 ? 'CLOVA_UNAVAILABLE' : 'CLOVA_FAILED')
  }
  const reader = response.body.getReader(), chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await untilAborted(reader.read(), requestSignal)
      requestSignal.throwIfAborted()
      if (done) break
      size += value.byteLength
      if (size > 2 * 1024 * 1024) throw new Error('AUDIO_TOO_LARGE')
      chunks.push(Buffer.from(value))
    }
  } finally { void reader.cancel().catch(() => {}) }
  requestSignal.throwIfAborted()
  return { text, pcm: wavToPcm24k(Buffer.concat(chunks)) }
}
