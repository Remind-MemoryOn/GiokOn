import { afterEach, expect, it, vi } from 'vitest'
import { persistPlaybackObservations, readPlaybackObservations } from './playback-storage'
const mock=vi.hoisted(()=>({rpc:vi.fn()}))
vi.mock('./client',()=>({getGiokonClient:()=>({rpc:mock.rpc})}))
const turns=[{id:'local',speaker:'AI' as const,text:'질문',timestamp:''}]
const observation={text:'질문',result:'completed' as const,observedAt:'2026-09-21T00:00:00.000Z'}
afterEach(()=>{vi.useRealTimers();vi.resetAllMocks()})
function response(data:unknown,error:unknown=null) { mock.rpc.mockReturnValue({abortSignal:async()=>({data,error})}) }
it('stores a batch by session and stable turn index rather than local runtime IDs',async()=>{
  response(1)
  await persistPlaybackObservations(turns,{local:observation},'session',()=>{})
  expect(mock.rpc.mock.calls[0]).toEqual(['save_voice_playback_v1',{p_session_id:'session',p_observations:[{turnIndex:1,...observation}]}])
})
it.each([{code:'PGRST202'},{code:'42883'},{code:'42501'}])('does not turn missing storage or rejection into success: %j',async error=>{
  response(null,error)
  await expect(persistPlaybackObservations(turns,{local:observation},'session',()=>{})).rejects.toThrow()
})
it.each([null,0,2])('requires an acknowledgement of every observation: %s',async value=>{
  response(value)
  await expect(persistPlaybackObservations(turns,{local:observation},'session',()=>{})).rejects.toThrow('PLAYBACK_SAVE_FAILED')
})
it('rejects malformed association before any network call',async()=>{
  await expect(persistPlaybackObservations(turns,{other:observation},'session',()=>{})).rejects.toThrow()
  expect(mock.rpc).not.toHaveBeenCalled()
})
it('does not report success after an auth boundary changes during the request',async()=>{
  response(1);let calls=0
  await expect(persistPlaybackObservations(turns,{local:observation},'session',()=>{if(++calls===2)throw new Error('stale')})).rejects.toThrow('stale')
})
it('keeps absent observations absent without requiring a new API',async()=>{
  await persistPlaybackObservations(turns,{},'session',()=>{})
  expect(mock.rpc).not.toHaveBeenCalled()
  expect(readPlaybackObservations([{id:'db',role:'ai',content:'질문'}])).toEqual({})
})
it('restores validated observations under DB row IDs and rejects a mismatched row',()=>{
  expect(readPlaybackObservations([{id:'db',role:'ai',content:'질문',playback_observation:observation}])).toEqual({db:observation})
  expect(()=>readPlaybackObservations([{id:'db',role:'ai',content:'다른 질문',playback_observation:observation}])).toThrow()
  expect(()=>readPlaybackObservations([{id:'db',role:'user',content:'질문',playback_observation:observation}])).toThrow()
})

it('bounds an RPC that ignores cancellation without automatically retrying',async()=>{
  vi.useFakeTimers()
  let signal!:AbortSignal
  let resolve!:(value:unknown)=>void
  mock.rpc.mockReturnValue({abortSignal:(value:AbortSignal)=>{signal=value;return new Promise(done=>{resolve=done})}})
  const saving=persistPlaybackObservations(turns,{local:observation},'session',()=>{})
  const failed=expect(saving).rejects.toThrow('PLAYBACK_SAVE_TIMEOUT')
  await vi.advanceTimersByTimeAsync(5000);await failed
  expect(signal.aborted).toBe(true);expect(mock.rpc).toHaveBeenCalledOnce()
  resolve({data:1,error:null});await vi.advanceTimersByTimeAsync(1)
})
it('captures an immutable payload before waiting for the server',async()=>{
  let resolve!:(value:unknown)=>void
  mock.rpc.mockReturnValue({abortSignal:()=>new Promise(done=>{resolve=done})})
  const mutable={...observation}
  const saving=persistPlaybackObservations(turns,{local:mutable},'session',()=>{})
  mutable.text='다른 질문'
  expect(mock.rpc.mock.calls[0][1].p_observations[0].text).toBe('질문')
  resolve({data:1,error:null});await saving
})
it('rejects duplicate database identities rather than overwriting an observation',()=>{
  const row={id:'db',role:'ai',content:'질문',playback_observation:observation}
  expect(()=>readPlaybackObservations([row,row])).toThrow('INVALID_PLAYBACK_IDENTITY')
})
