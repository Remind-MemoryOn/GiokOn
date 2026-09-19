import { afterEach, expect, it, vi } from 'vitest'
import { persistConversationTurns } from './transcript-storage'
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upsert: vi.fn() }))
vi.mock('./client', () => ({ getGiokonClient: () => ({ rpc: mocks.rpc,
  from: () => ({ upsert: mocks.upsert }) }) }))
const owner = { sessionId: 's', profileId: 'p', userId: 'u' }
const turn = { id: 't', speaker: 'Elderly' as const, timestamp: '', text: '원문',
  provenance: { kind: 'automatic' as const, presentedText: '원문', inputSource: 'gemini_live' as const } }
function capability(data: unknown, error: unknown = null) {
  mocks.rpc.mockReturnValue({ abortSignal: async () => ({ data, error }) })
  mocks.upsert.mockResolvedValue({ error: null })
}
afterEach(() => vi.resetAllMocks())
it('writes source metadata after negotiating v1', async () => {
  capability(1)
  await persistConversationTurns([turn], 0, owner, () => {})
  expect(mocks.upsert.mock.calls[0][0][0].transcript_provenance).toEqual({version:1,...turn.provenance})
})
it('uses the same bulk-insert columns for AI and elder rows', async () => {
  capability(1)
  await persistConversationTurns([{id:'ai',speaker:'AI',text:'질문',timestamp:''},turn],0,owner,()=>{})
  const rows=mocks.upsert.mock.calls[0][0]
  expect(Object.keys(rows[0]).sort()).toEqual(Object.keys(rows[1]).sort())
  expect(rows[0].transcript_provenance).toBeNull()
})
it.each(['PGRST202', '42883'])('keeps manual legacy writes compatible, rejects automatic writes: %s', async code => {
  capability(null, { code })
  await expect(persistConversationTurns([turn],0,owner,()=>{})).rejects.toThrow('TRANSCRIPT_PROVENANCE_STORAGE_REQUIRED')
  expect(mocks.upsert).not.toHaveBeenCalled()
  await persistConversationTurns([{...turn,provenance:{kind:'caregiver_confirmed',presentedText:'원문'}}],0,owner,()=>{})
  expect(mocks.upsert.mock.calls[0][0][0]).not.toHaveProperty('transcript_provenance')
})
it.each([null, 2, '1'])('does not interpret an unexpected capability as legacy success: %s', async value => {
  capability(value)
  await expect(persistConversationTurns([turn],0,owner,()=>{})).rejects.toThrow()
  expect(mocks.upsert).not.toHaveBeenCalled()
})
it('does not write after the account changes while capability is pending', async () => {
  capability(1); let checks=0
  await expect(persistConversationTurns([turn],0,owner,()=>{ if (++checks>1) throw new Error('stale') })).rejects.toThrow('stale')
  expect(mocks.upsert).not.toHaveBeenCalled()
})
it('does not hide storage rejection as successful persistence', async () => {
  capability(1); mocks.upsert.mockResolvedValue({error:{message:'rejected'}})
  await expect(persistConversationTurns([turn],0,owner,()=>{})).rejects.toThrow()
})
