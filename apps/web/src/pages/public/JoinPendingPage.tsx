// 기관 합류 승인 대기 (파일럿 W9 · D3) — Figma 에 없는 화면
//
// 초대 코드로 가입한 요양보호사는 가입은 끝났지만(onboarded_at) 기관이 없다(org_id NULL). 관리자·센터장이
// approve_org_join 하기 전까지 기관 데이터는 0건이라, 요양보호사 화면으로 보내면 "기록이 없다"로 보인다.
// 그래서 이 화면에만 머물게 한다(CaregiverGuard·routeForUser 가 보낸다).
//
// 시안이 없어 기존 카드·글꼴·색으로 **끊긴 흐름을 잇는 최소 구현**만 한다
// (사용자 확정 2026-09-24 — 시안이 오면 이 화면만 교체).
// 헤더는 감독 화면과 같은 단독 화면 헤더(워드마크 + 로그아웃)다 — 로그인한 사람에게 공개 헤더의
// '로그인/회원가입'을 보이지 않고, 1440 절대좌표가 아니라 휴대폰 폭에서도 잘리지 않는다(2026-09-25).
// ⚠️ 요청자는 기관 이름을 읽을 수 없다(organizations RLS = 소속 기관만). 이름을 지어 보여 주지 않는다.
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { isAwaitingOrgJoin, useCancelOrgJoin, useMyOrgJoinRequests, useRequestOrgJoin } from '@giokon/data';
import { asset } from '../../assets/ui';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../auth/AuthProvider';
import { routeForUser } from '../../auth/routes';
import { useStore } from '../../store/store';
import { orgJoinErrorMessage } from '../../lib/orgJoinErrors';

/** 승인 여부를 다시 확인하는 간격 — 승인되면 users.org_id 가 채워진다. */
const RECHECK_MS = 15_000;

const STATUS_TEXT = {
  pending: {
    title: '기관 합류 승인을 기다리고 있어요',
    body: '기관 관리자나 센터장이 승인하면 바로 이용할 수 있어요. 승인되면 그 기관의 어르신 기록을 함께 보게 됩니다.',
  },
  rejected: {
    title: '합류 요청이 승인되지 않았어요',
    body: '기관 관리자에게 확인한 뒤, 새 초대 코드를 받아 다시 요청해 주세요.',
  },
  cancelled: {
    title: '합류 요청을 취소했어요',
    body: '합류하려면 기관 관리자에게 받은 초대 코드로 다시 요청해 주세요.',
  },
} as const;

