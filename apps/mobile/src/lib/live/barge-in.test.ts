import { expect, it } from 'vitest';
import { BargeInBuffer } from './barge-in';

const frame = (value: number) => Buffer.alloc(640, value).toString('base64');
it('keeps pre-roll, requires sustained post-AEC speech, and triggers only once', () => {
  const b = new BargeInBuffer();
  for (let i=0;i<30;i++) expect(b.push(frame(0), 0)).toBe(false);
  for (let i=0;i<9;i++) expect(b.push(frame(1), .03)).toBe(false);
  expect(b.push(frame(1), .03)).toBe(true);
  expect(b.push(frame(1), .03)).toBe(false);
  expect(b.drain().length).toBeGreaterThanOrEqual(11);
  expect(b.drain()).toEqual([]);
});
it('does not accumulate isolated spikes and refuses to truncate an interrupted answer', () => {
  const b = new BargeInBuffer();
  for (let i=0;i<30;i++) { expect(b.push(frame(1), .03)).toBe(false); b.push(frame(0),0); }
  for (let i=0;i<10;i++) b.push(frame(1), .03);
  expect(() => { for (let i=0;i<110;i++) b.push(frame(1), .03); }).toThrow('BARGE_BUFFER_LIMIT');
});
