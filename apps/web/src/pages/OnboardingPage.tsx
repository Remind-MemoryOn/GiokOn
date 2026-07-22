// 온보딩 회원가입 (SCR-W12 — T17.6)
//
// 소셜 로그인(OAuth) 직후 기본정보를 입력받아 계정을 확정한다:
//   이름(소셜 프리필)·전화번호·역할(요양보호사/보호자)
//   요양보호사 → 소속 기관명(신규 기관 생성 + 기관 관리자)
//   보호자     → 어르신 코드(선택 — 없으면 나중에 "어르신 연결"에서 입력 가능)
// 개인정보 수집·이용 동의(필수) 포함. 완료 전에는 데이터 화면 접근 불가(가드).
// 처리는 complete_onboarding RPC(원자적) — 성공 시 역할에 따라 자동 이동.

import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Brain, HeartHandshake, LogOut, UserCheck } from 'lucide-react';
import { completeOnboarding, signOut } from '@giokon/data';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../auth/AuthProvider';
import { routeForUser } from '../auth/routes';
import { useStore } from '../store/store';
import { cn } from '../lib/utils';

type Role = 'caregiver' | 'guardian';

export function OnboardingPage() {
  const { session, user, userRow, loading, isConfigured, refreshUserRow } = useAuth();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();

  const metaName = (user?.user_metadata?.name as string | undefined)?.trim();
  // 사용자가 입력하기 전까지는 소셜 프로필 이름을 그대로 보여준다(effect-setState 회피).
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? metaName ?? '';
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('caregiver');
  const [orgName, setOrgName] = useState('');
  const [elderCode, setElderCode] = useState('');
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [socialAgreed, setSocialAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (userRow?.onboarded_at) return <Navigate to={routeForUser(userRow)} replace />;

  async function submit() {
    if (!isConfigured) return;
    if (!name.trim()) {
      toast('error', '이름을 입력해 주세요.');
      return;
    }
    if (!phone.trim()) {
      toast('error', '전화번호를 입력해 주세요.');
      return;
    }
    if (role === 'caregiver' && !orgName.trim()) {
      toast('error', '소속 기관명을 입력해 주세요.');
      return;
    }
    if (!privacyAgreed || !socialAgreed) {
      toast('error', '필수 동의 항목에 체크해 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      await completeOnboarding({
        name: name.trim(),
        phone: phone.trim(),
        role,
        orgName: role === 'caregiver' ? orgName.trim() : undefined,
        elderCode: role === 'guardian' && elderCode.trim() ? elderCode.trim() : undefined,
      });
      const row = await refreshUserRow();
      toast('success', '가입이 완료되었습니다. 환영합니다!');
      navigate(routeForUser(row), { replace: true });
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '가입 처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelAndLogout() {
    try {
      await signOut();
    } catch {
      /* 로그아웃 실패해도 화면은 이동 */
    }
    navigate('/', { replace: true });
  }

  const roleButton =
    'flex-1 rounded-xl border-2 p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-300';

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-warm-100/40 to-warm-200/30 flex flex-col">
      <header className="px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-warm-500 flex items-center justify-center shadow-warm">
            <Brain size={20} className="text-white" />
          </div>
          <span className="font-semibold text-slate-900">기억온 회원가입</span>
        </div>
        <button
          type="button"
          onClick={cancelAndLogout}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <LogOut size={14} /> 다른 계정으로
        </button>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 py-8">
        <div className="w-full max-w-lg">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-900">기본 정보를 입력해 주세요</h1>
            <p className="text-sm text-slate-500 mt-1.5" style={{ wordBreak: 'keep-all' }}>
              소셜 로그인은 완료됐어요. 서비스 이용에 필요한 정보만 확인합니다.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-soft space-y-5">
            {/* 역할 선택 */}
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">
                어떤 역할로 이용하시나요? <span className="text-red-500">*</span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRole('caregiver')}
                  className={cn(
                    roleButton,
                    role === 'caregiver'
                      ? 'border-warm-500 bg-warm-50'
                      : 'border-slate-200 bg-white hover:border-warm-300',
                  )}
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                    <UserCheck size={16} className="text-warm-600" /> 요양보호사
                  </div>
                  <div className="text-xs text-slate-500 mt-1" style={{ wordBreak: 'keep-all' }}>
                    어르신·세션·일지를 관리해요. 새 기관이 만들어집니다.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('guardian')}
                  className={cn(
                    roleButton,
                    role === 'guardian'
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-slate-200 bg-white hover:border-violet-300',
                  )}
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                    <HeartHandshake size={16} className="text-violet-600" /> 보호자
                  </div>
                  <div className="text-xs text-slate-500 mt-1" style={{ wordBreak: 'keep-all' }}>
                    공개된 부모님 소식을 확인해요. 어르신 코드로 연결합니다.
                  </div>
                </button>
              </div>
            </div>

            <Field label="이름" required hint="소셜 계정 이름이 자동 입력됩니다.">
              <Input
                value={name}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="예: 김복순"
                autoComplete="name"
              />
            </Field>

            <Field label="전화번호" required hint="긴급 연락·계정 확인에만 사용됩니다.">
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="예: 010-1234-5678"
                autoComplete="tel"
              />
            </Field>

            {role === 'caregiver' ? (
              <Field label="소속 기관명" required hint="기관(요양원·복지관) 이름으로 새 기관이 생성되고, 기관 관리자가 됩니다.">
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="예: 햇살 요양원"
                />
              </Field>
            ) : (
              <Field
                label="어르신 코드 (선택)"
                hint="요양보호사에게 받은 어르신 코드를 입력하면 연결 요청까지 함께 진행됩니다. 나중에 '어르신 연결'에서 입력해도 돼요."
              >
                <Input
                  value={elderCode}
                  onChange={(e) => setElderCode(e.target.value.toUpperCase())}
                  placeholder="예: AB12CD34"
                  className="font-mono tracking-widest"
                />
              </Field>
            )}

            {/* 동의 (필수) */}
            <div className="space-y-2.5 rounded-xl bg-slate-50 border border-slate-200 p-4">
              <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyAgreed}
                  onChange={(e) => setPrivacyAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-warm-600"
                />
                <span style={{ wordBreak: 'keep-all' }}>
                  <strong>[필수]</strong> 개인정보 수집·이용에 동의합니다.{' '}
                  <Link to="/privacy" target="_blank" className="underline underline-offset-2 text-slate-500 hover:text-slate-800">
                    처리방침 보기
                  </Link>
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={socialAgreed}
                  onChange={(e) => setSocialAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-warm-600"
                />
                <span style={{ wordBreak: 'keep-all' }}>
                  <strong>[필수]</strong> 소셜 계정(구글·카카오·네이버)에서 이메일·이름을
                  제공받는 것을 확인했습니다. 비밀번호는 저장되지 않습니다.
                </span>
              </label>
            </div>

            <Button onClick={submit} disabled={submitting || !isConfigured} className="w-full h-12" size="lg">
              {submitting ? '처리 중...' : '가입 완료'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
