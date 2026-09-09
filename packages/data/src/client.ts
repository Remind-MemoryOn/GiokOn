// @giokon/data — supabase-js 클라이언트 팩토리 (웹·모바일 공유)
//
// 키 체계: Supabase publishable/secret. 클라이언트는 publishable 키만 사용한다
// (레거시 anon 키 대체). secret 키는 Edge Function secrets에만 둔다.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { logoutStorage } from './logout-storage'

export type GiokonClient = SupabaseClient<Database>

/**
 * 플랫폼별 세션 영속 저장소.
 * - web: window.localStorage (그대로 호환)
 * - mobile(Expo): expo-secure-store / AsyncStorage 어댑터
 * 미지정 시 supabase-js 기본값(web=localStorage, 그 외=메모리)을 사용한다.
 */
export interface GiokonAuthStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface GiokonClientConfig {
  /** `https://<project-ref>.supabase.co` */
  url: string
  /** Supabase publishable 키 (레거시 anon 키 대체). */
  publishableKey: string
  /** 플랫폼별 세션 저장소. */
  storage?: GiokonAuthStorage
  /**
   * URL 해시에서 OAuth/매직링크 세션을 감지할지 여부.
   * web=true(기본), mobile(딥링크 직접 처리)=false 권장.
   */
  detectSessionInUrl?: boolean
  /**
   * OAuth 플로우. 모바일(웹브라우저 인증 후 딥링크 복귀)은 **'pkce'** 필수 —
   * 콜백 URL 의 code 를 exchangeCodeForSession 으로 교환한다.
   * web 기본값도 pkce(Supabase 권장)로 통일한다.
   */
  flowType?: 'implicit' | 'pkce'
}

/** 새 Supabase 클라이언트를 만든다. 앱 진입점에서 한 번 호출한다. */
export function createGiokonClient(config: GiokonClientConfig): GiokonClient {
  const memory = new Map<string, string>()
  const fallback: GiokonAuthStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, value) },
    removeItem: key => { memory.delete(key) },
  }
  let browserStorage: GiokonAuthStorage | undefined
  try { if (typeof localStorage !== 'undefined') browserStorage = localStorage } catch { /* memory fallback */ }
  const storageKey = `sb-${new URL(config.url).hostname.split('.')[0]}-auth-token`
  const gate = logoutStorage(config.storage ?? browserStorage ?? fallback, storageKey)
  const client = createClient<Database>(config.url, config.publishableKey, {
    auth: {
      storage: gate.storage,
      storageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: config.detectSessionInUrl ?? true,
      flowType: config.flowType ?? 'pkce',
    },
  })
  let accessToken: string | null = null
  let localLogout = false
  let pending: Promise<void> | null = null
  client.auth.onAuthStateChange((_event, session) => {
    if (!localLogout || !session) accessToken = session?.access_token ?? null
  })
  logoutControls.set(client, {
    blocked: () => localLogout,
    wait: () => pending?.catch(() => {}) ?? Promise.resolve(),
    signOut: () => {
      if (pending) return pending
      const token = accessToken
      localLogout = true
      pending = (async () => {
        try {
          await gate.clear()
          // With the local storage empty, the public SDK API removes its runtime
          // session and emits SIGNED_OUT without requiring an HTTP request.
          const { error } = await client.auth.signOut({ scope: 'local' })
          if (error) throw error
        } finally {
          localLogout = false
          gate.resume()
        }
        if (token) {
          // Preserve global revocation semantics, but failure cannot restore local auth.
          const { error } = await client.auth.admin.signOut(token, 'global')
          if (error) throw error
        }
      })().finally(() => { pending = null })
      return pending
    },
  })
  return client
}

const logoutControls = new WeakMap<GiokonClient, {
  blocked: () => boolean
  wait: () => Promise<void>
  signOut: () => Promise<void>
}>()

export function isLocalLogoutPending(): boolean {
  return logoutControls.get(getGiokonClient())?.blocked() ?? false
}

export async function waitForSignOut(): Promise<void> {
  await logoutControls.get(getGiokonClient())?.wait()
}

export async function signOutGiokonClient(): Promise<void> {
  const client = getGiokonClient()
  const control = logoutControls.get(client)
  if (control) return control.signOut()
  const { error } = await client.auth.signOut()
  if (error) throw error
}

// ── 모듈 레지스트리 ─────────────────────────────────────────────────────
// 훅(useProfiles 등)이 클라이언트 인자 없이 동작하도록 단일 인스턴스를 보관한다.
// 앱은 렌더 이전에 initGiokonData(client)를 한 번 호출해야 한다.

let activeClient: GiokonClient | null = null

/** 전역 데이터 레이어에 클라이언트를 등록한다. */
export function initGiokonData(client: GiokonClient): GiokonClient {
  activeClient = client
  return client
}

/** 등록된 클라이언트를 반환한다. 미초기화 시 throw. */
export function getGiokonClient(): GiokonClient {
  if (!activeClient) {
    throw new Error(
      '@giokon/data가 초기화되지 않았습니다. 앱 진입점에서 initGiokonData(createGiokonClient(...))를 먼저 호출하세요.',
    )
  }
  return activeClient
}
