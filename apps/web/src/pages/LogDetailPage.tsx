// 세션 기록 상세 (Phase W2 — DB 배선)
//
// 세션 메타(sessions) + 대화 전문(session_logs)을 DB 에서 조회해 렌더한다.
// AI 발화·요약은 AI 생성물 표시(AI기본법 투명성). 세션 자동 분석 카드는
// Phase W3(session_analyses)에서 이 화면에 추가된다.

import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  parseSessionAnalysis,
  useProfile,
  useSession,
  useSessionAnalysisBySession,
  useSessionLogs,
  toConversationTurn,
  toElderProfile,
} from '@giokon/data';
import { PageHeader } from '../components/PageHeader';
import { AnalysisSummary } from '../components/AnalysisSummary';
import { Card, CardBody } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useAuth } from '../auth/AuthProvider';
import { formatKoreanDateTime } from '../lib/utils';
import { cn } from '../lib/utils';

export function LogDetailPage() {
  const { logId = '' } = useParams();
  const navigate = useNavigate();
  const { isConfigured } = useAuth();

  const sessionQuery = useSession(isConfigured ? logId : undefined);
  const logsQuery = useSessionLogs(isConfigured ? logId : undefined);
  const analysisQuery = useSessionAnalysisBySession(isConfigured ? logId : undefined);
  const session = sessionQuery.data ?? null;
  const profileQuery = useProfile(session?.profile_id);
  const elder = profileQuery.data ? toElderProfile(profileQuery.data) : undefined;

  if (!isConfigured) {
    return (
      <NotFoundShell onBack={() => navigate('/caregiver/logs')}>
        Supabase 연동 후 앱 대화 기록을 볼 수 있습니다.
      </NotFoundShell>
    );
  }

  if (sessionQuery.isLoading || (session && profileQuery.isLoading)) {
    return (
      <NotFoundShell onBack={() => navigate('/caregiver/logs')}>불러오는 중...</NotFoundShell>
    );
  }

  if (!session) {
    return (
      <NotFoundShell onBack={() => navigate('/caregiver/logs')}>
        존재하지 않는 세션입니다.
      </NotFoundShell>
    );
  }

  const turns = (logsQuery.data ?? []).map(toConversationTurn);
  const durationMin = session.ended_at
    ? Math.max(
        1,
        Math.round(
          (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000,
        ),
      )
    : null;

  return (
    <>
      <PageHeader
        title="세션 기록"
        description={`${elder?.name ?? '어르신'} · ${formatKoreanDateTime(session.started_at)}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/caregiver/logs')}>
              <ArrowLeft size={14} /> 목록
            </Button>
            {elder ? (
              <Link to={`/caregiver/elders/${elder.id}`}>
                <Button variant="outline">어르신 상세</Button>
              </Link>
            ) : null}
          </>
        }
      />
      <div className="flex-1 px-8 py-6 overflow-y-auto space-y-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">활동 종류:</span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
            🌸 회상 대화{session.current_topic ? ` · ${session.current_topic}` : ''}
          </span>
          {/* 생성물 표시 — AI기본법 투명성 */}
          <Badge tone="info" className="ml-auto">AI 질문·요약은 AI가 생성한 내용입니다</Badge>
        </div>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="대화 턴" value={session.turn_count || turns.length} />
          <SummaryCard label="진행 시간" value={durationMin ? `${durationMin}분` : '진행 중'} />
          <SummaryCard label="상태" value={session.status === 'ended' ? '종료' : '진행 중'} />
          <SummaryCard label="시작" value={formatKoreanDateTime(session.started_at)} small />
        </section>

        {/* 세션 자동 분석 (T16.4 — 관찰 지표) */}
        {analysisQuery.data ? (
          (() => {
            const parsed = parseSessionAnalysis(analysisQuery.data);
            return parsed ? (
              <Card>
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-semibold">세션 자동 분석</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    대화 종료 시 자동 산출된 관찰 지표입니다.
                  </p>
                </div>
                <CardBody>
                  <AnalysisSummary analysis={parsed} />
                </CardBody>
              </Card>
            ) : null;
          })()
        ) : null}

        {/* 대화 전문 */}
        <Card>
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold">대화 전문</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              세션 자동 분석(호응 주제·관찰 지표)은 분석 페이지에서 확인할 수 있어요.
            </p>
          </div>
          <div className="p-5 space-y-4 max-h-[640px] overflow-y-auto">
            {logsQuery.isLoading ? (
              <div className="text-center text-sm text-slate-500 py-12">불러오는 중...</div>
            ) : turns.length === 0 ? (
              <div className="text-center text-sm text-slate-500 py-12">
                대화 내용이 없습니다.
              </div>
            ) : (
              turns.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    'flex items-end gap-3',
                    t.speaker === 'Elderly' ? 'justify-end' : '',
                  )}
                >
                  {t.speaker === 'AI' ? (
                    <div className="w-8 h-8 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      AI
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-2.5 max-w-[80%] text-sm leading-relaxed',
                      t.speaker === 'AI'
                        ? 'bg-slate-100 text-slate-900 rounded-bl-md'
                        : 'bg-brand-500 text-white rounded-br-md',
                    )}
                  >
                    <div>{t.text}</div>
                    {t.topic ? (
                      <div className="text-[10px] mt-1 opacity-70">#{t.topic}</div>
                    ) : null}
                  </div>
                  {t.speaker === 'Elderly' && elder ? (
                    <Avatar name={elder.name} color={elder.avatarColor} size="sm" />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function NotFoundShell({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="p-8">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft size={14} /> 세션 기록 목록
      </Button>
      <Card className="mt-4">
        <CardBody className="py-16 text-center text-slate-500">{children}</CardBody>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <Card>
      <CardBody>
        <div className="text-xs text-slate-500">{label}</div>
        <div
          className={cn(
            'font-bold mt-1 tabular-nums text-slate-900',
            small ? 'text-sm leading-snug' : 'text-2xl',
          )}
        >
          {value}
        </div>
      </CardBody>
    </Card>
  );
}
