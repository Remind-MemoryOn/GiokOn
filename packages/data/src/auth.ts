// @giokon/data — Supabase Auth (소셜 로그인 + 온보딩 회원가입)
//
// 인증 개편(2026-07-16, T17.5·T17.6):
//   - 로그인 = 소셜 3종(구글·카카오·네이버). 이메일/비밀번호 로그인 제거.
//   - 구글·카카오 = Supabase 네이티브 OAuth(signInWithOAuth).
//   - 네이버 = Supabase 비네이티브 → 커스텀 Edge Function(naver-auth) 경유.
//   - 회원가입 = OAuth 최초 로그인 후 온보딩(completeOnboarding RPC)에서
//     기본정보(이름·전화·역할·기관명/초대코드)를 확정한다. 가입 트리거
//     (handle_new_user)는 최소 users row 만 만든다.
//   - 보호자↔어르신 연결 = redeemGuardianInvite RPC(온보딩·로그인 후 공용).

import type {
  AuthChangeEvent,
  Session,
  Subscription,
  User,
} from '@supabase/supabase-js'
import { getGiokonClient } from './client'
import type { ProfileGuardianRow, UserRow } from './database.types'

// 화면(apps/web 등)에서 세션·사용자 타입을 쓸 수 있도록 재노출.
export type { AuthChangeEvent, Session, Subscription, User } from '@supabase/supabase-js'

/** Supabase 네이티브로 지원되는 소셜 provider. 네이버는 커스텀(아래 참조). */
export type NativeSocialProvider = 'google' | 'kakao'

export type SocialProvider = NativeSocialProvider | 'naver'

export const SOCIAL_PROVIDERS: SocialProvider[] = ['google', 'kakao', 'naver']

/**
 * 소셜 로그인(구글·카카오 — Supabase 네이티브 OAuth).
 * 브라우저를 provider 동의 화면으로 리다이렉트한다. 완료 후 redirectTo(기본:
 * 현재 origin)로 돌아오며, detectSessionInUrl 이 세션을 복원한다.
 */
export async function signInWithProvider(
  provider: NativeSocialProvider,
  options?: { redirectTo?: string },
): Promise<void> {
  const { error } = await getGiokonClient().auth.signInWithOAuth({
    provider,
    options: options?.redirectTo ? { redirectTo: options.redirectTo } : undefined,
  })
  if (error) throw error
}

/**
 * 네이버 로그인 시작 URL. 네이버는 Supabase 네이티브 provider 가 아니므로
 * 커스텀 Edge Function(naver-auth)이 OAuth 인가·토큰 교환·사용자 매핑을
 * 담당한다(비밀키는 서버 보관). 반환 URL 로 브라우저를 이동시키면 된다.
 * @param supabaseUrl 프로젝트 URL(https://<ref>.supabase.co)
 * @param redirectTo  로그인 완료 후 돌아올 앱 URL
 */
export function buildNaverAuthUrl(supabaseUrl: string, redirectTo: string): string {
  const base = supabaseUrl.replace(/\/$/, '')
  return `${base}/functions/v1/naver-auth/authorize?redirect_to=${encodeURIComponent(redirectTo)}`
}

/** 로그아웃. */
export async function signOut(): Promise<void> {
  const { error } = await getGiokonClient().auth.signOut()
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

/**
 * 현재 사용자의 public.users row(역할·기관·온보딩 상태 포함).
 * 라우팅 판단(온보딩 게이트·역할 리다이렉트)에 사용한다. 없으면 null.
 */
export async function getCurrentUserRow(): Promise<UserRow | null> {
  const client = getGiokonClient()
  const { data: auth } = await client.auth.getUser()
  if (!auth.user) return null
  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (error) throw error
  return data
}

export interface OnboardingParams {
  name: string
  phone: string
  role: 'caregiver' | 'guardian'
  /** 요양보호사(신규 기관 생성) 필수. */
  orgName?: string
  /** 보호자 선택: 있으면 어르신 연결(pending)까지 처리. */
  inviteCode?: string
}

/**
 * 온보딩 회원가입 확정(RPC complete_onboarding).
 * 요양보호사=새 기관 생성+org_admin / 보호자=guardian(+초대코드 연결).
 * 반환: 갱신된 users row(역할 라우팅에 사용).
 */
export async function completeOnboarding(params: OnboardingParams): Promise<UserRow> {
  const { data, error } = await getGiokonClient().rpc('complete_onboarding', {
    p_name: params.name,
    p_phone: params.phone,
    p_role: params.role,
    p_org_name: params.orgName ?? null,
    p_invite_code: params.inviteCode ?? null,
  })
  if (error) throw error
  return data as UserRow
}

/**
 * 보호자 어르신 연결 — 초대 코드 사용(RPC redeem_guardian_invite).
 * 온보딩 중·로그인 후("어르신 연결") 공용. 반환: 생성된 pending 연결 row.
 */
export async function redeemGuardianInvite(code: string): Promise<ProfileGuardianRow> {
  const { data, error } = await getGiokonClient().rpc('redeem_guardian_invite', {
    p_code: code,
  })
  if (error) throw error
  return data as ProfileGuardianRow
}

/** 인증 상태 변화 구독. 반환된 subscription.unsubscribe()로 해제. */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): Subscription {
  const { data } = getGiokonClient().auth.onAuthStateChange(callback)
  return data.subscription
}
