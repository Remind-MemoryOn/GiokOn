import { expect, it } from 'vitest';
import { PcmAudioStream } from './pcm-stream';

it('rejects concurrent consumer reads without replacing the first pending reader', async () => {
  const stream = new PcmAudioStream();
  const first = stream.next();
  await expect(stream.next()).rejects.toThrow('AUDIO_STREAM_CONCURRENT_READ');
  stream.push('AQACAA==');
  expect(await first).toEqual({ done: false, value: 'AQACAA==' });
  stream.end();
  expect(() => stream.push('AQACAA==')).toThrow('AUDIO_STREAM_CLOSED');
  expect(await stream.next()).toEqual({ done: true, value: undefined });
});

it('fails a buffered stream without allowing the buffered audio to escape', async () => {
  const stream = new PcmAudioStream();
  stream.push('AQACAA==');
  stream.fail(new Error('provider failed'));
  await expect(stream.next()).rejects.toThrow('provider failed');
  expect(() => stream.push('AQACAA==')).toThrow('AUDIO_STREAM_CLOSED');
});
