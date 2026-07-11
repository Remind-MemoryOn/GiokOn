// 비밀번호 재설정 — 이메일의 재설정 링크로 진입한다(Supabase recovery 세션 상태).
// 새 비밀번호 확정 후 대시보드로 이동한다.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, KeyRound, ArrowLeft } from 'lucide-react';
import { updatePassword } from '@giokon/data';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/store';
import { useAuth } from '../auth/AuthProvider';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const toast = useStore((s) => s.toast);
  const { session, isConfigured } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (password.length < 8) {
      toast('error', '비밀번호는 8자 이상으로 해주세요.');
      return;
    }
    if (password !== confirm) {
      toast('error', '비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      toast('success', '비밀번호를 변경했습니다.');
      navigate('/caregiver', { replace: true });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-warm-100/40 to-warm-200/30 flex flex-col">
      <header className="px-6 py-5">
        <Link
          to="/caregiver/login"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={15} /> 로그인으로
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-warm-500 items-center justify-center mb-4 shadow-warm">
              <Brain size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">비밀번호 재설정</h1>
            <p className="text-sm text-slate-500 mt-1.5">새로 사용할 비밀번호를 입력해 주세요.</p>
          </div>

          {!isConfigured || !session ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              재설정 링크가 만료되었거나 잘못된 접근입니다. 로그인 화면에서 "비밀번호를
              잊으셨나요?"를 다시 이용해 주세요.
            </div>
          ) : null}

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft space-y-4">
            <Field label="새 비밀번호" required hint="8자 이상">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                autoComplete="new-password"
              />
            </Field>
            <Field label="새 비밀번호 확인" required>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                autoComplete="new-password"
              />
            </Field>
            <Button
              onClick={submit}
              disabled={loading || !session}
              className="w-full h-12"
              size="lg"
            >
              <KeyRound size={17} /> {loading ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
