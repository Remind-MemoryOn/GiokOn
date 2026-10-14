import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeleteProfile } from './profiles'

const runtime = vi.hoisted(() => ({
  finalJournals: [] as { id: string }[],
  inspectError: null as null | { message: string },
  deleteError: null as null | { message: string },
  events: [] as string[],
  purge: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
  useMutation: (options: { mutationFn: (id: string) => Promise<string> }) => ({ mutateAsync: options.mutationFn }),
}))
vi.mock('../client', () => ({
  getGiokonClient: () => ({ from: (table: string) => {
    const filters = new Map<string, string>()
    const builder = {
      select: () => builder,
      eq: (key: string, value: string) => { filters.set(key, value); return builder },
      limit: async () => {
        runtime.events.push('inspect')
        expect(table).toBe('program_journals')
        expect(filters.get('profile_id')).toBe('elder-a')
        expect(filters.get('status')).toBe('final')
        return { data: runtime.finalJournals, error: runtime.inspectError }
      },
      delete: () => builder,
      maybeSingle: async () => {
        runtime.events.push('delete')
        return { data: { id: 'elder-a' }, error: runtime.deleteError }
      },
    }
    return builder
  } }),
}))
vi.mock('../storage', () => ({ purgeElderFiles: runtime.purge }))

beforeEach(() => {
  runtime.finalJournals = []
  runtime.inspectError = null
  runtime.deleteError = null
  runtime.events = []
  runtime.purge.mockReset().mockImplementation(async () => { runtime.events.push('purge') })
})

describe('useDeleteProfile', () => {
  it('preserves all files when an official journal prevents profile deletion', async () => {
    runtime.finalJournals = [{ id: 'final-journal' }]
    await expect(useDeleteProfile().mutateAsync('elder-a')).rejects.toThrow('확정된 프로그램 일지가 있어 삭제할 수 없어요. 기록 파기는 운영자에게 요청해 주세요.')
    expect(runtime.events).toEqual(['inspect'])
  })

  it('does not start destructive cleanup if the final journal check fails', async () => {
    runtime.inspectError = { message: 'network failed' }
    await expect(useDeleteProfile().mutateAsync('elder-a')).rejects.toThrow('확정 일지 여부를 확인하지 못했어요.')
    expect(runtime.events).toEqual(['inspect'])
  })

  it('checks official records before purging files, then deletes the draft-only profile', async () => {
    expect(await useDeleteProfile().mutateAsync('elder-a')).toBe('elder-a')
    expect(runtime.events).toEqual(['inspect', 'purge', 'delete'])
  })

  it('explains the DB guard when a journal becomes final after preflight', async () => {
    runtime.deleteError = { message: 'JOURNAL_FINAL_DELETE_FORBIDDEN' }
    await expect(useDeleteProfile().mutateAsync('elder-a')).rejects.toThrow('기록 파기는 운영자에게 요청해 주세요.')
  })
})
