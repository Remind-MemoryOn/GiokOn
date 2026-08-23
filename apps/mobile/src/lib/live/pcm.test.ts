import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, wrapWav } from './pcm'

// Node 18+ 전역 atob/btoa 사용(Hermes도 지원) — 테스트 환경 동일.

describe('base64 ↔ bytes', () => {
  it('왕복 변환이 손실 없이 일치한다', () => {
    const src = new Uint8Array([0, 1, 2, 250, 251, 255, 127, 128])
    const b64 = bytesToBase64(src)
    const back = base64ToBytes(b64)
    expect(Array.from(back)).toEqual(Array.from(src))
  })

  it('빈 입력도 안전하다', () => {
    expect(base64ToBytes(bytesToBase64(new Uint8Array(0)))).toEqual(new Uint8Array(0))
  })
})

describe('wrapWav — RIFF/WAVE 헤더', () => {
  it('44바이트 헤더 + PCM 길이의 WAV를 만든다', () => {
    const pcm = new Uint8Array(1000)
    const wav = wrapWav(pcm)
    expect(wav.length).toBe(44 + 1000)
    const ascii = (o: number, n: number) =>
      String.fromCharCode(...wav.subarray(o, o + n))
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    expect(ascii(36, 4)).toBe('data')
  })

  it('헤더 필드가 24kHz mono 16bit 규격과 일치한다', () => {
    const pcm = new Uint8Array(4800) // 0.1초분
    const wav = wrapWav(pcm)
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
    expect(view.getUint32(4, true)).toBe(36 + 4800) // RIFF chunk size
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(24000) // sample rate
    expect(view.getUint32(28, true)).toBe(48000) // byte rate
    expect(view.getUint16(34, true)).toBe(16) // bits per sample
    expect(view.getUint32(40, true)).toBe(4800) // data size
  })
})
