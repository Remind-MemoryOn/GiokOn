import { expect, it } from 'vitest';
import { PcmAudioStream } from './pcm-stream';

it('waits through underrun and only ends after the explicit end', async () => {
  const stream = new PcmAudioStream();
  stream.push('AQACAA==');
  expect(await stream.next()).toEqual({done:false,value:'AQACAA=='});
  let settled = false;
  const next = stream.next().then(value => { settled = true; return value; });
  await Promise.resolve(); expect(settled).toBe(false);
  stream.end(); expect(await next).toEqual({done:true,value:undefined});
});
it('cancellation releases the consumer and drops queued audio', async () => {
  const stream = new PcmAudioStream();
  stream.push('AQACAA=='); stream.cancel();
  expect(await stream.next()).toEqual({done:true,value:undefined});
});
it('errors release a waiting consumer and reject later reads', async () => {
  const stream = new PcmAudioStream();
  const pending = expect(stream.next()).rejects.toThrow('broken');
  stream.fail(new Error('broken')); await pending;
  await expect(stream.next()).rejects.toThrow('broken');
});
it('rejects invalid PCM and caps cumulative audio even after consumption', async () => {
  const stream = new PcmAudioStream(4);
  expect(() => stream.push('AQ==')).toThrow();
  stream.push('AQACAA=='); await stream.next();
  expect(() => stream.push('AQACAA==')).toThrow();
});
