import { screenAiUtterance } from '@giokon/core'

export const DEFAULT_GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts'
export const DEFAULT_GEMINI_TTS_VOICE = 'Kore'

export interface GeminiTtsConfig {
  apiKey: string
  model?: string
  voice?: string
}

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

async function readBoundedBody(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) throw new Error('GEMINI_TTS_FAILED')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let size = 0
  try {
    while (true) {
      const { done, value } = await untilAborted(reader.read(), signal)
      signal.throwIfAborted()
      if (done) break
      size += value.byteLength
      if (size > 3 * 1024 * 1024) throw new Error('AUDIO_TOO_LARGE')
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally { void reader.cancel().catch(() => {}) }
}

function audioFromResponse(body: string): Buffer {
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { throw new Error('GEMINI_TTS_FAILED') }
  const part = (parsed as { candidates?: { content?: { parts?: { inlineData?: { data?: unknown; mimeType?: unknown } }[] } }[] })
    .candidates?.[0]?.content?.parts?.find(item => item.inlineData)
  const data = part?.inlineData?.data
  const mimeType = part?.inlineData?.mimeType
  if (typeof data !== 'string' || typeof mimeType !== 'string' || !/^audio\/wav(?:;|$)/i.test(mimeType) ||
      data.length > 3 * 1024 * 1024 || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error('GEMINI_TTS_FAILED')
  }
  const wav = Buffer.from(data, 'base64')
  if (wav.length > 2 * 1024 * 1024) throw new Error('AUDIO_TOO_LARGE')
  return wav
}

export async function synthesizeValidated(text: string, config: GeminiTtsConfig, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<{ text: string; pcm: Buffer }> {
  // Existing deterministic guard + bounded complete text. This is not a full
  // semantic/factual validator. A rejected turn closes the relay rather than
  // silently replacing speech and leaving Gemini's history divergent.
  if (!text.trim() || text.length > 200 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) || !screenAiUtterance(text).allowed) throw new Error('OUTPUT_REJECTED')
  signal.throwIfAborted()
  const model = config.model?.trim() || DEFAULT_GEMINI_TTS_MODEL
  const voice = config.voice?.trim() || DEFAULT_GEMINI_TTS_VOICE
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(15000)])
  const request = fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text, speech_metadata: { style: '따뜻하고 차분하며 또렷한 한국어 말투' } }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        responseFormat: { audio: { mimeType: 'AUDIO_WAV', sampleRate: 24000 } },
        speechConfig: { voiceConfig: { voice }, languageCode: 'ko-KR' },
      },
    }),
    signal: requestSignal,
  }).then(response => {
    if (requestSignal.aborted) {
      void response.body?.cancel().catch(() => {})
      requestSignal.throwIfAborted()
    }
    return response
  })
  const response = await untilAborted(request, requestSignal)
  if (!response.ok) {
    void response.body?.cancel().catch(() => {})
    throw new Error(response.status === 429 ? 'GEMINI_TTS_RATE_LIMIT' : response.status >= 500 ? 'GEMINI_TTS_UNAVAILABLE' : 'GEMINI_TTS_FAILED')
  }
  const body = await readBoundedBody(response, requestSignal)
  requestSignal.throwIfAborted()
  return { text, pcm: wavToPcm24k(audioFromResponse(body)) }
}
