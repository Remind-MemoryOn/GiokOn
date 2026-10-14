import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({ upload: vi.fn(async (_path: string, _bytes: Uint8Array, _options: unknown) => ({ error: null })) }));
vi.mock('@giokon/data', () => ({
  getGiokonClient: () => ({ storage: { from: () => ({ upload: storage.upload }) } }),
  removeStorageObject: vi.fn(),
}));
import { saveElderPhoto } from './elder-photo';

beforeEach(() => vi.clearAllMocks());

describe('profile photo upload bytes', () => {
  it.each([
    ['TWFu', [77, 97, 110]],
    ['TWE=', [77, 97]],
    ['TQ==', [77]],
    ['TWFuTQ==', [77, 97, 110, 77]],
  ])('keeps every byte with any base64 padding: %s', async (base64, expected) => {
    await saveElderPhoto('profile', { uri: 'file:///photo.jpg', base64: base64 as string });
    const bytes = storage.upload.mock.calls[0][1] as Uint8Array;
    expect([...bytes]).toEqual(expected);
  });

  it.each([
    ['PNG', '../../assets/icon.png', 'png'],
    ['JPEG', '../../assets/figma/어르신 등록 .jpg', 'jpg'],
  ])('uploads a real %s without losing its ending bytes', async (_format, fixture, extension) => {
    const original = readFileSync(new URL(fixture, import.meta.url));
    await saveElderPhoto('profile', { uri: `file:///photo.${extension}`, base64: original.toString('base64') });
    const bytes = storage.upload.mock.calls[0][1] as Uint8Array;
    expect(Buffer.from(bytes).equals(original)).toBe(true);
    expect(Buffer.from(bytes.subarray(-12))).toEqual(original.subarray(-12));
  });
});
