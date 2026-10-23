// 로그인 (Figma 15:443 — 1440×1084 실측)
//   콘텐츠 열 568 @ x436 · 필드 그룹 높이 110(라벨 22 + 간격 + 입력 68)
//   아이디 254 · 비밀번호 389 · 아이디 저장 537 · 로그인 600(568×71) · 또는 706 · 소셜 758
// ⚠️ 라인박스는 Figma auto(≈1.2) — 토큰 기본값(28/30)을 쓰면 잉크가 2~3px 내려간다.
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  signInWithEmail,
  signInWithProvider,
  buildNaverAuthUrl,
  getCurrentUserRow,
  setSessionFromTokens,
  type NativeSocialProvider,
} from '@giokon/data';
import { PublicHeader } from '../../components/shell/PublicHeader';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { loginPath, routeAfterLogin } from '../../auth/routes';
import { useStore } from '../../store/store';
import { isSupabaseConfigured, supabaseUrl } from '../../lib/supabase';
import { cn } from '../../lib/utils';

const SOCIAL = [
  { key: 'naver', label: '네이버', chip: 'bg-naver', mark: asset.markNaver, left: 436, fx: '72:836', fxChip: '72:847' },
  { key: 'kakao', label: '카카오톡', chip: 'bg-kakao', mark: asset.markKakao, left: 629, fx: '72:855', fxChip: '72:867' },
  { key: 'google', label: '구글', chip: 'bg-white shadow-chip', mark: asset.markGoogle, left: 824, fx: '72:872', fxChip: '72:833' },
] as const;

/** "아이디 저장" — 기기에 남는 것은 이메일뿐이다(비밀번호·토큰은 절대 두지 않는다). */
const REMEMBER_KEY = 'giokon.login.email';

function readRememberedEmail(): string {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return ''; // 사생활 보호 모드 등 — 저장이 막혀도 로그인은 되어야 한다
  }
}

type NaverCallback =
  | { ok: false; error: string }
  | { ok: true; access: string; refresh: string };

