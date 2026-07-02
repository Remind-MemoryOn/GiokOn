import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brain, ArrowLeft, LogIn, UserPlus } from 'lucide-react';
import { signIn, signUp } from '@giokon/data';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/store';
import { useAuth } from '../auth/AuthProvider';

type Mode = 'signin' | 'signup';

export function CaregiverLoginPage() {
  const navigate = useNavigate();
  const toast = useStore((s) => s.toast);
  const { isConfigured } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!isConfigured) {
      toast('error', 'Supabase가 설정되지 않았습니다. apps/web/.env를 확인해 주세요.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      toast('error', '이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      toast('error', '이름을 입력해 주세요.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        toast('success', '로그인되었습니다.');
      } else {
        const { session } = await signUp({ email: email.trim(), password, name: name.trim() });
        if (!session) {
          // 이메일 인증이 켜져 있는 프로젝트 — 확인 메일 후 로그인 필요
          toast('info', '가입 확인 메일을 보냈어요. 메일 인증 후 로그인해 주세요.');
          setMode('signin');
          return;
        }
        toast('success', '가입이 완료되어 로그인되었습니다.');
      }
      navigate('/caregiver', { replace: true });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '인증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const isSignup = mode === 'signup';

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
            <h1 className="text-2xl font-bold text-slate-900">
              {isSignup ? '요양보호사 회원가입' : '요양보호사 로그인'}
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              담당 어르신과 세션 기록을 관리할 수 있어요.
            </p>
          </div>

          {!isConfigured ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Supabase가 설정되지 않았습니다. <code>apps/web/.env</code>에 URL·publishable 키를
              채워야 로그인할 수 있어요.
            </div>
          ) : null}

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft space-y-4">
            {isSignup ? (
              <Field label="이름" required hint="회원가입 시 계정에 저장됩니다.">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="예: 김복순"
                  autoComplete="name"
                />
              </Field>
            ) : null}
            <Field label="이메일" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="caregiver@example.com"
                autoComplete="email"
              />
            </Field>
            <Field label="비밀번호" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="••••••••"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
              />
            </Field>
            <Button onClick={submit} disabled={loading} className="w-full h-12" size="lg">
              {isSignup ? <UserPlus size={17} /> : <LogIn size={17} />}
              {loading ? '처리 중...' : isSignup ? '회원가입' : '로그인'}
            </Button>
          </div>

          <div className="mt-4 text-sm text-center text-slate-500">
            {isSignup ? '이미 계정이 있으신가요? ' : '아직 계정이 없으신가요? '}
            <button
              type="button"
              onClick={() => setMode(isSignup ? 'signin' : 'signup')}
              className="font-semibold text-warm-700 hover:text-warm-900"
            >
              {isSignup ? '로그인' : '회원가입'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
