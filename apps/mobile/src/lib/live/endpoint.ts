import { base64ToBytes } from './pcm';

/** Initial field-tuning values, not a speech recognizer or a clinical measure. */
export class InputEndpoint {
  private lastActivity: number;
  constructor(private startedAt: number) { this.lastActivity = startedAt; }
  transcript(now: number): void { this.lastActivity = now; }
  audio(now: number, level: number): void {
    // Conservative floor: ongoing noise may delay completion, never extend the cap.
    if (level >= 0.015) this.lastActivity = now;
  }
  check(now: number, text: string): 'complete' | 'no_input' | 'limit' | null {
    if (now - this.startedAt >= 60000) return 'limit';
    if (!text.trim()) return now - this.lastActivity >= 20000 ? 'no_input' : null;
    const short = text.replace(/[\s\p{P}]/gu, '').length <= 3;
    return now - this.lastActivity >= (short ? 6000 : 3500) ? 'complete' : null;
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