/** naver-auth 가 프래그먼트로 돌려준 결과를 읽는다(읽기만 — 지우는 것은 이펙트에서). */
function readNaverCallback(): NaverCallback | null {
  const hash = window.location.hash;
  if (!/(?:^|[#&])(access_token|naver_error)=/.test(hash)) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const failed = p.get('naver_error');
  if (failed) return { ok: false, error: failed };
  const access = p.get('access_token');
  const refresh = p.get('refresh_token');
  if (!access || !refresh) return { ok: false, error: '네이버 로그인 응답이 올바르지 않아요.' };
  return { ok: true, access, refresh };
}

export function LoginPage() {
  const { session, userRow, loading } = useAuth();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo: unknown = new URLSearchParams(location.search).get('returnTo')
    ?? (location.state as { from?: unknown } | null)?.from;

  const [remembered] = useState(readRememberedEmail);
  const [email, setEmail] = useState(remembered);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(Boolean(remembered));
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  // 네이버 콜백 처리 중에는 로그인 폼을 그리지 않는다(눌러도 소용없는 화면).
  const [callback] = useState(readNaverCallback);
  const [naverReturning, setNaverReturning] = useState(Boolean(callback));

  // 네이버는 Supabase 네이티브 provider 가 아니라 detectSessionInUrl 이 잡지 못한다 —
  // naver-auth 가 프래그먼트로 넘긴 토큰을 여기서 직접 세션으로 세운다.
  useEffect(() => {
    if (!callback) return;
    // 토큰이 주소창·히스토리·Referer 에 남지 않게 즉시 지운다.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    let alive = true;
    void (async () => {
      if (!callback.ok) {
        toast('error', callback.error);
        if (alive) setNaverReturning(false);
        return;
      }
      try {
        await setSessionFromTokens(callback.access, callback.refresh);
        const row = await getCurrentUserRow();
        if (alive) navigate(routeAfterLogin(row, returnTo), { replace: true });
      } catch (err) {
        if (!alive) return;
        toast('error', err instanceof Error ? err.message : '네이버 로그인에 실패했어요.');
        setNaverReturning(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [callback, navigate, toast, returnTo]);

  if (loading || naverReturning) return null; // 세션 판별 중 — 깜빡임 방지
  if (session) return <Navigate to={routeAfterLogin(userRow, returnTo)} replace />;

  async function submit() {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 로그인을 사용할 수 없어요.');
      return;
    }
    if (!email.trim()) return toast('error', '이메일을 입력해 주세요.');
    if (!password) return toast('error', '비밀번호를 입력해 주세요.');
    setSubmitting(true);
    try {
      await signInWithEmail({ email, password });
      // 체크했을 때만 이메일을 남기고, 껐으면 남아 있던 것도 지운다.
      try {
        if (remember) window.localStorage.setItem(REMEMBER_KEY, email.trim());
        else window.localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* 저장이 막힌 브라우저 — 로그인 자체는 그대로 진행한다 */
      }
      // 소셜 로그인은 이미 역할로 분기하는데 이메일 로그인만 온보딩으로 직행했다.
      const row = await getCurrentUserRow();
      navigate(routeAfterLogin(row, returnTo), { replace: true });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '로그인에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function social(key: (typeof SOCIAL)[number]['key']) {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 소셜 로그인을 사용할 수 없어요.');
      return;
    }
    setPending(key);
    try {
      if (key === 'naver') {
        if (!supabaseUrl) throw new Error('서버 주소가 설정되지 않았어요.');
        window.location.assign(buildNaverAuthUrl(supabaseUrl, `${window.location.origin}${loginPath(returnTo)}`));
        return;
      }
      await signInWithProvider(key as NativeSocialProvider, {
        redirectTo: `${window.location.origin}${loginPath(returnTo)}`,
      });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '로그인을 시작하지 못했어요.');
      setPending(null);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      {/* 좌표는 1440 캔버스 기준값에서 헤더 높이(122)를 뺀 값이다. */}
      <main className="relative mx-auto h-[962px] w-full max-w-[1440px]">
        <h1
          data-fx="72:958"
          className="absolute left-[607px] top-[72px] whitespace-nowrap text-w-nav font-semibold leading-[26px] text-ink-500"
        >
          계정으로 로그인해 주세요.
        </h1>

        {/* 아이디 */}
        <div data-fx="23:146" className="absolute left-[436px] top-[132px] w-[568px]">
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
        <div data-fx="23:150" className="absolute left-[436px] top-[267px] w-[568px]">
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
          data-fx="23:168"
          className="absolute left-[436px] top-[415px] flex h-[24px] items-center gap-[7px]"
        >
          {/* 체크박스 틀은 Figma 에셋 그대로(21) — 선택 표시는 안쪽 accent 사각형 */}
          <span className="relative block h-[21px] w-[21px]">
            <img src={asset.iconCheckbox} alt="" width={21} height={21} className="block" />
            {remember ? (
              <span className="absolute inset-[5px] rounded-[2px] bg-accent" />
            ) : null}
          </span>
          <span className="text-w-body text-ink-500">아이디 저장</span>
        </button>
        <Link
          to="/find-id"
          data-fx="22:39"
          className="absolute left-[836px] top-[416px] whitespace-nowrap text-w-body leading-[24px] text-ink-500 underline"
        >
          아이디/비밀번호 찾기
        </Link>

        {/* 로그인 */}
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !isSupabaseConfigured}
          data-fx="22:32"
          className="absolute left-[436px] top-[478px] h-[71px] w-[568px] rounded-[10px] bg-accent text-w-cta font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {submitting ? '로그인 중...' : '로그인'}
        </button>

        {/* 회원가입 유도 */}
        <p
          data-fx="22:52"
          className="absolute left-[587px] top-[772px] whitespace-nowrap text-w-body font-medium leading-[24px] text-ink-500"
        >
          계정이 없으신가요?
        </p>
        <Link
          to="/signup"
          data-fx="22:54"
          className="absolute left-[749px] top-[772px] whitespace-nowrap text-w-body font-medium leading-[24px] text-accent"
        >
          회원가입
        </Link>

        {/* 또는 */}
        <div data-fx="72:723" className="absolute left-[436px] top-[596px] h-px w-[250px] bg-line-strong" />
        <span
          data-fx="72:726"
          className="absolute left-[703px] top-[584px] text-w-body font-medium leading-[24px] text-ink-500"
        >
          또는
        </span>
        <div data-fx="72:731" className="absolute left-[754px] top-[596px] h-px w-[250px] bg-line-strong" />

        {/* 소셜 로그인 — 네이버 · 카카오톡 · 구글 (180×68 r10) */}
        {SOCIAL.map((s) => (
          <button
            key={s.key}
            data-fx={s.fx}
            type="button"
            onClick={() => social(s.key)}
            disabled={pending !== null || !isSupabaseConfigured}
            style={{ left: s.left }}
            className="absolute top-[636px] flex h-[68px] w-[180px] items-center rounded-[10px] border border-line bg-white disabled:opacity-50"
          >
            <span
              data-fx={s.fxChip}
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
        {/* 법적 문서 — Figma 실측 좌표(처리방침 590 · 구분 731 · 약관 754 @ 992) */}
        <div className="absolute inset-x-0 top-[870px] text-w-sub leading-[21px] text-ink-500">
          <Link
            to="/privacy"
            data-fx="22:56"
            className="absolute left-[590px] whitespace-nowrap hover:underline"
          >
            개인정보처리방침
          </Link>
          {/* 구분자는 1px 선이 아니라 4×21 굵은 막대다(Figma 22:58 실측) */}
          <span className="absolute left-[731px] top-0 h-[21px] w-[4px] bg-ink-500" />
          <Link
            to="/terms"
            data-fx="22:57"
            className="absolute left-[754px] whitespace-nowrap hover:underline"
          >
            이용약관
          </Link>
        </div>
      </main>
    </div>
  );
}
