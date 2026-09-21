import { afterEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ get: vi.fn(), request: vi.fn() }));
vi.mock('expo-av', () => ({ Audio: { getPermissionsAsync: native.get, requestPermissionsAsync: native.request } }));
import { hasMicPermission } from './mic';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('only reads existing permission and never prompts during a turn', async () => {
  native.get.mockResolvedValueOnce({granted:true}).mockResolvedValueOnce({granted:false,canAskAgain:true});
  expect(await hasMicPermission()).toBe(true);
  expect(await hasMicPermission()).toBe(false);
  expect(native.request).not.toHaveBeenCalled();
});

it('denies a stuck permission query and consumes its late rejection', async () => {
  vi.useFakeTimers();
  let reject!:(reason:Error)=>void;
  native.get.mockImplementationOnce(() => new Promise((_,fail) => {reject=fail;}));
  const pending=hasMicPermission();
  await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toBe(false);
  reject(new Error('late native failure'));
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
  expect(native.request).not.toHaveBeenCalled();
});

it('denies native query errors and clears its deadline', async () => {
  vi.useFakeTimers();
  native.get.mockRejectedValueOnce(new Error('native failure'));
  expect(await hasMicPermission()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