export function JoinPendingPage() {
  const { session, userRow, loading, isConfigured, refreshUserRow, signOut } = useAuth();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const awaiting = isAwaitingOrgJoin(userRow);
  const requests = useMyOrgJoinRequests({ enabled: isConfigured && awaiting });
  const requestJoin = useRequestOrgJoin();
  const cancelJoin = useCancelOrgJoin();
  const [code, setCode] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [checking, setChecking] = useState(false);

  const latest = requests.data?.[0] ?? null;
  const pending = latest?.status === 'pending';

  // 대기 중에는 주기적으로 users 행을 다시 읽는다 — 승인되면 org_id 가 생기고 아래 Navigate 가 보낸다.
  useEffect(() => {
    if (!awaiting || !pending) return;
    const id = window.setInterval(() => void refreshUserRow(), RECHECK_MS);
    return () => window.clearInterval(id);
  }, [awaiting, pending, refreshUserRow]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (!awaiting) return <Navigate to={routeForUser(userRow)} replace />;

  async function recheck() {
    setChecking(true);
    try {
      const row = await refreshUserRow();
      await requests.refetch();
      if (!isAwaitingOrgJoin(row)) navigate(routeForUser(row), { replace: true });
      else toast('info', '아직 승인되지 않았어요.');
    } finally {
      setChecking(false);
    }
  }

  async function submitCode() {
    if (!code.trim()) return toast('error', '기관 관리자에게 받은 초대 코드를 입력해 주세요.');
    try {
      await requestJoin.mutateAsync(code);
      setCode('');
      toast('success', '합류를 요청했어요. 승인을 기다려 주세요.');
    } catch (error) {
      toast('error', orgJoinErrorMessage(error, '합류를 요청하지 못했어요.'));
    }
  }

  const text = latest && latest.status !== 'approved' ? STATUS_TEXT[latest.status] : null;

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <header className="sticky top-0 z-10 bg-white shadow-topbar">
        <div className="mx-auto flex h-[64px] w-full max-w-[1100px] items-center justify-between gap-4 px-4">
          {/* 로그인 상태의 로고는 역할별 메인(웹 AGENTS §6.1) — 승인 대기 계정에게는 이 화면이다. */}
          <Link to={routeForUser(userRow)} aria-label="기억온 홈">
            <img src={asset.wordmark} alt="기억온" width={120} height={18} className="block" />
          </Link>
          <button
            type="button"
            onClick={() => void signOut().then(() => navigate('/login', { replace: true }))}
            className="text-w-label font-semibold text-ink-700 underline"
          >
            로그아웃
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[576px] px-4 pb-24 pt-[72px]">
        {!requests.data && !isConfigured ? (
          // Supabase 미설정(.env 없음)에서도 화면은 뜬다 — 상태를 지어내지 않고 안내만.
          <p className="text-w-sub text-ink-700">Supabase 를 연결하면 합류 요청 상태가 표시됩니다.</p>
        ) : requests.isPending ? (
          <p className="text-w-sub text-ink-700">합류 요청 상태를 확인하고 있어요.</p>
        ) : requests.isError ? (
          // 조회 실패를 '요청 없음'으로 보이지 않게 한다.
          <div role="alert" className="rounded-[10px] border border-alert p-6 text-w-sub text-ink-900">
            합류 요청 상태를 불러오지 못했어요. 요청이 없다는 뜻은 아닙니다.
            <button type="button" className="ml-2 font-semibold text-accent underline" onClick={() => void requests.refetch()}>
              다시 확인
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-w-section font-semibold leading-[30px] text-ink-900" style={{ wordBreak: 'keep-all' }}>
              {text?.title ?? '기관 합류가 필요해요'}
            </h1>
            <p className="mt-3 text-w-sub leading-[26px] text-ink-700" style={{ wordBreak: 'keep-all' }}>
              {text?.body ?? '가입은 완료됐어요. 기관 관리자에게 받은 초대 코드로 합류를 요청해 주세요.'}
            </p>

            {latest ? (
              <dl className="mt-8 rounded-[10px] border border-line bg-white px-6 py-5 text-w-sub">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">요청한 날</dt>
                  <dd className="text-ink-900">{new Date(latest.created_at).toLocaleDateString('ko-KR')}</dd>
                </div>
                {latest.decided_at ? (
                  <div className="mt-2 flex justify-between gap-4">
                    <dt className="text-ink-500">{latest.status === 'cancelled' ? '취소한 날' : '처리된 날'}</dt>
                    <dd className="text-ink-900">{new Date(latest.decided_at).toLocaleDateString('ko-KR')}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {pending ? (
              <div className="mt-8 flex flex-col gap-3">
                <Button size="lg" onClick={() => void recheck()} disabled={checking}>
                  {checking ? '확인하는 중...' : '승인 확인'}
                </Button>
                <Button size="lg" variant="outline" onClick={() => setConfirmCancel(true)} disabled={cancelJoin.isPending}>
                  합류 요청 취소
                </Button>
              </div>
            ) : (
              <div className="mt-8">
                <label htmlFor="join-code" className="text-[20px] font-medium leading-[24px] text-ink-900">
                  초대 코드
                </label>
                <input
                  id="join-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="기관 관리자에게 받은 코드"
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-3 h-[57px] w-full rounded-[10px] border border-line bg-white px-[29px] text-w-sub text-ink-700 placeholder:text-ink-500 focus:border-accent focus:outline-none"
                />
                <Button size="lg" className="mt-4 w-full" onClick={() => void submitCode()} disabled={requestJoin.isPending}>
                  {requestJoin.isPending ? '요청하는 중...' : '합류 요청'}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmCancel}
        title="합류 요청을 취소할까요?"
        description="취소하면 새 초대 코드로 다시 요청해야 합니다."
        confirmLabel="요청 취소"
        onClose={() => setConfirmCancel(false)}
        onConfirm={() =>
          cancelJoin.mutate(undefined, {
            onSuccess: () => toast('success', '합류 요청을 취소했어요.'),
            onError: (error) => toast('error', orgJoinErrorMessage(error, '요청을 취소하지 못했어요.')),
          })
        }
      />
    </div>
  );
}
