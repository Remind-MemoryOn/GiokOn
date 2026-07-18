// 보호자 대시보드 (SCR-W09 기반 골격 — T17.3·T17.7 / Phase W1)
//
// 실계정(role=guardian) 전용. 연결(승인)된 어르신 목록 + "어르신 연결"(초대
// 코드 입력 — 가입 시와 동일한 redeem RPC 재사용) + 승인 대기 안내를 담는다.
// 공개(커밋)된 일지·분석 타임라인은 Phase W5(guardian_shares)에서 이 화면에
// 추가된다. RLS: 보호자는 승인된 연결의 어르신 기본정보만 SELECT 가능.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, HeartHandshake, Hourglass, LogOut, Plus } from 'lucide-react';
import {
  signOut,
  toElderProfile,
  useMyGuardianLinks,
  useProfiles,
  useRedeemGuardianInvite,
} from '@giokon/data';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../auth/AuthProvider';
import { useStore } from '../store/store';

export function GuardianDashboardPage() {
  const { userRow, isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();

  const links = useMyGuardianLinks({ enabled: isConfigured });
  const profiles = useProfiles(); // RLS: 승인된 연결 어르신만 반환된다.
  const redeem = useRedeemGuardianInvite();
  const [code, setCode] = useState('');

  const approved = (links.data ?? []).filter((l) => l.status === 'approved');
  const pending = (links.data ?? []).filter((l) => l.status === 'pending');
  const elderById = new Map(
    (profiles.data ?? []).map((row) => {
      const elder = toElderProfile(row);
      return [elder.id, elder] as const;
    }),
  );

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      /* 로그아웃 실패해도 화면은 이동 */
    }
    navigate('/', { replace: true });
  }

  function connect() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      toast('error', '초대 코드를 입력해 주세요.');
      return;
    }
    redeem.mutate(
      { code: trimmed },
      {
        onSuccess: () => {
          setCode('');
          toast('success', '연결을 요청했어요. 요양보호사 승인 후 열람할 수 있습니다.');
        },
        onError: (err) => toast('error', err.message),
      },
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-rose-50 to-cream-100">
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-violet-500 flex items-center justify-center shadow-soft">
            <Brain size={20} className="text-white" />
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900">기억온</div>
            <div className="text-[11px] text-violet-700">보호자 화면</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600 hidden sm:inline">
            {userRow?.name ?? '보호자'} 님
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <LogOut size={15} /> 로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 pb-16 space-y-5">
        {!isConfigured ? (
          <Card>
            <CardBody className="text-sm text-amber-800 bg-amber-50 rounded-2xl">
              Supabase 연동 후 이용할 수 있는 화면입니다.
            </CardBody>
          </Card>
        ) : (
          <>
            {/* 연결된 어르신 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HeartHandshake size={17} className="text-violet-600" /> 연결된 어르신
                </CardTitle>
                <CardDescription>
                  요양보호사가 공개한 소식만 표시됩니다. 자세한 공개 항목은 곧 이곳에서
                  확인할 수 있어요.
                </CardDescription>
              </CardHeader>
              <CardBody>
                {links.isLoading || profiles.isLoading ? (
                  <div className="text-sm text-slate-500 py-4 text-center">불러오는 중...</div>
                ) : approved.length === 0 ? (
                  <div className="text-sm text-slate-500 py-6 text-center" style={{ wordBreak: 'keep-all' }}>
                    아직 연결된 어르신이 없어요. 아래에서 초대 코드로 연결해 보세요.
                  </div>
                ) : (
                  <ul className="space-y-2.5">
                    {approved.map((link) => {
                      const elder = elderById.get(link.profile_id);
                      return (
                        <li
                          key={link.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5"
                        >
                          <Avatar
                            name={elder?.name ?? '어르신'}
                            color={elder?.avatarColor ?? '#8b5cf6'}
                            size="md"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 text-sm">
                              {elder?.name ?? '어르신'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {elder ? `${elder.birthYear}년생` : '정보 조회 중'}
                            </div>
                          </div>
                          <Badge tone="success">연결됨</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {pending.length > 0 ? (
                  <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
                    <Hourglass size={15} />
                    승인 대기 중인 연결 {pending.length}건 — 요양보호사 승인 후 표시됩니다.
                  </div>
                ) : null}
              </CardBody>
            </Card>

            {/* 어르신 연결 (초대 코드) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus size={17} className="text-violet-600" /> 어르신 연결
                </CardTitle>
                <CardDescription>
                  요양보호사에게 받은 초대 코드(QR)를 입력하세요. 승인 후 소식을 볼 수
                  있어요.
                </CardDescription>
              </CardHeader>
              <CardBody className="flex gap-2.5">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && connect()}
                  placeholder="예: AB12CD34"
                  className="font-mono tracking-widest"
                />
                <Button onClick={connect} disabled={redeem.isPending} className="shrink-0">
                  {redeem.isPending ? '요청 중...' : '연결 요청'}
                </Button>
              </CardBody>
            </Card>
          </>
        )}

        <footer className="pt-4 text-center text-[11px] text-slate-400 space-x-3">
          <Link to="/privacy" className="hover:text-slate-600">개인정보 처리방침</Link>
          <Link to="/terms" className="hover:text-slate-600">이용약관</Link>
        </footer>
      </main>
    </div>
  );
}
