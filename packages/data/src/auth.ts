// @giokon/data — Supabase Auth (소셜 로그인 + 온보딩 회원가입)
//
// 인증 개편(2026-07-16, T17.5·T17.6):
//   - 로그인 = 소셜 3종(구글·카카오·네이버). 이메일/비밀번호 로그인 제거.
//   - 구글·카카오 = Supabase 네이티브 OAuth(signInWithOAuth).
//   - 네이버 = Supabase 비네이티브 → 커스텀 Edge Function(naver-auth) 경유.
//   - 회원가입 = OAuth 최초 로그인 후 온보딩(completeOnboarding RPC)에서
//     기본정보(이름·전화·역할·기관명/초대코드)를 확정한다. 가입 트리거
//     (handle_new_user)는 최소 users row 만 만든다.
//   - 보호자↔어르신 연결 = linkGuardianByElderCode RPC(어르신 영속 코드·비소진).
//   - 요양보호사 담당 배정 = claimElderByCode RPC(코드로 기존 어르신 인계).

import type {
  AuthChangeEvent,
  Session,
  Subscription,
  User,
} from '@supabase/supabase-js'
import { getGiokonClient, signOutGiokonClient, isLocalLogoutPending, waitForSignOut } from './client'
import type { ProfileCaregiverRow, ProfileGuardianRow, UserRow } from './database.types'
import type { ConsentType } from '@giokon/core'

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
  await waitForSignOut()
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

/**
 * 서버가 발급한 access/refresh 토큰으로 세션을 세운다.
 * 네이버는 Supabase 네이티브 provider 가 아니라 detectSessionInUrl 이 잡지 못한다 —
 * naver-auth 가 돌려준 토큰을 호출자가 직접 넘겨 준다(웹=URL 프래그먼트, 앱=POST 응답).
 */
export async function setSessionFromTokens(
  accessToken: string,
  refreshToken: string,
): Promise<Session> {
  await waitForSignOut()
  const { data, error } = await getGiokonClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (error) throw error
  if (!data.session) throw new Error('세션을 세우지 못했습니다.')
  return data.session
}

// ── 이메일/비밀번호 인증(소셜과 병행, 2026-07-23 재도입) ─────────────────────
// 소셜 3종에 더해 일반 이메일(아이디)+비밀번호 로그인·회원가입·비밀번호 재설정·
// 아이디(이메일) 찾기를 제공한다. 이메일 회원가입도 최초 로그인 후 온보딩
// (complete_onboarding)에서 역할·기관을 확정한다. Supabase Auth 가 비밀번호
// 해싱·재설정 메일을 처리하며, 실제 메일 발송은 Supabase 프로젝트 SMTP 설정 필요.

export interface EmailCredentials {
  email: string
  password: string
}

/** 이메일(아이디)+비밀번호 로그인. */
export async function signInWithEmail(params: EmailCredentials): Promise<Session> {
  await waitForSignOut()
  const { data, error } = await getGiokonClient().auth.signInWithPassword({
    email: params.email.trim(),
    password: params.password,
  })
  if (error) throw error
  if (!data.session) throw new Error('로그인에 실패했습니다.')
  return data.session
}

/**
 * 이메일 회원가입. 이메일 확인(컨펌) 설정에 따라 세션이 즉시 없을 수 있다
 * (needsConfirm=true → 확인 메일 안내). 확인/즉시가입 모두 완료 후 온보딩으로.
 * @returns session 이 있으면 바로 온보딩, 없으면 이메일 확인 대기.
 */
export async function signUpWithEmail(
  params: EmailCredentials & { redirectTo?: string },
): Promise<{ session: Session | null; needsConfirm: boolean }> {
  await waitForSignOut()
  const { data, error } = await getGiokonClient().auth.signUp({
    email: params.email.trim(),
    password: params.password,
    options: params.redirectTo ? { emailRedirectTo: params.redirectTo } : undefined,
  })
  if (error) throw error
  return { session: data.session, needsConfirm: data.session === null }
}

