import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { URL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const source = new URL('./keyboard-layout.ts', import.meta.url);
const api: {
  inputScrollOffset?: (scrollY: number, viewportY: number, viewportHeight: number, inputY: number, inputHeight: number, extraBottom?: number) => number;
  loginCanvasHeight?: (height: number) => number;
} = {};
if (existsSync(source)) runInNewContext(ts.transpileModule(readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: api });

describe('keyboard viewport geometry', () => {
  it.each([
    [0, 100, 400, 200, 44, 0], // already visible; header does not change scroll.
    [10, 100, 300, 390, 44, 60], // only the 50px obscured part, not keyboard height.
    [100, 100, 300, 60, 44, 44], // previous input above viewport.
    [0, 100, 300, 60, 44, 0], // never overscroll above content.
    [0, 100, 0, 390, 44, 0], // wait until a real layout is available.
    [0, 100, 70, 140, 44, 30], // short landscape viewport still reveals field.
    [0, 100, 90, 120, 160, 20], // tall multiline input: reveal its top, internal caret scrolls.
  ])('measured overlap %#', (offset, y, height, inputY, inputH, expected) => {
    expect(api.inputScrollOffset?.(offset, y, height, inputY, inputH)).toBe(expected);
  });
  it('does not subtract the keyboard a second time from an already resized Android viewport', () => {
    expect(api.inputScrollOffset?.(0, 90, 220, 200, 44)).toBe(0);
  });
  it('allows space below a region field while capping it to the usable viewport', () => {
    expect(api.inputScrollOffset?.(0, 100, 400, 420, 30, 126)).toBe(50);
    expect(api.inputScrollOffset?.(0, 100, 200, 240, 30, 126)).toBe(20);
  });
  it('keeps fixed-height login fields apart in short or keyboard-resized windows', () => {
    for (const height of [260, 393, 528, 600, 800, 852]) {
      const canvas = api.loginCanvasHeight?.(height);
      expect(canvas).toBe(Math.max(600, height));
      expect((355 - 284) / 852 * (canvas ?? 0)).toBeGreaterThanOrEqual(44);
    }
  });
});
