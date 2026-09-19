import type { ConversationTurn } from '@giokon/core'
import { toSessionLogInsert, type SessionLogOwner } from './mappers'
import { getGiokonClient } from './client'

/** No credential-independent cache: every caller uses the current auth boundary. */
export async function getTranscriptStorageVersion(): Promise<1 | undefined> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 5000)
  try {
    const { data, error } = await getGiokonClient().rpc('transcript_storage_version').abortSignal(abort.signal)
    if (error?.code === 'PGRST202' || error?.code === '42883') return undefined
    if (error || data !== 1) throw new Error('TRANSCRIPT_STORAGE_UNAVAILABLE')
    return 1
  } finally { clearTimeout(timer) }
}

export async function persistConversationTurns(
  turns: ConversationTurn[], from: number, owner: SessionLogOwner, assertCurrent: () => void,
): Promise<void> {
  assertCurrent()
  const version = await getTranscriptStorageVersion()
  assertCurrent()
  const rows = turns.slice(from).map((_, i) => toSessionLogInsert(turns, from + i, owner, version))
  if (!rows.length) return
  const { error } = await getGiokonClient().from('session_logs').upsert(rows, { onConflict: 'session_id,turn_index' })
  assertCurrent()
  if (error) throw new Error('TRANSCRIPT_SAVE_FAILED')
}
