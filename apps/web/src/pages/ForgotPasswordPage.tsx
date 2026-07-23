// 비밀번호 찾기 (2026-07-23) — 이메일로 재설정 링크 발송(Supabase Auth).
// 실제 메일 발송은 Supabase 프로젝트 SMTP 설정 후 동작(docs/runbooks 참조).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Brain, Mail } from 'lucide-react';
import { sendPasswordResetEmail } from '@giokon/data';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/store';
import { isSupabaseConfigured } from '../lib/supabase';

export function ForgotPasswordPage() {
  const toast = useStore((s) => s.toast);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 비밀번호 찾기를 사용할 수 없습니다.');
      return;
    }
    if (!email.trim()) {
      toast('error', '이메일을 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(email, `${window.location.origin}/reset-password`);
      setSent(true);
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '메일 발송에 실패했습니다.');
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
            <h1 className="text-2xl font-bold text-slate-900">비밀번호 찾기</h1>
            <p className="text-sm text-slate-500 mt-1.5" style={{ wordBreak: 'keep-all' }}>
              가입한 이메일로 비밀번호 재설정 링크를 보내드려요.
            </p>
          </div>
          {sent ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft text-center space-y-3">
              <div className="inline-flex w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 items-center justify-center">
                <Mail size={22} />
              </div>
              <h2 className="text-lg font-bold text-slate-900">재설정 메일을 보냈어요</h2>
              <p className="text-sm text-slate-600" style={{ wordBreak: 'keep-all' }}>
                <strong>{email}</strong> 로 보낸 메일의 링크를 눌러 새 비밀번호를 설정해 주세요.
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full">로그인으로 돌아가기</Button>
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft space-y-5">
              <Field label="이메일 (아이디)" required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="예: caregiver@example.com" autoComplete="email" onKeyDown={(e) => e.key === 'Enter' && submit()} />
              </Field>
              <Button onClick={submit} disabled={submitting || !isSupabaseConfigured} className="w-full h-12" size="lg">
                {submitting ? '보내는 중...' : '재설정 메일 보내기'}
              </Button>
              <div className="text-center text-xs text-slate-500">
                <Link to="/find-id" className="hover:text-slate-800">아이디(이메일) 찾기</Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
