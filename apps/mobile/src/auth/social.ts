// 소셜 로그인 (구글·카카오 = Supabase PKCE OAuth / 네이버 = naver-auth 함수)
//
// 모바일 흐름(Expo 권장 패턴):
//   1. signInWithOAuth(skipBrowserRedirect:true) 로 인증 URL 만들기
//      (클라이언트는 flowType:'pkce' — client.ts 참고)
//   2. openAuthSessionAsync 로 시스템 브라우저 열고 giokon://auth/callback 으로 복귀
//   3. 복귀 URL 의 code → exchangeCodeForSession(암시적 플로우 폴백: setSession)
//
// 네이버는 Supabase 네이티브 provider 가 없어 커스텀 Edge Function(naver-auth)이
// 세션을 발급한다(PLAN M17.5 확정 아키텍처). 함수는 --no-verify-jwt 로 배포한다
// (로그인 전 호출이라 익명 요청이 정상이다 — 코드 검증은 서버가 한다).
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { getGiokonClient } from '@giokon/data';

/** 독립빌드=giokon://auth/callback · Expo Go/dev-client=exp+<slug>://… 자동 해석 */
const redirectTo = makeRedirectUri({ scheme: 'giokon', path: 'auth/callback' });

export type SocialResult = { ok: true } | { ok: false; canceled: boolean };

function callbackParams(urlStr: string): URLSearchParams {
  const u = new URL(urlStr);
  const fromQuery = u.searchParams;
  if (fromQuery.get('code') || fromQuery.get('access_token')) return fromQuery;
  // 암시적 플로우는 프래그먼트(#access_token=…)로 온다.
  return new URLSearchParams(u.hash.startsWith('#') ? u.hash.slice(1) : u.hash);
}

/** 구글·카카오 — Supabase 네이티브 OAuth(PKCE). */
let oauthInFlight: { provider: 'google' | 'kakao'; promise: Promise<SocialResult> } | null = null;

export function signInWithSupabaseProvider(provider: 'google' | 'kakao'): Promise<SocialResult> {
  // 두 브라우저가 같은 PKCE verifier를 덮어쓰거나 코드를 중복 교환하지 않게 한다.
  if (oauthInFlight) {
    return oauthInFlight.provider === provider
      ? oauthInFlight.promise
      : Promise.reject(new Error('진행 중인 로그인을 먼저 완료해 주세요.'));
  }
  const promise = completeSupabaseSignIn(provider).finally(() => { oauthInFlight = null; });
  oauthInFlight = { provider, promise };
  return promise;
}

async function completeSupabaseSignIn(
  provider: 'google' | 'kakao',
): Promise<SocialResult> {
  const client = getGiokonClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('인증 화면을 시작하지 못했어요.');

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type === 'cancel' || res.type === 'dismiss') return { ok: false, canceled: true };
  if (res.type !== 'success' || !res.url) throw new Error('로그인 결과를 확인하지 못했어요.');

  const callback = new URL(res.url);
  const expected = new URL(redirectTo);
  if (callback.protocol !== expected.protocol || callback.host !== expected.host ||
      callback.pathname !== expected.pathname || callback.username || callback.password) {
    throw new Error('로그인 콜백 주소가 올바르지 않아요.');
  }
  const fragment = new URLSearchParams(callback.hash.slice(1));
  if (callback.searchParams.has('error') || callback.searchParams.has('error_description') ||
      fragment.has('error') || fragment.has('error_description')) {
    // 공급자 오류 원문에 인증 정보가 섞일 수 있어 화면에는 고정 문구만 표시한다.
    throw new Error('소셜 로그인이 거절되었어요. 다시 시도해 주세요.');
  }

  const params = callbackParams(res.url);
  const code = params.get('code');
  if (code) {
    const { error: exErr } = await client.auth.exchangeCodeForSession(code);
    if (exErr) throw exErr;
    return { ok: true };
  }
  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (!access || !refresh) throw new Error('로그인 결과를 확인하지 못했어요.');
  const { error: sErr } = await client.auth.setSession({ access_token: access, refresh_token: refresh });
  if (sErr) throw sErr;
  return { ok: true };
}

/**
 * 네이버 — naver-auth Edge Function 경유.
 * 앱은 네이버 인가 코드만 얻고, 세션 발급은 서버(client secret 보관)가 한다.
 */
export async function signInWithNaver(): Promise<SocialResult> {
  const clientId = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID?.trim();
  const fnUrl =
    process.env.EXPO_PUBLIC_LIVE_TOKEN_URL?.trim().replace(/\/live-token$/, '/naver-auth') ||
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/naver-auth`;
  if (!clientId || !process.env.EXPO_PUBLIC_SUPABASE_URL) {
    throw new Error('네이버 로그인 설정(EXPO_PUBLIC_NAVER_CLIENT_ID)이 없어요.');
  }

  const state = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const authUrl =
    'https://nid.naver.com/oauth2.0/authorize' +
    `?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectTo)}&state=${state}`;

  const res = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
  if (res.type !== 'success' || !res.url) return { ok: false, canceled: true };

  const params = callbackParams(res.url);
  const code = params.get('code');
  const returnedState = params.get('state');
  if (!code) throw new Error('네이버 인가에 실패했어요.');
  if (returnedState !== state) throw new Error('보안 검증(state)에 실패했어요.');

  const r = await fetch(fnUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`네이버 로그인 실패 (${r.status}) ${body.slice(0, 80)}`);
  }
  const json = (await r.json()) as { access_token?: string; refresh_token?: string };
  if (!json.access_token || !json.refresh_token) {
    throw new Error('세션 발급 응답이 올바르지 않아요.');
  }
  const { error } = await getGiokonClient().auth.setSession({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
  });
  if (error) throw error;
  return { ok: true };
}
