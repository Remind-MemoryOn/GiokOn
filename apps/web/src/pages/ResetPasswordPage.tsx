// 비밀번호 재설정 (2026-07-23) — 재설정 메일 링크 진입 후 새 비밀번호 설정.
// Supabase 는 링크 진입 시 복구 세션을 만든다(detectSessionInUrl). 그 상태에서
// updateUser({password}) 로 변경한다. 완료 후 로그인으로 이동.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, KeyRound } from 'lucide-react';
import { updatePassword } from '@giokon/data';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/store';
import { isSupabaseConfigured } from '../lib/supabase';

export function ResetPasswordPage() {
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 비밀번호 재설정을 사용할 수 없습니다.');
      return;
    }
    if (password.length < 8) {
      toast('error', '비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      toast('error', '비밀번호가 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      toast('success', '비밀번호를 변경했어요. 새 비밀번호로 로그인해 주세요.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '변경에 실패했습니다. 재설정 링크를 다시 요청해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-warm-100/40 to-warm-200/30 flex flex-col">
      <header className="px-6 py-5">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft size={15} /> 로그인으로
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-warm-500 items-center justify-center mb-4 shadow-warm">
              <Brain size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">새 비밀번호 설정</h1>
            <p className="text-sm text-slate-500 mt-1.5" style={{ wordBreak: 'keep-all' }}>
              메일 링크로 들어오셨다면 새 비밀번호를 설정할 수 있어요.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft space-y-5">
            <Field label="새 비밀번호" required hint="8자 이상 입력해 주세요.">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="새 비밀번호" autoComplete="new-password" />
            </Field>
            <Field label="새 비밀번호 확인" required>
              <Input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="새 비밀번호 다시 입력" autoComplete="new-password" onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </Field>
            <Button onClick={submit} disabled={submitting || !isSupabaseConfigured} className="w-full h-12" size="lg">
              <KeyRound size={16} /> {submitting ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
