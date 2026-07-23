// 통합 로그인·회원가입 (SCR-W05 — T17.4·T17.5 / 2026-07-23 이메일 인증 병행)
//
// 이메일(아이디)+비밀번호 로그인·회원가입에 더해 소셜 3종(구글·카카오·네이버)을
// 함께 제공한다. 이메일 회원가입도 최초 후 온보딩(/onboarding)에서 역할·기관을
// 확정한다. 아이디(이메일)·비밀번호 찾기는 별도 페이지로 연결.
// 세션이 있으면 역할에 따라 자동 이동. Supabase 미설정 시 안내·비활성.

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, Mail } from 'lucide-react';
import { signInWithEmail, signUpWithEmail } from '@giokon/data';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../auth/AuthProvider';
import { routeForUser } from '../auth/routes';
import { useStore } from '../store/store';
import { isSupabaseConfigured } from '../lib/supabase';
import { cn } from '../lib/utils';

type Mode = 'login' | 'signup';

export function LoginPage() {
  const { session, userRow, loading } = useAuth();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentConfirm, setSentConfirm] = useState(false);

  if (loading) return null; // 세션·역할 판별 중 — 깜빡임 방지
  if (session) return <Navigate to={routeForUser(userRow)} replace />;

  async function submit() {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 이메일 로그인을 사용할 수 없습니다.');
      return;
    }
    if (!email.trim()) {
      toast('error', '이메일(아이디)을 입력해 주세요.');
      return;
    }
    if (!password) {
      toast('error', '비밀번호를 입력해 주세요.');
      return;
    }
    if (mode === 'signup') {
      if (password.length < 8) {
        toast('error', '비밀번호는 8자 이상이어야 합니다.');
        return;
      }
      if (password !== passwordConfirm) {
        toast('error', '비밀번호가 일치하지 않습니다.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithEmail({ email, password });
        // 세션 변화 → AuthProvider 가 역할 라우팅. 온보딩 미완료면 가드가 처리.
        navigate('/onboarding', { replace: true });
      } else {
        const { session: newSession, needsConfirm } = await signUpWithEmail({
          email,
          password,
          redirectTo: `${window.location.origin}/onboarding`,
        });
        if (needsConfirm || !newSession) {
          setSentConfirm(true); // 이메일 확인 대기
        } else {
          navigate('/onboarding', { replace: true });
        }
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  const tabBtn = 'flex-1 py-2.5 text-sm font-semibold rounded-lg transition';

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-warm-100/40 to-warm-200/30 flex flex-col">
      <header className="px-6 py-5">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={15} /> 처음으로
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-warm-500 items-center justify-center mb-4 shadow-warm">
              <Brain size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">로그인 · 회원가입</h1>
            <p className="text-sm text-slate-500 mt-1.5" style={{ wordBreak: 'keep-all' }}>
              이메일 또는 소셜 계정으로 시작하세요. 처음이시면 회원가입 후 기본 정보를
              입력하면 됩니다.
            </p>
          </div>

          {sentConfirm ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft text-center space-y-3">
              <div className="inline-flex w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 items-center justify-center">
                <Mail size={22} />
              </div>
              <h2 className="text-lg font-bold text-slate-900">확인 메일을 보냈어요</h2>
              <p className="text-sm text-slate-600" style={{ wordBreak: 'keep-all' }}>
                <strong>{email}</strong> 로 보낸 메일의 링크를 눌러 가입을 완료해 주세요.
                이후 로그인하면 기본 정보 입력(온보딩)으로 이어집니다.
              </p>
              <Button variant="outline" onClick={() => { setSentConfirm(false); setMode('login'); }} className="w-full">
                로그인으로 돌아가기
              </Button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft space-y-5">
              {/* 로그인 / 회원가입 탭 */}
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={cn(tabBtn, mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
                >
                  로그인
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={cn(tabBtn, mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
                >
                  회원가입
                </button>
              </div>

              <Field label="이메일 (아이디)" required>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="예: caregiver@example.com"
                  autoComplete="email"
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              </Field>

              <Field
                label="비밀번호"
                required
                hint={mode === 'signup' ? '8자 이상 입력해 주세요.' : undefined}
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              </Field>

              {mode === 'signup' ? (
                <Field label="비밀번호 확인" required>
                  <Input
                    type="password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="비밀번호 다시 입력"
                    autoComplete="new-password"
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                  />
                </Field>
              ) : null}

              <Button onClick={submit} disabled={submitting || !isSupabaseConfigured} className="w-full h-12" size="lg">
                {submitting ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
              </Button>

              {mode === 'login' ? (
                <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
                  <Link to="/find-id" className="hover:text-slate-800">아이디 찾기</Link>
                  <span className="text-slate-300">·</span>
                  <Link to="/forgot-password" className="hover:text-slate-800">비밀번호 찾기</Link>
                </div>
              ) : null}

              {/* 소셜 로그인 */}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-xs text-slate-400">또는 소셜 계정으로 계속하기</span>
                </div>
              </div>
              <SocialLoginButtons />
            </div>
          )}

          <div className="mt-6 text-[11px] text-center text-slate-400 space-x-3">
            <Link to="/privacy" className="hover:text-slate-600">개인정보 처리방침</Link>
            <Link to="/terms" className="hover:text-slate-600">이용약관</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
