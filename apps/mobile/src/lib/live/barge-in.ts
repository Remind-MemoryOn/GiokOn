import { base64ToBytes } from './pcm';
import { SPEECH_RMS_FLOOR } from './endpoint';

/** Post-AEC PCM only. Retain 800 ms of onset, then at most two seconds while playback stops. */
export class BargeInBuffer {
  private frames: { data: string; ms: number }[] = [];
  private duration = 0;
  private voiced = 0;
  triggered = false;
  push(data: string, level: number): boolean {
    const ms = base64ToBytes(data).length / 32;
    if (!ms || ms > 500) throw new Error('INVALID_CAPTURE_FRAME');
    this.frames.push({ data, ms }); this.duration += ms;
    this.voiced = level >= SPEECH_RMS_FLOOR ? this.voiced + ms : 0;
    const first = !this.triggered && this.voiced >= 120;
    this.triggered ||= first;
    if (this.triggered && this.duration > 2000) throw new Error('BARGE_BUFFER_LIMIT');
    while (!this.triggered && this.duration > 800 && this.frames.length > 1) this.duration -= this.frames.shift()!.ms;
    return first;
  }
  drain(): string[] {
    const data = this.frames.map(frame => frame.data);
    this.frames = []; this.duration = 0;
    return data;
  }
}
