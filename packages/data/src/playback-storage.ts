import { parseVoicePlaybackObservation, snapshotVoicePlayback, type ConversationTurn, type VoicePlaybackObservation } from '@giokon/core'
import { getGiokonClient } from './client'

/** Requires the functional playback storage RPC; never silently discard observations. */
export async function persistPlaybackObservations(
  turns: readonly ConversationTurn[], observations: Readonly<Record<string,VoicePlaybackObservation>>,
  sessionId: string, assertCurrent: () => void,
): Promise<void> {
  assertCurrent()
  const snapshot=snapshotVoicePlayback(turns,observations)
  const rows=turns.flatMap((turn,index)=>snapshot[turn.id] ? [{turnIndex:index+1,...snapshot[turn.id]}] : [])
  if (!rows.length) return
  if (!sessionId || rows.length > 120) throw new Error('INVALID_PLAYBACK_BATCH')
  const abort=new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const request=getGiokonClient().rpc('save_voice_playback_v1',{p_session_id:sessionId,p_observations:rows}).abortSignal(abort.signal)
    const {data,error}=await Promise.race([request,new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{abort.abort();reject(new Error('PLAYBACK_SAVE_TIMEOUT'))},5000)
    })])
    assertCurrent()
    if (error?.code === 'PGRST202' || error?.code === '42883') throw new Error('PLAYBACK_STORAGE_REQUIRED')
    if (error || data !== rows.length) throw new Error('PLAYBACK_SAVE_FAILED')
  } finally {if(timer!==undefined)clearTimeout(timer)}
}

/** Legacy NULL is unknown. Malformed persisted claims must not become completion. */
export function readPlaybackObservations(rows: readonly {
  id:string; role:string; content:string; playback_observation?:unknown;
}[]): Record<string,VoicePlaybackObservation> {
  const seen=new Set<string>()
  const entries: [string,VoicePlaybackObservation][]=[]
  for(const row of rows) {
    if(!row.id || seen.has(row.id)) throw new Error('INVALID_PLAYBACK_IDENTITY')
    seen.add(row.id)
    if(row.playback_observation == null) continue
    if(row.role !== 'ai') throw new Error('INVALID_PLAYBACK_IDENTITY')
    entries.push([row.id,parseVoicePlaybackObservation(row.playback_observation,row.content)])
  }
  return Object.fromEntries(entries)
}
