// @giokon/data — Supabase Auth (요양보호사 계정)
//
// 정체성은 auth.uid(). 가입 시 DB 트리거(handle_new_user)가 public.users row를
// 부트스트랩한다 → signUp 시 name을 user_metadata로 전달한다.

import type {
  AuthChangeEvent,
  Session,
  Subscription,
  User,
} from '@supabase/supabase-js'
import { getGiokonClient } from './client'

// 화면(apps/web 등)에서 세션·사용자 타입을 쓸 수 있도록 재노출.
export type { AuthChangeEvent, Session, Subscription, User } from '@supabase/supabase-js'

export interface SignUpParams {
  email: string
  password: string
  /** 요양보호사 이름. 가입 트리거가 users.name으로 사용한다. */
  name?: string
}

/** 이메일/비밀번호 회원가입. */
export async function signUp(params: SignUpParams): Promise<{ user: User | null; session: Session | null }> {
  const { data, error } = await getGiokonClient().auth.signUp({
    email: params.email,
    password: params.password,
    options: params.name ? { data: { name: params.name } } : undefined,
  })
  if (error) throw error
  return { user: data.user, session: data.session }
}

/** 이메일/비밀번호 로그인. */
export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await getGiokonClient().auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

/** 로그아웃. */
export async function signOut(): Promise<void> {
  const { error } = await getGiokonClient().auth.signOut()
  if (error) throw error
}

/**
 * 비밀번호 재설정 메일 발송.
 * @param redirectTo 메일 링크 클릭 후 돌아올 앱 URL(재설정 화면).
 */
export async function sendPasswordReset(email: string, redirectTo?: string): Promise<void> {
  const { error } = await getGiokonClient().auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  )
  if (error) throw error
}

/** 재설정 링크 진입 후 새 비밀번호 확정. */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await getGiokonClient().auth.updateUser({ password: newPassword })
  if (error) throw error
}

/** 현재 세션(없으면 null). */
export async function getSession(): Promise<Session | null> {
  const { data, error } = await getGiokonClient().auth.getSession()
  if (error) throw error
  return data.session
}

/** 현재 사용자(없으면 null). */
export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await getGiokonClient().auth.getUser()
  if (error) return null
  return data.user
}

/** 인증 상태 변화 구독. 반환된 subscription.unsubscribe()로 해제. */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): Subscription {
  const { data } = getGiokonClient().auth.onAuthStateChange(callback)
  return data.subscription
}
