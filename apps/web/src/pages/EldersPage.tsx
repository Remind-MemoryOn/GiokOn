import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Plus, Users, ArrowRight } from 'lucide-react';
import {
  useProfiles,
  useSessionCounts,
  useChronicleCounts,
  useClaimElderByCode,
  useCurrentUser,
  useMyPendingAssignments,
  useRecentSessions,
  toElderProfile,
} from '@giokon/data';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ElderFormDialog } from '../components/ElderFormDialog';
import { useAuth } from '../auth/AuthProvider';
import { useStore } from '../store/store';
import { formatRelative } from '../lib/utils';

export function EldersPage() {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const profilesQuery = useProfiles();
  const sessionCounts = useSessionCounts();
  const chronicleCounts = useChronicleCounts();
  // 최근 대화 시각 표시용 — 앱이 DB에 기록한 세션(T-E1).
  const recentSessions = useRecentSessions({ limit: 100, enabled: isConfigured });
  const elders = (profilesQuery.data ?? []).map(toElderProfile);
  const claim = useClaimElderByCode();
  const currentUser = useCurrentUser();
  const myPending = useMyPendingAssignments(isConfigured ? currentUser.data?.id : undefined);
  const pendingCount = myPending.data?.length ?? 0;

  const [openNew, setOpenNew] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimCode, setClaimCode] = useState('');

  function submitClaim() {
    const trimmed = claimCode.trim().toUpperCase();
    if (!trimmed) {
      toast('error', '어르신 코드를 입력해 주세요.');
      return;
    }
    claim.mutate(
      { code: trimmed },
      {
        onSuccess: () => {
          setClaimCode('');
          setClaimOpen(false);
          toast('success', '담당 어르신으로 추가했어요. 기존 기록을 그대로 이어받습니다.');
        },
        onError: (err) => toast('error', err.message),
      },
    );
  }

  return (
    <>
      <PageHeader
        title="어르신 관리"
        description="연대기를 등록해 두면 AI가 그 정보를 바탕으로 대화를 이어갑니다."
        actions={
          <>
            <Button variant="outline" onClick={() => setClaimOpen((v) => !v)}>
              <KeyRound size={16} /> 코드로 담당 추가
            </Button>
            <Button onClick={() => setOpenNew(true)}>
              <Plus size={16} /> 새 어르신 등록
            </Button>
          </>
        }
      />
      <div className="flex-1 px-8 py-6 overflow-y-auto">
        {claimOpen ? (
          <Card className="mb-4">
            <CardBody className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <KeyRound size={15} className="text-warm-600" /> 어르신 코드로 담당 추가
                </div>
                <p className="text-xs text-slate-500 mt-0.5" style={{ wordBreak: 'keep-all' }}>
                  이전 담당 요양보호사에게 받은 어르신 코드를 입력하면, 새로 만들지 않고
                  기존 어르신·연대기·세션·일지를 그대로 이어받아요.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && submitClaim()}
                  placeholder="예: K7M2Q9RXTV"
                  className="font-mono tracking-widest w-40"
                />
                <Button onClick={submitClaim} disabled={claim.isPending} className="shrink-0">
                  {claim.isPending ? '추가 중...' : '담당 추가'}
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}
        {pendingCount > 0 ? (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800" style={{ wordBreak: 'keep-all' }}>
            기관 합류 승인 대기 중이에요 ({pendingCount}건). 기관 담당자가 승인하면 담당
            어르신의 기록을 볼 수 있어요.
          </div>
        ) : null}
        {profilesQuery.isLoading ? (
          <Card>
            <CardBody className="py-16 text-center text-sm text-slate-500">불러오는 중…</CardBody>
          </Card>
        ) : profilesQuery.isError ? (
          <Card>
            <CardBody className="py-16 text-center text-sm text-red-500">
              어르신 목록을 불러오지 못했습니다.
            </CardBody>
          </Card>
        ) : elders.length === 0 ? (
          <Card>
            <CardBody className="text-center py-16">
              <div className="inline-flex w-14 h-14 rounded-2xl bg-slate-100 items-center justify-center text-slate-400 mb-4">
                <Users size={26} />
              </div>
              <div className="font-semibold mb-1">아직 등록된 어르신이 없어요.</div>
              <div className="text-sm text-slate-500 mb-5">
                연대기를 등록하면 AI가 어르신께 맞춤 회상 대화를 건넵니다.
              </div>
              <Button onClick={() => setOpenNew(true)}>
                <Plus size={16} /> 첫 어르신 등록하기
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {elders.map((e) => {
              const sessCount = sessionCounts.data?.byProfile[e.id] ?? 0;
              const chrCount = chronicleCounts.data?.byProfile[e.id] ?? 0;
              const lastSession = (recentSessions.data ?? []).find((s) => s.profile_id === e.id);
              return (
                <Link key={e.id} to={`/caregiver/elders/${e.id}`} className="group">
                  <Card className="hover:shadow-md hover:border-brand-200 transition group-hover:-translate-y-0.5 duration-150">
                    <CardBody className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.name} color={e.avatarColor} size="xl" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-base text-slate-900">{e.name}</div>
                          <div className="text-xs text-slate-500">{e.birthYear}년생 · 만 {new Date().getFullYear() - e.birthYear}세</div>
                        </div>
                        <ArrowRight
                          size={16}
                          className="text-slate-300 group-hover:text-brand-500 transition"
                        />
                      </div>
                      <dl className="space-y-1 text-xs">
                        {e.hometown ? (
                          <div className="flex gap-2"><dt className="text-slate-400 w-12 shrink-0">출신지</dt><dd className="text-slate-700">{e.hometown}</dd></div>
                        ) : null}
                        {e.job ? (
                          <div className="flex gap-2"><dt className="text-slate-400 w-12 shrink-0">직업</dt><dd className="text-slate-700 truncate">{e.job}</dd></div>
                        ) : null}
                        {e.family ? (
                          <div className="flex gap-2"><dt className="text-slate-400 w-12 shrink-0">가족</dt><dd className="text-slate-700 truncate">{e.family}</dd></div>
                        ) : null}
                      </dl>
                      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                        <Badge tone="brand">세션 {sessCount}</Badge>
                        <Badge tone="success">연대기 {chrCount}</Badge>
                        {lastSession ? (
                          <span className="ml-auto text-[11px] text-slate-400">
                            최근 대화 {formatRelative(lastSession.started_at)}
                          </span>
                        ) : null}
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <ElderFormDialog open={openNew} onClose={() => setOpenNew(false)} />
    </>
  );
}
