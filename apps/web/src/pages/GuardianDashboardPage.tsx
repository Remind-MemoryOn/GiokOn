// 보호자 대시보드 (SCR-W09 기반 골격 — T17.3·T17.7 / Phase W1)
//
// 실계정(role=guardian) 전용. 연결(승인)된 어르신 목록 + "어르신 연결"(초대
// 코드 입력 — 가입 시와 동일한 link RPC 재사용) + 승인 대기 안내를 담는다.
// 공개(커밋)된 일지·분석 타임라인은 Phase W5(guardian_shares)에서 이 화면에
// 추가된다. RLS: 보호자는 승인된 연결의 어르신 기본정보만 SELECT 가능.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, HeartHandshake, Hourglass, LogOut, Newspaper, NotebookPen, Plus } from 'lucide-react';
import {
  parseSessionAnalysis,
  signOut,
  toElderProfile,
  useGiokonRealtime,
  useMyGuardianLinks,
  useMySharedContent,
  useProfiles,
  useLinkGuardianByElderCode,
} from '@giokon/data';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { AnalysisSummary } from '../components/AnalysisSummary';
import { AgentPanel } from '../components/AgentPanel';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../auth/AuthProvider';
import { useStore } from '../store/store';
import { formatKoreanDateTime } from '../lib/utils';

export function GuardianDashboardPage() {
  const { userRow, isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();

  const links = useMyGuardianLinks({ enabled: isConfigured });
  const profiles = useProfiles(); // RLS: 승인된 연결 어르신만 반환된다.
  const shared = useMySharedContent({ enabled: isConfigured });
  const linkMutation = useLinkGuardianByElderCode();
  const [code, setCode] = useState('');

  // 공개/철회가 즉시 반영되도록 실시간 구독(T-E3).
  useGiokonRealtime({ enabled: isConfigured, tables: ['guardian_shares'] });

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
      toast('error', '어르신 코드를 입력해 주세요.');
      return;
    }
    linkMutation.mutate(
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
                    아직 연결된 어르신이 없어요. 아래에서 어르신 코드로 연결해 보세요.
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

            {/* 공개된 소식 타임라인 (SCR-W09 — 커밋된 데이터만, RLS 강제) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Newspaper size={17} className="text-violet-600" /> 공개된 소식
                </CardTitle>
                <CardDescription>
                  요양보호사가 공개한 일지와 대화 관찰 요약입니다. 실시간으로 갱신돼요.
                </CardDescription>
              </CardHeader>
              <CardBody>
                {shared.isLoading ? (
                  <div className="text-sm text-slate-500 py-4 text-center">불러오는 중...</div>
                ) : (shared.data?.shares.length ?? 0) === 0 ? (
                  <div className="text-sm text-slate-500 py-6 text-center" style={{ wordBreak: 'keep-all' }}>
                    아직 공개된 소식이 없어요. 요양보호사가 공개하면 이곳에 나타납니다.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {(shared.data?.shares ?? []).map((s) => {
                      const elder = elderById.get(s.profile_id);
                      if (s.item_type === 'journal') {
                        const journal = shared.data?.journals.find((j) => j.id === s.item_id);
                        if (!journal) return null;
                        return (
                          <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center gap-2 mb-1.5">
                              <NotebookPen size={14} className="text-warm-600" />
                              <span className="text-sm font-semibold text-slate-900">
                                {elder?.name ?? '어르신'} · {journal.journal_date} 요양일지
                              </span>
                              <span className="ml-auto text-[11px] text-slate-400">
                                {formatKoreanDateTime(s.shared_at)} 공개
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed" style={{ wordBreak: 'keep-all' }}>
                              {journal.content}
                            </p>
                          </li>
                        );
                      }
                      if (s.item_type === 'analysis') {
                        const analysis = shared.data?.analyses.find((a) => a.id === s.item_id);
                        const parsed = analysis ? parseSessionAnalysis(analysis) : null;
                        if (!parsed) return null;
                        return (
                          <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Brain size={14} className="text-violet-600" />
                              <span className="text-sm font-semibold text-slate-900">
                                {elder?.name ?? '어르신'} · 대화 관찰 요약
                              </span>
                              <span className="ml-auto text-[11px] text-slate-400">
                                {formatKoreanDateTime(s.shared_at)} 공개
                              </span>
                            </div>
                            <AnalysisSummary analysis={parsed} compact />
                          </li>
                        );
                      }
                      return null;
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>

            {/* 어르신 연결 (어르신 코드) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus size={17} className="text-violet-600" /> 어르신 연결
                </CardTitle>
                <CardDescription>
                  요양보호사에게 받은 어르신 코드를 입력하세요. 승인 후 소식을 볼 수
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
                <Button onClick={connect} disabled={linkMutation.isPending} className="shrink-0">
                  {linkMutation.isPending ? '요청 중...' : '연결 요청'}
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

      {/* 보호자 설명 에이전트 (SCR-W11 — 커밋된 데이터만 근거, 관찰 지표 언어) */}
      <AgentPanel role="guardian" />
    </div>
  );
}
