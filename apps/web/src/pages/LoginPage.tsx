// 통합 로그인 (SCR-W05 — T17.4·T17.5)
//
// 소셜 3종(구글·카카오·네이버) 단일 진입. OAuth 가 로그인·회원가입을 겸한다.
// 세션이 있으면 역할에 따라 자동 이동: 미온보딩 → /onboarding,
// guardian → /guardian, 그 외 → /caregiver. 이메일/비밀번호 로그인은 제거됨.

import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Brain } from 'lucide-react';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import { useAuth } from '../auth/AuthProvider';
import { routeForUser } from '../auth/routes';

export function LoginPage() {
  const { session, userRow, loading } = useAuth();

  if (loading) return null; // 세션·역할 판별 중 — 깜빡임 방지
  if (session) return <Navigate to={routeForUser(userRow)} replace />;

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
              소셜 계정으로 시작하세요. 처음이시면 로그인 후 기본 정보를 입력하는
              회원가입이 이어집니다.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft">
            <SocialLoginButtons />
          </div>

          <div className="mt-5 rounded-xl bg-white/70 border border-warm-200 px-4 py-3 text-xs text-slate-600 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
            <strong>보호자이신가요?</strong> 요양보호사에게 받은 초대 코드(QR)가 있다면,
            로그인 후 회원가입 단계에서 입력하거나 QR 링크로 바로 접속하세요.
          </div>

          <div className="mt-6 text-[11px] text-center text-slate-400 space-x-3">
            <Link to="/privacy" className="hover:text-slate-600">개인정보 처리방침</Link>
            <Link to="/terms" className="hover:text-slate-600">이용약관</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
