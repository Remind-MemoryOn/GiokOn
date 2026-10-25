import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { screenAiUtterance } from '@giokon/core'
import { expect, it, vi } from 'vitest'

// Mutation remains in memory: product source and its deployed behavior are untouched.
it('the no-network output safety assertion detects removal of the output screening guard', async () => {
  const source = readFileSync(new URL('./output.ts', import.meta.url), 'utf8')
  const guard = ' || !screenAiUtterance(text).allowed'
  expect(source.split(guard)).toHaveLength(3)
  const load = (input: string) => {
    const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
    runInNewContext(ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports, Buffer, AbortSignal, TextDecoder, setTimeout, clearTimeout,
      require: (name: string) => {
        if (name === '@giokon/core') return { screenAiUtterance }
        throw new Error(`Unexpected dependency: ${name}`)
      },
    })
    return exports
  }
  const assertGuard = async (api: ReturnType<typeof load>, streaming: boolean) => {
    const network = vi.fn(async () => { throw new Error('NETWORK_REACHED') })
    const chunks = vi.fn(async () => {})
    const pending = streaming
      ? api.synthesizeValidatedStream('바보', { apiKey: 'synthetic' }, new AbortController().signal, chunks, network)
      : api.synthesizeValidated('바보', { apiKey: 'synthetic' }, new AbortController().signal, network)
    await expect(pending).rejects.toThrow('OUTPUT_REJECTED')
    expect(network).not.toHaveBeenCalled()
    expect(chunks).not.toHaveBeenCalled()
  }
  const original = load(source)
  for (const streaming of [false, true]) {
    // Each variant removes one API's guard, preserving the other API's guard.
    const position = streaming ? source.lastIndexOf(guard) : source.indexOf(guard)
    const mutant = load(source.slice(0, position) + source.slice(position + guard.length))
    await assertGuard(original, streaming)
    await expect(assertGuard(mutant, streaming)).rejects.toThrow()
  }
})
