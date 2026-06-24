import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Plus, Play, MessageSquareHeart, Trash2, Clock,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ElderFormDialog } from '../components/ElderFormDialog';
import { SessionFormDialog } from '../components/SessionFormDialog';
import { ChronicleView } from '../components/ChronicleView';
import { ElderCharacter } from '../components/ElderCharacter';
import { useStore } from '../store/store';
import { formatRelative } from '../lib/utils';
import { THERAPY_TYPES, isDefaultAppearance, type Session } from '../types';

export function ElderDetailPage() {
  const { elderId = '' } = useParams();
  const navigate = useNavigate();

  const elders = useStore((s) => s.elders);
  const elder = useMemo(() => elders.find((e) => e.id === elderId), [elders, elderId]);
  const allSessions = useStore((s) => s.sessions);
  const sessions = useMemo(
    () =>
      allSessions
        .filter((s) => s.elderId === elderId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [allSessions, elderId]
  );
  const allLogs = useStore((s) => s.logs);
  const logs = useMemo(
    () =>
      allLogs
        .filter((l) => l.elderId === elderId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [allLogs, elderId]
  );
  const startConversation = useStore((s) => s.startConversation);
  const deleteSession = useStore((s) => s.deleteSession);
  const deleteElder = useStore((s) => s.deleteElder);
  const toast = useStore((s) => s.toast);

  const [openEdit, setOpenEdit] = useState(false);
  const [openSession, setOpenSession] = useState(false);
  const [editSession, setEditSession] = useState<Session | null>(null);

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

  function startSession(s: Session) {
    const log = startConversation(s.id, elder!.id);
    toast('success', '어르신 화면으로 전환합니다. 기기를 어르신께 전달해 주세요.');
    navigate(`/elder/converse/${log.id}`);
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
            {/* 캐릭터 (요양보호사는 보기만) */}
            <div className="flex flex-col items-center gap-2">
              <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-soft">
                <ElderCharacter appearance={elder.appearance} size={140} />
              </div>
              <div className="text-[11px] text-slate-500 text-center max-w-[140px] leading-relaxed">
                {isDefaultAppearance(elder.appearance)
                  ? '아직 꾸미지 않으셨어요. 어르신이 직접 꾸며보실 거예요.'
                  : '어르신이 직접 꾸민 모습'}
              </div>
            </div>

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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* 세션 영역 */}
          <Card>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">회상 세션</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  설계한 세션을 시작하면 AI가 어르신과 대화를 진행합니다.
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
                        <Button size="sm" onClick={() => startSession(s)}>
                          <Play size={13} /> 시작
                        </Button>
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

        {/* 세션 이력 */}
        <Card>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold flex items-center gap-2">
              <MessageSquareHeart size={16} className="text-brand-500" /> 대화 이력
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              종료된 세션의 대화 전문을 확인하고, 자동 축적된 연대기를 살펴볼 수 있어요.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                아직 진행한 대화가 없습니다.
              </div>
            ) : (
              logs.map((l) => {
                const ses = sessions.find((s) => s.id === l.sessionId);
                return (
                  <Link
                    key={l.id}
                    to={`/caregiver/logs/${l.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {ses?.title || '(삭제된 세션)'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatRelative(l.startedAt)} · {l.turns.length}턴
                        {l.chronicleEntriesAdded.length > 0
                          ? ` · 연대기 +${l.chronicleEntriesAdded.length}`
                          : ''}
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

        <div className="pt-2">
          <button
            onClick={() => {
              if (confirm(`'${elder.name}' 어르신과 모든 데이터를 삭제할까요?`)) {
                deleteElder(elder.id);
                toast('info', '어르신 데이터를 삭제했습니다.');
                navigate('/caregiver/elders');
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
