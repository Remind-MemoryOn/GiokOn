// 소셜 로그인 버튼 3종 (T17.5 — SCR-W05)
//
// 구글·카카오 = Supabase 네이티브 OAuth(signInWithOAuth) / 네이버 = 커스텀
// Edge Function(naver-auth) 경유. OAuth 가 로그인·회원가입을 겸하며, 최초
// 로그인 후 온보딩(/onboarding)에서 기본정보를 입력받는다(SCR-W12).
// Supabase 미설정 시 버튼을 비활성화하고 안내를 띄운다.

import { useState } from 'react';
import { signInWithProvider, buildNaverAuthUrl, type NativeSocialProvider } from '@giokon/data';
import { isSupabaseConfigured, supabaseUrl } from '../lib/supabase';
import { useStore } from '../store/store';
import { cn } from '../lib/utils';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.1 3.56-5.18 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.96H1.27v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.27a12 12 0 0 0 0 10.76l4.01-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4.01 3.1C6.22 6.87 8.87 4.76 12 4.76z"
      />
    </svg>
  );
}

function KakaoMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#191919"
        d="M12 3C6.48 3 2 6.52 2 10.86c0 2.78 1.85 5.22 4.63 6.62l-1.18 4.33c-.1.38.33.68.66.46l5.16-3.42c.24.02.48.03.73.03 5.52 0 10-3.52 10-7.86S17.52 3 12 3z"
      />
    </svg>
  );
}

function NaverMark() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="#fff" d="M16.27 4v8.4L7.9 4H4v16h3.73v-8.4L16.1 20H20V4h-3.73z" />
    </svg>
  );
}

interface Props {
  /** OAuth 완료 후 돌아올 앱 경로(기본 /login — 역할 라우팅 처리). */
  redirectPath?: string;
  className?: string;
}

export function SocialLoginButtons({ redirectPath = '/login', className }: Props) {
  const toast = useStore((s) => s.toast);
  const [pending, setPending] = useState<string | null>(null);
  const disabled = !isSupabaseConfigured || pending !== null;

  async function nativeLogin(provider: NativeSocialProvider) {
    if (!isSupabaseConfigured) return;
    setPending(provider);
    try {
      await signInWithProvider(provider, {
        redirectTo: `${window.location.origin}${redirectPath}`,
      });
      // 성공 시 브라우저가 provider 로 리다이렉트된다.
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '로그인을 시작하지 못했습니다.');
      setPending(null);
    }
  }

  function naverLogin() {
    if (!isSupabaseConfigured || !supabaseUrl) return;
    setPending('naver');
    window.location.assign(
      buildNaverAuthUrl(supabaseUrl, `${window.location.origin}${redirectPath}`),
    );
  }

  const base =
    'w-full h-12 rounded-xl inline-flex items-center justify-center gap-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

  return (
    <div className={cn('space-y-2.5', className)}>
      {!isSupabaseConfigured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Supabase가 설정되지 않아 로그인할 수 없습니다. <code>apps/web/.env</code>에
          URL·publishable 키를 채워 주세요.
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => nativeLogin('google')}
        disabled={disabled}
        className={cn(base, 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50')}
      >
        <GoogleMark />
        {pending === 'google' ? '이동 중...' : '구글로 계속하기'}
      </button>

      <button
        type="button"
        onClick={() => nativeLogin('kakao')}
        disabled={disabled}
        className={cn(base, 'bg-[#FEE500] text-[#191919] hover:brightness-95')}
      >
        <KakaoMark />
        {pending === 'kakao' ? '이동 중...' : '카카오로 계속하기'}
      </button>

      <button
        type="button"
        onClick={naverLogin}
        disabled={disabled}
        className={cn(base, 'bg-[#03C75A] text-white hover:brightness-95')}
      >
        <NaverMark />
        {pending === 'naver' ? '이동 중...' : '네이버로 계속하기'}
      </button>

      <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-1">
        소셜 계정으로 로그인하면 제공 동의한 이메일·이름·전화(본인인증) 정보가 계정
        생성·프로필 입력에 사용됩니다. 네이버 로그인은 서버 함수(naver-auth) 배포 후 동작합니다.
      </p>
    </div>
  );
}
