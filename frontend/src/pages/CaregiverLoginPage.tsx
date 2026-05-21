import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brain, ArrowLeft, LogIn } from 'lucide-react';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/store';

export function CaregiverLoginPage() {
  const navigate = useNavigate();
  const login = useStore((s) => s.login);
  const toast = useStore((s) => s.toast);

  const [email, setEmail] = useState('caregiver@gieok.on');
  const [password, setPassword] = useState('demo1234');
  const [name, setName] = useState('김복순');
  const [loading, setLoading] = useState(false);

  function submit() {
    if (!email.trim() || !password.trim()) {
      toast('error', '이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      login(name || '요양보호사');
      toast('success', `${name || '요양보호사'} 님, 환영합니다.`);
      navigate('/caregiver', { replace: true });
    }, 500);
  }

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
            <h1 className="text-2xl font-bold text-slate-900">요양보호사 로그인</h1>
            <p className="text-sm text-slate-500 mt-1.5">
              담당 어르신과 세션 기록을 관리할 수 있어요.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft space-y-4">
            <Field label="이메일" required>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="caregiver@gieok.on"
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
                autoComplete="current-password"
              />
            </Field>
            <Field label="표시 이름" hint="시연용 — 사이드바에 표시됩니다.">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="예: 김복순"
              />
            </Field>
            <Button
              onClick={submit}
              disabled={loading}
              className="w-full h-12"
              size="lg"
            >
              <LogIn size={17} /> {loading ? '로그인 중...' : '로그인'}
            </Button>
          </div>

          <div className="mt-4 text-xs text-center text-slate-500">
            시연 모드 — 어떤 값을 입력해도 로그인됩니다.
          </div>
        </div>
      </main>
    </div>
  );
}
