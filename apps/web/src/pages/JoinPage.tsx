// 보호자 초대 링크 진입 (/join/:code — T17.7, SCR-W10 연계)
//
// 요양보호사가 발급한 QR(=코드 URL)로 들어오는 화면.
//   - 미로그인: 코드를 스태시하고 소셜 로그인 유도 → 온보딩에서 자동 프리필.
//   - 로그인+보호자(온보딩 완료): 즉시 연결 요청(redeem RPC) → 승인 대기 안내.
//   - 로그인+미온보딩: 코드 스태시 후 온보딩으로.
//   - 로그인+요양보호사: 안내(보호자 계정 전용).

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, HeartHandshake } from 'lucide-react';
import { useRedeemGuardianInvite } from '@giokon/data';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import { Button } from '../components/ui/Button';
import { useAuth } from '../auth/AuthProvider';
import { stashInviteCode } from '../auth/routes';
import { useStore } from '../store/store';

export function JoinPage() {
  const { code = '' } = useParams();
  const normalized = code.trim().toUpperCase();
  const { session, userRow, loading } = useAuth();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const redeem = useRedeemGuardianInvite();
  const attempted = useRef(false);
  const [result, setResult] = useState<'idle' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // 미로그인·미온보딩 대비: 코드를 항상 스태시해 온보딩 프리필로 잇는다.
  useEffect(() => {
    if (normalized) stashInviteCode(normalized);
  }, [normalized]);

  const isOnboardedGuardian = Boolean(
    session && userRow?.onboarded_at && userRow.role === 'guardian',
  );

  // 온보딩 완료 보호자는 접속 즉시 연결 요청.
  useEffect(() => {
    if (!isOnboardedGuardian || attempted.current || !normalized) return;
    attempted.current = true;
    redeem.mutate(
      { code: normalized },
      {
        onSuccess: () => {
          setResult('done');
          toast('success', '연결을 요청했어요. 요양보호사 승인 후 열람할 수 있습니다.');
        },
        onError: (err) => {
          setResult('error');
          setErrorMessage(err.message);
        },
      },
    );
  }, [isOnboardedGuardian, normalized, redeem, toast]);

  if (loading) return null;
  if (!normalized) return <Navigate to="/" replace />;

  // 로그인 상태 분기
  if (session && userRow && !userRow.onboarded_at) {
    return <Navigate to="/onboarding" replace />;
  }
  if (session && userRow?.onboarded_at && userRow.role !== 'guardian') {
    return (
      <JoinShell>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft text-center space-y-4">
          <p className="text-sm text-slate-700" style={{ wordBreak: 'keep-all' }}>
            초대 코드는 <strong>보호자 계정</strong>에서만 사용할 수 있어요. 현재
            요양보호사 계정으로 로그인되어 있습니다.
          </p>
          <Button onClick={() => navigate('/caregiver')} variant="outline" className="w-full">
            요양보호사 화면으로 이동
          </Button>
        </div>
      </JoinShell>
    );
  }

  if (isOnboardedGuardian) {
    return (
      <JoinShell>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft text-center space-y-4">
          {result === 'done' ? (
            <>
              <p className="text-sm text-slate-700" style={{ wordBreak: 'keep-all' }}>
                <strong>연결을 요청했어요.</strong> 요양보호사가 승인하면 어르신의 공개된
                소식을 볼 수 있습니다.
              </p>
              <Button onClick={() => navigate('/guardian')} className="w-full">
                내 화면으로 이동
              </Button>
            </>
          ) : result === 'error' ? (
            <>
              <p className="text-sm text-red-600" style={{ wordBreak: 'keep-all' }}>
                {errorMessage || '연결 요청에 실패했습니다.'}
              </p>
              <Button onClick={() => navigate('/guardian')} variant="outline" className="w-full">
                내 화면으로 이동
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-500">연결 요청 중...</p>
          )}
        </div>
      </JoinShell>
    );
  }

  // 미로그인: 소셜 로그인 유도(코드는 스태시됨 → 온보딩 프리필).
  return (
    <JoinShell>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft">
        <div className="mb-4 rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 text-sm text-violet-800" style={{ wordBreak: 'keep-all' }}>
          초대 코드 <strong className="font-mono tracking-widest">{normalized}</strong> 로
          어르신과 연결합니다. 소셜 계정으로 시작하면 가입 단계에서 코드가 자동
          입력돼요.
        </div>
        <SocialLoginButtons redirectPath="/login" />
      </div>
    </JoinShell>
  );
}

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-rose-50 to-cream-100 flex flex-col">
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
            <div className="inline-flex w-14 h-14 rounded-2xl bg-violet-500 items-center justify-center mb-4 shadow-soft">
              <HeartHandshake size={26} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">보호자 초대</h1>
            <p className="text-sm text-slate-500 mt-1.5" style={{ wordBreak: 'keep-all' }}>
              요양보호사의 초대로 어르신 소식을 함께 볼 수 있어요.
            </p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
