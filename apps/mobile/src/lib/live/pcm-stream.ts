import { base64ToBytes } from './pcm';

/** Single consumer, bounded PCM queue. An empty queue is never an end marker. */
export class PcmAudioStream implements AsyncIterableIterator<string> {
  private chunks: string[] = [];
  private bytes = 0;
  private ended = false;
  private error: Error | null = null;
  private waiting: {resolve(value: IteratorResult<string>): void; reject(error: Error): void} | null = null;
  constructor(private readonly maximumBytes = 4320000) {}
  [Symbol.asyncIterator](): AsyncIterableIterator<string> { return this; }
  push(data: string): void {
    if (this.ended || this.error) throw new Error('AUDIO_STREAM_CLOSED');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new Error('INVALID_PLAYBACK_PCM');
    const size = base64ToBytes(data).length;
    if (!size || size % 2 || this.bytes + size > this.maximumBytes) throw new Error('INVALID_PLAYBACK_PCM');
    this.bytes += size;
    const waiting = this.waiting; this.waiting = null;
    if (waiting) waiting.resolve({done:false,value:data}); else this.chunks.push(data);
  }
  next(): Promise<IteratorResult<string>> {
    if (this.error) return Promise.reject(this.error);
    const chunk = this.chunks.shift();
    if (chunk !== undefined) return Promise.resolve({done:false,value:chunk});
    if (this.ended) return Promise.resolve({done:true,value:undefined});
    if (this.waiting) return Promise.reject(new Error('AUDIO_STREAM_CONCURRENT_READ'));
    return new Promise((resolve, reject) => { this.waiting = {resolve,reject}; });
  }
  end(): void {
    this.ended = true;
    this.waiting?.resolve({done:true,value:undefined}); this.waiting = null;
  }
  cancel(): void { this.chunks = []; this.end(); }
  fail(error: Error): void {
    this.error = error; this.chunks = [];
    this.waiting?.reject(error); this.waiting = null;
  }
}
