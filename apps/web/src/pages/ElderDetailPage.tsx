import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Plus, Smartphone, MessageSquareHeart, Trash2, Clock, Siren,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ElderFormDialog } from '../components/ElderFormDialog';
import { SessionFormDialog } from '../components/SessionFormDialog';
import { ChronicleView } from '../components/ChronicleView';
import { ConsentStatusCard } from '../components/ConsentStatusCard';
import { GuardianAccessCard } from '../components/GuardianAccessCard';
import {
  useProfile, useDeleteProfile, useSafetyEvents, useSessions, toElderProfile,
} from '@giokon/data';
import { useAuth } from '../auth/AuthProvider';
import { useStore } from '../store/store';
import { formatRelative } from '../lib/utils';
import { THERAPY_TYPES, type Session } from '../types';

export function ElderDetailPage() {
  const { elderId = '' } = useParams();
  const navigate = useNavigate();

  const elderQuery = useProfile(elderId);
  const elder = elderQuery.data ? toElderProfile(elderQuery.data) : undefined;
  const allSessions = useStore((s) => s.sessions);
  const sessions = useMemo(
    () =>
      allSessions
        .filter((s) => s.elderId === elderId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [allSessions, elderId]
  );
  const deleteSession = useStore((s) => s.deleteSession);
  const deleteProfile = useDeleteProfile();
  const toast = useStore((s) => s.toast);
  const { isConfigured } = useAuth();

  const safetyEventsQuery = useSafetyEvents(isConfigured ? elderId : undefined);
  // 대화 이력 = 앱이 DB에 기록한 세션(T-E1) — Realtime 으로 실시간 갱신(T-E3).
  const dbSessionsQuery = useSessions(isConfigured ? elderId : undefined);

  const [openEdit, setOpenEdit] = useState(false);
  const [openSession, setOpenSession] = useState(false);
  const [editSession, setEditSession] = useState<Session | null>(null);

  if (elderQuery.isLoading) {
    return (
      <div className="p-8">
        <Button variant="ghost" onClick={() => navigate('/caregiver/elders')}>
          <ArrowLeft size={14} /> 어르신 목록으로
        </Button>
        <Card className="mt-4">
          <CardBody className="py-16 text-center text-slate-500">불러오는 중…</CardBody>
        </Card>
      </div>
    );
  }

  if (!elder) {
    return (
      <div className="p-8">
        <Button variant="ghost" onClick={() => navigate('/caregiver/elders')}>
          <ArrowLeft size={14} /> 어르신 목록으로
        </Button>
        <Card className="mt-4">
          <CardBody className="py-16 text-center text-slate-500">
            존재하지 않는 어르신입니다.
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={elder.name}
        description={`${elder.birthYear}년생 · 만 ${new Date().getFullYear() - elder.birthYear}세`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/caregiver/elders')}>
              <ArrowLeft size={14} /> 목록
            </Button>
            <Button variant="outline" onClick={() => setOpenEdit(true)}>
              <Pencil size={14} /> 연대기 수정
            </Button>
          </>
        }
      />
      <div className="flex-1 px-8 py-6 overflow-y-auto space-y-6">
        {/* 프로필 요약 카드 */}
        <Card>
          <CardBody className="flex flex-col md:flex-row items-start gap-6">
            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-400 mb-0.5">출신지</div>
                <div className="text-slate-800">{elder.hometown || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">직업</div>
                <div className="text-slate-800">{elder.job || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-0.5">보호자</div>
                <div className="text-slate-800">
                  {elder.guardian
                    ? `${elder.guardian.name} (${elder.guardian.relation})`
                    : '—'}
                </div>
              </div>
              <div className="col-span-2 md:col-span-3">
                <div className="text-xs text-slate-400 mb-0.5">가족</div>
                <div className="text-slate-800">{elder.family || '—'}</div>
              </div>
              <div className="col-span-2 md:col-span-3">
                <div className="text-xs text-slate-400 mb-0.5">취미</div>
                <div className="text-slate-800">{elder.hobbies || '—'}</div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 동의 관리 (M9) */}
        <ConsentStatusCard elderId={elderId} elderName={elder.name} />

        {/* 보호자 연결 — 어르신 코드·승인 관리 (SCR-W10) */}
        <GuardianAccessCard elderId={elderId} elderName={elder.name} />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* 세션 영역 */}
          <Card>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">회상 세션 설계</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  설계한 세션은 어르신 앱에서 진행됩니다. 대화 기록은 여기서 확인해요.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEditSession(null);
                  setOpenSession(true);
                }}
              >
                <Plus size={14} /> 세션 설계
              </Button>
            </div>
            <div className="divide-y divide-slate-100 max-h-[440px] overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  설계된 세션이 없습니다. 첫 세션을 만들어보세요.
                </div>
              ) : (
                sessions.map((s) => {
                  const tt = THERAPY_TYPES[s.therapyType];
                  return (
                  <div key={s.id} className="px-5 py-4 group hover:bg-slate-50/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{tt.emoji}</span>
                          <div className="font-semibold text-slate-900">{s.title}</div>
                        </div>
                        {s.note ? (
                          <div className="text-xs text-slate-500 mt-0.5">{s.note}</div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <Badge tone="brand">{tt.label}</Badge>
                          <Badge tone="neutral">
                            <Clock size={10} className="mr-1" /> {s.durationMinutes}분
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Smartphone size={12} /> 앱에서 진행
                        </span>
                        <div className="flex opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => {
                              setEditSession(s);
                              setOpenSession(true);
                            }}
                            className="text-slate-400 hover:text-slate-700 p-1 rounded"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => {
                              deleteSession(s.id);
                              toast('info', '세션을 삭제했습니다.');
                            }}
                            className="text-slate-400 hover:text-red-500 p-1 rounded"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* 연대기 영역 */}
          <ChronicleView elderId={elder.id} />
        </div>

        {/* 세션 이력 — 앱이 DB에 기록한 대화(T-E1), Realtime 반영(T-E3) */}
        <Card>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold flex items-center gap-2">
              <MessageSquareHeart size={16} className="text-brand-500" /> 대화 이력
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              앱에서 진행된 세션이 종료되면 이곳에 실시간으로 나타납니다.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {!isConfigured ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                Supabase 연동 후 앱 대화 기록이 표시됩니다.
              </div>
            ) : dbSessionsQuery.isLoading ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">불러오는 중...</div>
            ) : (dbSessionsQuery.data ?? []).length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                아직 진행한 대화가 없습니다.
              </div>
            ) : (
              (dbSessionsQuery.data ?? []).map((s) => (
                <Link
                  key={s.id}
                  to={`/caregiver/logs/${s.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      회상 대화{s.current_topic ? ` · ${s.current_topic}` : ''}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {formatRelative(s.started_at)} · {s.turn_count}턴
                    </div>
                  </div>
                  <Badge tone={s.status === 'ended' ? 'neutral' : 'success'}>
                    {s.status === 'ended' ? '종료' : '진행 중'}
                  </Badge>
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* 안전 이벤트 이력 (M12) — 발생한 적이 있을 때만 노출 */}
        {isConfigured && safetyEventsQuery.data && safetyEventsQuery.data.length > 0 ? (
          <Card>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold flex items-center gap-2">
                <Siren size={16} className="text-red-500" /> 안전 이벤트 이력
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                대화 중 감지된 위기·관찰 신호입니다. 키워드 기반 안전장치이며 의학적 판단이 아닙니다.
              </p>
            </div>
            <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
              {safetyEventsQuery.data.map((ev) => (
                <div key={ev.id} className="px-5 py-3.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={ev.level === 'crisis' ? 'warning' : 'info'}>
                      {ev.level === 'crisis' ? '위기' : '관찰'}
                    </Badge>
                    <span className="text-xs text-slate-400">{formatRelative(ev.created_at)}</span>
                    {ev.acknowledged_at ? (
                      <Badge tone="success">확인됨</Badge>
                    ) : (
                      <Badge tone="warning">미확인</Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    {ev.caregiver_alert}
                  </div>
                  {ev.excerpt ? (
                    <div className="text-xs text-slate-400 mt-1">발화: “{ev.excerpt}”</div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="pt-2">
          <button
            onClick={() => {
              if (confirm(`'${elder.name}' 어르신과 모든 데이터를 삭제할까요?`)) {
                deleteProfile.mutate(elder.id, {
                  onSuccess: () => {
                    toast('info', '어르신 데이터를 삭제했습니다.');
                    navigate('/caregiver/elders');
                  },
                  onError: (err) =>
                    toast('error', err instanceof Error ? err.message : '삭제에 실패했습니다.'),
                });
              }
            }}
            className="text-xs text-slate-400 hover:text-red-500 transition"
          >
            <Trash2 size={11} className="inline -mt-0.5 mr-1" />이 어르신 삭제
          </button>
        </div>
      </div>

      <ElderFormDialog open={openEdit} onClose={() => setOpenEdit(false)} initial={elder} />
      <SessionFormDialog
        open={openSession}
        onClose={() => setOpenSession(false)}
        elderId={elder.id}
        initial={editSession}
      />
    </>
  );
}
