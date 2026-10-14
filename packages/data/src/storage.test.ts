import { beforeEach, describe, expect, it, vi } from 'vitest'
import { purgeBucketFolder } from './storage'

const storage = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn() }))
vi.mock('./client', () => ({ getGiokonClient: () => ({ storage: { from: () => storage } }) }))

beforeEach(() => vi.resetAllMocks())

describe('purgeBucketFolder', () => {
  it.each([3, 100])('stops when deletion is denied without an API error (%i files)', async count => {
    storage.list.mockResolvedValueOnce({ data: Array.from({ length: count }, (_, i) => ({ name: `${i}.jpg` })), error: null })
      .mockRejectedValue(new Error('Unexpected repeated listing'))
    // Storage RLS can return an empty successful response for protected objects.
    storage.remove.mockResolvedValue({ data: [], error: null })
    await expect(purgeBucketFolder('journal-photos', 'elder-a')).rejects.toThrow('삭제할 수 없는 사진이 있어 파기를 중단했어요.')
  })

  it('keeps listing after a partial removal until every listed file is deleted', async () => {
    const remaining = new Set(['one.jpg', 'two.jpg', 'three.jpg'])
    storage.list.mockImplementation(async () => ({ data: [...remaining].map(name => ({ name })), error: null }))
    storage.remove.mockImplementation(async (paths: string[]) => {
      const name = paths[0]!.split('/')[1]!
      remaining.delete(name)
      return { data: [{ name }], error: null }
    })
    expect(await purgeBucketFolder('journal-photos', 'elder-a')).toBe(3)
    expect(remaining.size).toBe(0)
  })

  it('deletes multiple pages without skipping files and reports actual deleted rows', async () => {
    const remaining = new Set(Array.from({ length: 205 }, (_, i) => `${i}.jpg`))
    storage.list.mockImplementation(async (_folder: string, options: { limit: number }) => ({
      data: [...remaining].slice(0, options.limit).map(name => ({ name })), error: null,
    }))
    storage.remove.mockImplementation(async (paths: string[]) => ({
      data: paths.map(path => {
        const name = path.split('/')[1]!
        remaining.delete(name)
        return { name }
      }), error: null,
    }))
    expect(await purgeBucketFolder('journal-photos', 'elder-a')).toBe(205)
    expect(remaining.size).toBe(0)
  })
})
