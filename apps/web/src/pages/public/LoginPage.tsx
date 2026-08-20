// 로그인 (Figma 15:443 — 1440×1084 실측)
//   콘텐츠 열 568 @ x436 · 필드 그룹 높이 110(라벨 22 + 간격 + 입력 68)
//   아이디 254 · 비밀번호 389 · 아이디 저장 537 · 로그인 600(568×71) · 또는 706 · 소셜 758
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { signInWithEmail, signInWithProvider, buildNaverAuthUrl, type NativeSocialProvider } from '@giokon/data';
import { PublicHeader } from '../../components/shell/PublicHeader';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { routeForUser } from '../../auth/routes';
import { useStore } from '../../store/store';
import { isSupabaseConfigured, supabaseUrl } from '../../lib/supabase';
import { cn } from '../../lib/utils';

const SOCIAL = [
  { key: 'naver', label: '네이버', chip: 'bg-naver', mark: asset.markNaver, left: 436 },
  { key: 'kakao', label: '카카오톡', chip: 'bg-kakao', mark: asset.markKakao, left: 629 },
  { key: 'google', label: '구글', chip: 'bg-white shadow-chip', mark: asset.markGoogle, left: 824 },
] as const;

export function LoginPage() {
  const { session, userRow, loading } = useAuth();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  if (loading) return null; // 세션 판별 중 — 깜빡임 방지
  if (session) return <Navigate to={routeForUser(userRow)} replace />;

  async function submit() {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 로그인을 사용할 수 없습니다.');
      return;
    }
    if (!email.trim()) return toast('error', '이메일을 입력해주세요.');
    if (!password) return toast('error', '비밀번호를 입력해주세요.');
    setSubmitting(true);
    try {
      await signInWithEmail({ email, password });
      navigate('/onboarding', { replace: true });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function social(key: (typeof SOCIAL)[number]['key']) {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 소셜 로그인을 사용할 수 없습니다.');
      return;
    }
    setPending(key);
    try {
      if (key === 'naver') {
        if (!supabaseUrl) throw new Error('서버 주소가 설정되지 않았습니다.');
        window.location.assign(buildNaverAuthUrl(supabaseUrl, `${window.location.origin}/login`));
        return;
      }
      await signInWithProvider(key as NativeSocialProvider, {
        redirectTo: `${window.location.origin}/login`,
      });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '로그인을 시작하지 못했습니다.');
      setPending(null);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      {/* 좌표는 1440 캔버스 기준값에서 헤더 높이(122)를 뺀 값이다. */}
      <main className="relative mx-auto h-[962px] w-full max-w-[1440px]">
        <h1 className="absolute left-[607px] top-[72px] whitespace-nowrap text-w-nav font-semibold text-ink-500">
          계정으로 로그인해 주세요.
        </h1>

        {/* 아이디 */}
        <div className="absolute left-[436px] top-[132px] w-[568px]">
          <label className="block text-w-nav font-semibold text-ink-500" htmlFor="login-email">
            아이디
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoComplete="email"
            placeholder="이메일을 입력해주세요"
            className="mt-[12px] h-[68px] w-full rounded-[10px] border border-line bg-white px-[29px] text-w-body text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
          />
        </div>

        {/* 비밀번호 */}
        <div className="absolute left-[436px] top-[267px] w-[568px]">
          <label className="block text-w-nav font-semibold text-ink-500" htmlFor="login-password">
            비밀번호
          </label>
          <div className="relative mt-[12px]">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoComplete="current-password"
              placeholder="비밀번호를 입력해주세요"
              className="h-[68px] w-full rounded-[10px] border border-line bg-white px-[29px] pr-[72px] text-w-body text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              className="absolute right-[29px] top-1/2 -translate-y-1/2"
            >
              <img src={asset.iconEye} alt="" width={30} height={20} className="block" />
            </button>
          </div>
        </div>

        {/* 아이디 저장 / 찾기 */}
        <button
          type="button"
          onClick={() => setRemember((v) => !v)}
          aria-pressed={remember}
          className="absolute left-[436px] top-[415px] flex h-[24px] items-center gap-[7px]"
        >
          <img
            src={asset.iconCheckbox}
            alt=""
            width={21}
            height={21}
            className={cn('block', remember ? 'opacity-100' : 'opacity-60')}
          />
          <span className="text-w-body text-ink-500">아이디 저장</span>
        </button>
        <Link
          to="/find-id"
          className="absolute left-[836px] top-[416px] whitespace-nowrap text-w-body text-ink-500 underline"
        >
          아이디/비밀번호 찾기
        </Link>

        {/* 로그인 */}
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !isSupabaseConfigured}
          className="absolute left-[436px] top-[478px] h-[71px] w-[568px] rounded-[10px] bg-accent text-w-cta font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {submitting ? '로그인 중...' : '로그인'}
        </button>

        {/* 회원가입 유도 */}
        <p className="absolute left-[587px] top-[772px] whitespace-nowrap text-w-body font-medium text-ink-500">
          계정이 없으신가요?
        </p>
        <Link
          to="/signup"
          className="absolute left-[749px] top-[772px] whitespace-nowrap text-w-body font-medium text-accent"
        >
          회원가입
        </Link>

        {/* 또는 */}
        <div className="absolute left-[436px] top-[596px] h-px w-[250px] bg-line-strong" />
        <span className="absolute left-[703px] top-[584px] text-w-body font-medium text-ink-500">또는</span>
        <div className="absolute left-[754px] top-[596px] h-px w-[250px] bg-line-strong" />

        {/* 소셜 로그인 — 네이버 · 카카오톡 · 구글 (180×68 r10) */}
        {SOCIAL.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => social(s.key)}
            disabled={pending !== null || !isSupabaseConfigured}
            style={{ left: s.left }}
            className="absolute top-[636px] flex h-[68px] w-[180px] items-center rounded-[10px] border border-line bg-white disabled:opacity-50"
          >
            <span
              className={cn(
                'ml-[39px] flex h-[34px] w-[36px] items-center justify-center rounded-[5px]',
                s.chip,
              )}
            >
              <img src={s.mark} alt="" className="block max-h-[22px] max-w-[24px]" />
            </span>
            <span className="ml-[18px] text-w-body font-semibold text-ink-500">
              {pending === s.key ? '이동 중...' : s.label}
            </span>
          </button>
        ))}

        {/* 법적 문서 */}
        <div className="absolute left-[590px] top-[870px] flex items-center gap-4 text-w-sub text-ink-500">
          <Link to="/guide#privacy" className="hover:underline">개인정보처리방침</Link>
          <span className="h-[14px] w-px bg-ink-500" />
          <Link to="/guide#terms" className="hover:underline">이용약관</Link>
        </div>
      </main>
    </div>
  );
}
