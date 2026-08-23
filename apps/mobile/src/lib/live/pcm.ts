// Gemini Live API 음성 유틸 — base64 PCM 청크 결합 + WAV 래핑.
//
// Live API 네이티브 오디오 출력은 **raw PCM(L16, 24kHz, mono)** 이 base64 로
// 스트리밍된다. RN 재생기(expo-av)가 바로 먹는 건 파일/URI 라서, 한 턴이 끝나면
// 청크를 이어 붙여 WAV 헤더를 씌워 임시 파일로 넘긴다(턴 단위 재생 — 우리 대화는
// barge-in 을 허용하지 않으므로 턴 완료 후 재생으로 충분하다).

/** 24kHz · 16bit · mono — Live API 네이티브 오디오 출력 포맷. */
export const LIVE_SAMPLE_RATE = 24000;

export function base64ToBytes(b64: string): Uint8Array {
  const raw = globalThis.atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return globalThis.btoa(bin);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** PCM 데이터에 RIFF/WAVE 헤더를 붙인 bytes. */
export function wrapWav(pcm: Uint8Array, sampleRate = LIVE_SAMPLE_RATE): Uint8Array {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  writeAscii(v, 0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  writeAscii(v, 8, 'WAVE');
  writeAscii(v, 12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate = rate × block
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  writeAscii(v, 36, 'data');
  v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}
