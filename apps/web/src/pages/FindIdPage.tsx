// 아이디(이메일) 찾기 (2026-07-23) — 이름+전화번호로 마스킹 이메일 조회.
// 서버 RPC find_login_email 이 정확히 1건 일치일 때만 마스킹 이메일을 반환한다.
// (프로덕션은 본인인증(PASS/휴대폰) 게이트 권장 — docs/runbooks 참조.)

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Brain, UserSearch } from 'lucide-react';
import { findLoginEmail } from '@giokon/data';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/store';
import { isSupabaseConfigured } from '../lib/supabase';

export function FindIdPage() {
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ found: boolean; masked?: string } | null>(null);

  async function submit() {
    if (!isSupabaseConfigured) {
      toast('error', 'Supabase가 설정되지 않아 아이디 찾기를 사용할 수 없습니다.');
      return;
    }
    if (!name.trim() || !phone.trim()) {
      toast('error', '이름과 전화번호를 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const masked = await findLoginEmail(name, phone);
      setResult(masked ? { found: true, masked } : { found: false });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '조회에 실패했습니다.');
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
            <h1 className="text-2xl font-bold text-slate-900">아이디(이메일) 찾기</h1>
            <p className="text-sm text-slate-500 mt-1.5" style={{ wordBreak: 'keep-all' }}>
              가입 시 입력한 이름과 전화번호로 이메일 일부를 확인할 수 있어요.
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft space-y-5">
            <Field label="이름" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김복순" autoComplete="name" />
            </Field>
            <Field label="전화번호" required>
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="예: 010-1234-5678" autoComplete="tel" onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </Field>
            <Button onClick={submit} disabled={submitting || !isSupabaseConfigured} className="w-full h-12" size="lg">
              {submitting ? '조회 중...' : '아이디 찾기'}
            </Button>

            {result ? (
              result.found ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
                  <UserSearch size={16} className="shrink-0" />
                  <span>가입된 이메일: <strong className="font-mono">{result.masked}</strong></span>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600" style={{ wordBreak: 'keep-all' }}>
                  일치하는 계정을 찾지 못했어요. 이름·전화번호를 확인하거나 소셜 로그인으로
                  가입했는지 확인해 주세요.
                </div>
              )
            ) : null}

            <div className="text-center text-xs text-slate-500">
              <Link to="/forgot-password" className="hover:text-slate-800">비밀번호 찾기</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
