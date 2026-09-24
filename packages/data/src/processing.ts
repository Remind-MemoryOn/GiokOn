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

/** 감독 화면의 원격 제어 상태(파일럿 M5) — 중계가 쓰는 것과 같은 서버 판정(`session_tick`)을 읽는다. */
export type SessionControlState = 'running' | 'paused' | 'ended' | 'denied'

/** 원격 일시정지 중 재개·종료를 감지하는 폴에 쓴다. 조회 실패는 예외 — 상태를 추측하지 않는다. */
export async function getSessionControl(sessionId: string): Promise<SessionControlState> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 5000)
  try {
    const { data, error } = await getGiokonClient().rpc('session_tick', { p_session_id: sessionId }).abortSignal(abort.signal)
    if (error || !data || typeof data !== 'object') throw new Error('대화 진행 상태를 확인하지 못했어요.')
    if (data.allowed !== true) return 'denied'
    if (data.end_requested === true) return 'ended'
    return data.paused === true ? 'paused' : 'running'
  } finally { clearTimeout(timer) }
}
