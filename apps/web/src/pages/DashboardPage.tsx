import { Link } from 'react-router-dom';
import { Users, FileText, BookOpenCheck, Sparkles, MessageSquareHeart, ArrowRight } from 'lucide-react';
import { useProfiles, useSessionCounts, useChronicleCounts, toElderProfile } from '@giokon/data';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/store';
import { formatRelative } from '../lib/utils';

export function DashboardPage() {
  const profilesQuery = useProfiles();
  const sessionCounts = useSessionCounts();
  const chronicleCounts = useChronicleCounts();
  const logs = useStore((s) => s.logs); // 최근 대화는 Phase E(세션/AI) 배선 전까지 store

  const elders = (profilesQuery.data ?? []).map(toElderProfile);
  const recentLogs = logs.slice(0, 5);

  const stats = [
    { label: '등록 어르신', value: elders.length, icon: Users, tone: 'text-brand-600 bg-brand-50' },
    { label: '준비된 세션', value: sessionCounts.data?.total ?? 0, icon: BookOpenCheck, tone: 'text-sky-600 bg-sky-50' },
    { label: '연대기 항목', value: chronicleCounts.data?.total ?? 0, icon: FileText, tone: 'text-emerald-600 bg-emerald-50' },
    { label: 'AI 자동 축적', value: chronicleCounts.data?.aiTotal ?? 0, icon: Sparkles, tone: 'text-purple-600 bg-purple-50' },
  ];

  return (
    <>
      <PageHeader
        title="대시보드"
        description="기억온은 요양보호사가 설계한 세션을 AI가 어르신과 대화로 진행하고, 그 대화에서 새로운 연대기를 스스로 모아갑니다."
      />
      <div className="flex-1 px-8 py-6 space-y-6 overflow-y-auto">
        {/* 시연 안내 */}
        <div className="rounded-2xl bg-gradient-to-r from-brand-50 via-amber-50 to-rose-50 border border-brand-100 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-500 text-white flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="text-sm">
            <div className="font-semibold text-slate-900">두 가지 화면으로 구성됩니다.</div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              지금 보고 계신 화면은 <strong>요양보호사용 관리 화면</strong>이에요. 세션 <strong>시작</strong> 버튼을 누르면 어르신용 큰 화면으로 전환됩니다. 실제 시연에서는 <strong>태블릿(아이패드/갤탭) 가로 모드</strong>를 권장합니다.
            </p>
          </div>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardBody className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.tone}`}>
                  <s.icon size={20} />
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums">{s.value}</div>
                  <div className="text-xs text-slate-500">{s.label}</div>
                </div>
              </CardBody>
            </Card>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <div className="p-5 flex items-center justify-between border-b border-slate-100">
              <div>
                <h2 className="font-semibold">담당 어르신</h2>
                <p className="text-xs text-slate-500 mt-0.5">탭하여 세션을 시작하거나 연대기를 확인하세요.</p>
              </div>
              <Link to="/caregiver/elders">
                <Button variant="ghost" size="sm">전체 보기 <ArrowRight size={14} /></Button>
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {elders.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  아직 등록된 어르신이 없습니다.
                </div>
              ) : (
                elders.slice(0, 4).map((e) => {
                  const sessCount = sessionCounts.data?.byProfile[e.id] ?? 0;
                  const chrCount = chronicleCounts.data?.byProfile[e.id] ?? 0;
                  return (
                    <Link
                      key={e.id}
                      to={`/caregiver/elders/${e.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition group"
                    >
                      <Avatar name={e.name} color={e.avatarColor} size="lg" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-slate-900">{e.name}</div>
                          <span className="text-xs text-slate-500">{e.birthYear}년생</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">
                          {e.hometown ? `${e.hometown} · ` : ''}{e.job || '직업 정보 없음'}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Badge tone="brand">세션 {sessCount}</Badge>
                          <Badge tone="success">연대기 {chrCount}</Badge>
                        </div>
                      </div>
                      <ArrowRight
                        size={16}
                        className="text-slate-300 group-hover:text-slate-600 transition"
                      />
                    </Link>
                  );
                })
              )}
            </div>
          </Card>

          <Card>
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-semibold flex items-center gap-2">
                <MessageSquareHeart size={16} className="text-brand-500" />
                최근 대화
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">AI가 진행한 회상 세션</p>
            </div>
            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
              {recentLogs.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  아직 진행한 세션이 없습니다.
                </div>
              ) : (
                recentLogs.map((l) => {
                  const elder = elders.find((e) => e.id === l.elderId);
                  return (
                    <Link
                      key={l.id}
                      to={`/caregiver/logs/${l.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition"
                    >
                      <Avatar name={elder?.name || '?'} color={elder?.avatarColor} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{elder?.name || '알 수 없음'}</div>
                        <div className="text-xs text-slate-500">
                          {formatRelative(l.startedAt)} · {l.turns.length}턴
                        </div>
                      </div>
                      <Badge tone={l.status === 'ended' ? 'neutral' : 'success'}>
                        {l.status === 'ended' ? '종료' : '진행 중'}
                      </Badge>
                    </Link>
                  );
                })
              )}
            </div>
          </Card>
        </section>
      </div>
    </>
  );
}
