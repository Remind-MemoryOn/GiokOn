import { getGiokonClient } from './client'

/** Ask the server, including consent collected by another authorized caregiver. */
export async function canProcessProfile(profileId: string): Promise<boolean> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 5000)
  try {
    const { data, error } = await getGiokonClient().rpc('can_process_profile', { p_profile_id: profileId }).abortSignal(abort.signal)
    if (error) throw new Error('동의와 이용 권한을 확인하지 못했어요.')
    return data === true
  } finally { clearTimeout(timer) }
}

export async function canProcessSession(sessionId: string): Promise<boolean> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 5000)
  try {
    const { data, error } = await getGiokonClient().rpc('can_process_session', { p_session_id: sessionId }).abortSignal(abort.signal)
    if (error) throw new Error('대화를 계속할 수 있는지 확인하지 못했어요.')
    return data === true
  } finally { clearTimeout(timer) }
}