/** 비밀번호 재설정 메일 발송(재설정 링크가 redirectTo 로 돌아온다). */
export async function sendPasswordResetEmail(email: string, redirectTo: string): Promise<void> {
  const { error } = await getGiokonClient().auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  })
  if (error) throw error
}

/** 새 비밀번호로 변경(재설정 링크 진입 후 세션 상태에서 호출). */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await getGiokonClient().auth.updateUser({ password: newPassword })
  if (error) throw error
}

/**
 * 아이디(이메일) 찾기 — 이름+전화번호로 마스킹된 이메일 조회(RPC find_login_email).
 * 서버는 정확히 일치하는 1건에 한해 마스킹 이메일을 반환하고, 없으면 null.
 * (프로덕션에선 본인인증(PASS/휴대폰) 게이트 권장 — docs/runbooks 참조.)
 */
export async function findLoginEmail(name: string, phone: string): Promise<string | null> {
  const { data, error } = await getGiokonClient().rpc('find_login_email', {
    p_name: name.trim(),
    p_phone: phone.trim(),
  })
  if (error) throw error
  return (data as string | null) ?? null
}

/** 로그아웃. */
export async function signOut(): Promise<void> {
  await signOutGiokonClient()
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
  /** 보호자 선택: 있으면 어르신 영속 코드로 연결(pending)까지 처리. */
  elderCode?: string
  /**
   * 온보딩 화면의 계정 필수 동의(consent_type 목록) — RPC 가 consents 에 적재한다(C2).
   * 미전달 시 기록 없이 통과하던 이전 동작과 동일.
   */
  consents?: ConsentType[]
}

/**
 * 온보딩 회원가입 확정(RPC complete_onboarding).
 * 요양보호사=새 기관 생성+org_admin / 보호자=guardian(+어르신 코드 연결).
 * 반환: 갱신된 users row(역할 라우팅에 사용).
 */
export async function completeOnboarding(params: OnboardingParams): Promise<UserRow> {
  const { data, error } = await getGiokonClient().rpc('complete_onboarding', {
    p_name: params.name,
    p_phone: params.phone,
    p_role: params.role,
    p_org_name: params.orgName ?? null,
    p_elder_code: params.elderCode ?? null,
    p_consents: params.consents?.length ? params.consents : null,
  })
  if (error) throw error
  return data as UserRow
}

/**
 * 보호자 어르신 연결 — 어르신 영속 코드 사용(RPC link_guardian_by_elder_code).
 * 온보딩 중·로그인 후("어르신 연결") 공용. 코드는 소진되지 않으며(멱등),
 * 요양보호사 승인 후 열람 가능. 반환: 생성/갱신된 pending 연결 row.
 */
export async function linkGuardianByElderCode(code: string): Promise<ProfileGuardianRow> {
  const { data, error } = await getGiokonClient().rpc('link_guardian_by_elder_code', {
    p_code: code,
  })
  if (error) throw error
  return data as ProfileGuardianRow
}

/**
 * 요양보호사 담당 배정 — 어르신 영속 코드로 self-claim(RPC claim_elder_by_code).
 * 같은 기관 안에서 기존 어르신·전 이력을 인계받는다(신규 생성 없음). 멱등.
 * 반환: 생성/갱신된 배정 row.
 */
export async function claimElderByCode(code: string): Promise<ProfileCaregiverRow> {
  const { data, error } = await getGiokonClient().rpc('claim_elder_by_code', {
    p_code: code,
  })
  if (error) throw error
  return data as ProfileCaregiverRow
}

/** 인증 상태 변화 구독. 반환된 subscription.unsubscribe()로 해제. */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): Subscription {
  const { data } = getGiokonClient().auth.onAuthStateChange((event, session) => {
    callback(event, isLocalLogoutPending() ? null : session)
  })
  return data.subscription
}
