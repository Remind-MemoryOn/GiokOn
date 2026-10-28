import { expect, it } from 'vitest';
import { InputEndpoint, pcmLevel } from './endpoint';
it('ends a quiet answer at three seconds rather than waiting for the empty-input timeout', () => {
  const input = new InputEndpoint(0);
  input.audio(1000, .006);
  expect(input.check(3999, '')).toBe(null);
  expect(input.check(4000, '')).toBe('complete');
});

it('ends voiced capture after a conservative pause even when transcription waits for activityEnd', () => {
  const input = new InputEndpoint(0);
  input.audio(1000, 0.1);
  expect(input.check(3999, '')).toBe(null);
  expect(input.check(4000, '')).toBe('complete');
});

it('waits through thinking time then stops an empty capture', () => {
  const input = new InputEndpoint(0);
  expect(input.check(19999, '')).toBe(null);
  expect(input.check(20000, '')).toBe('no_input');
});
it('does not mistake a transcription delay for silence while PCM is active', () => {
  const input = new InputEndpoint(0);
  input.transcript(1000);
  input.audio(4000, 0.1);
  expect(input.check(6999, '고향 이야기')).toBe(null);
  expect(input.check(7000, '고향 이야기')).toBe('complete');
});
it('accepts even a one-syllable acknowledgement after three seconds', () => {
  const input = new InputEndpoint(0);
  input.transcript(1000);
  expect(input.check(3999, '네')).toBe(null);
  expect(input.check(4000, '네')).toBe('complete');
});
it('continues when speech resumes during a thinking pause', () => {
  const input = new InputEndpoint(0);
  input.transcript(1000);
  input.audio(1800, 0.1);
  input.transcript(2000);
  expect(input.check(4999, '고향에 살았어요')).toBe(null);
  expect(input.check(5000, '고향에 살았어요')).toBe('complete');
});
it('bounds continuous noise and never labels a forced cutoff complete', () => {
  const input = new InputEndpoint(0);
  input.audio(59999, 0.2);
  expect(input.check(60000, '아직 이야기 중')).toBe('limit');
});
it('does not treat low-level noise as speech', () => {
  const input = new InputEndpoint(0);
  input.transcript(1000);
  input.audio(4400, 0.001);
  expect(input.check(4500, '고향 이야기')).toBe('complete');
});
it('decodes signed little endian PCM and rejects malformed audio', () => {
  expect(pcmLevel('AAD/fwCA')).toBeCloseTo(Math.sqrt(2 / 3), 3);
  expect(pcmLevel('AAAAAA==')).toBe(0);
  expect(() => pcmLevel('AA==')).toThrow();
  expect(() => pcmLevel('!')).toThrow();
});
