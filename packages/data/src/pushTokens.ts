import { getGiokonClient } from './client'

/** 파일럿 D7 — 이 기기의 Expo 푸시 토큰을 호출자 것으로 등록한다(기기 인계 시 주인이 옮겨 간다). */
export async function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 5000)
  try {
    const { error } = await getGiokonClient().rpc('register_push_token', { p_token: token, p_platform: platform }).abortSignal(abort.signal)
    if (error) throw new Error('알림 등록을 완료하지 못했어요.')
  } finally { clearTimeout(timer) }
}

/** 로그아웃 전에 부른다 — 이 기기로 더 이상 알림이 오지 않게. 본인 토큰이 아니면 서버가 무시한다. */
export async function revokePushToken(token: string): Promise<void> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 5000)
  try {
    const { error } = await getGiokonClient().rpc('revoke_push_token', { p_token: token }).abortSignal(abort.signal)
    if (error) throw new Error('알림 해제를 완료하지 못했어요.')
  } finally { clearTimeout(timer) }
}
