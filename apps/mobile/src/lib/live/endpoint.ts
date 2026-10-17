import { base64ToBytes } from './pcm';

// Post-AEC RMS floor. Field tuning still requires quiet-room/echo verification.
export const SPEECH_RMS_FLOOR = 0.004;

/** Initial field-tuning values, not a speech recognizer or a clinical measure. */
export class InputEndpoint {
  private lastActivity: number;
  private heardAudio = false;
  constructor(private startedAt: number) { this.lastActivity = startedAt; }
  transcript(now: number): void { this.lastActivity = now; }
  audio(now: number, level: number): void {
    // Conservative floor: ongoing noise may delay completion, never extend the cap.
    if (level >= SPEECH_RMS_FLOOR) { this.lastActivity = now; this.heardAudio = true; }
  }
  check(now: number, text: string): 'complete' | 'no_input' | 'limit' | null {
    if (now - this.startedAt >= 60000) return 'limit';
    // 수동 VAD에서는 전사가 activityEnd 뒤에 올 수 있다. 전사 없이도 발화 경계를 닫는다.
    if (!text.trim()) return this.heardAudio
      ? now - this.lastActivity >= 1000 ? 'complete' : null
      : now - this.lastActivity >= 20000 ? 'no_input' : null;
    return now - this.lastActivity >= 1000 ? 'complete' : null;
  }
}

export function pcmLevel(base64: string): number {
  const bytes = base64ToBytes(base64);
  if (!bytes.length || bytes.length % 2) throw new Error('INVALID_PCM');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    const value = view.getInt16(i, true) / 32768;
    sum += value * value;
  }
  return Math.sqrt(sum / (bytes.length / 2));
}
