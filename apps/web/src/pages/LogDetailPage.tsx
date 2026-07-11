import { useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Hash, MessageSquare } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useStore } from '../store/store';
import { formatKoreanDateTime } from '../lib/utils';
import { cn } from '../lib/utils';
import { EMOTION_META, THERAPY_TYPES, type GuardianReport } from '../types';

export function LogDetailPage() {
  const { logId = '' } = useParams();
  const navigate = useNavigate();
  const logs = useStore((s) => s.logs);
  const elders = useStore((s) => s.elders);
  const sessions = useStore((s) => s.sessions);
  const log = useMemo(() => logs.find((l) => l.id === logId), [logs, logId]);
  const elder = useMemo(
    () => (log ? elders.find((e) => e.id === log.elderId) : undefined),
    [elders, log]
  );
  const session = useMemo(
    () => (log ? sessions.find((s) => s.id === log.sessionId) : undefined),
    [sessions, log]
  );
  const chronicleAll = useStore((s) => s.chronicles);

  if (!log || !elder) {
    return (
      <div className="p-8">
        <Button variant="ghost" onClick={() => navigate('/caregiver/logs')}>
          <ArrowLeft size={14} /> 세션 기록 목록
        </Button>
        <Card className="mt-4">
          <CardBody className="py-16 text-center text-slate-500">
            존재하지 않는 세션입니다.
          </CardBody>
        </Card>
      </div>
    );
  }

  const extracted = chronicleAll.filter((c) => log.chronicleEntriesAdded.includes(c.id));
  const durationMin = log.endedAt
    ? Math.max(
        1,
        Math.round((new Date(log.endedAt).getTime() - new Date(log.startedAt).getTime()) / 60000)
      )
    : null;

  return (
    <>
      <PageHeader
        title={session?.title || '세션 기록'}
        description={`${elder.name} 어르신 · ${formatKoreanDateTime(log.startedAt)}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/caregiver/logs')}>
              <ArrowLeft size={14} /> 목록
            </Button>
            <Link to={`/caregiver/elders/${elder.id}`}>
              <Button variant="outline">어르신 상세</Button>
            </Link>
          </>
        }
      />
      <div className="flex-1 px-8 py-6 overflow-y-auto space-y-6">
        {/* 활동 종류 표시 */}
        {session ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">활동 종류:</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
              {THERAPY_TYPES[session.therapyType].emoji} {THERAPY_TYPES[session.therapyType].label}
            </span>
            {session.note ? (
              <span className="text-slate-400">· {session.note}</span>
            ) : null}
            {/* 생성물 표시 — AI기본법 투명성 */}
            <Badge tone="info" className="ml-auto">AI 질문·요약은 AI가 생성한 내용입니다</Badge>
          </div>
        ) : null}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="대화 턴" value={log.turns.length} />
          <SummaryCard label="진행 시간" value={durationMin ? `${durationMin}분` : '진행 중'} />
          <SummaryCard
            label="AI 자동 연대기"
            value={log.chronicleEntriesAdded.length}
            highlight
          />
          <SummaryCard
            label="상태"
            value={log.status === 'ended' ? '종료' : '진행 중'}
          />
        </section>

        {/* 보호자 리포트 */}
        {log.guardianReport && elder.guardian ? (
          <GuardianReportCard
            elderName={elder.name}
            guardianName={elder.guardian.name}
            guardianRelation={elder.guardian.relation}
            startedAt={log.startedAt}
            report={log.guardianReport}
          />
        ) : log.guardianReport ? (
          <GuardianReportCard
            elderName={elder.name}
            startedAt={log.startedAt}
            report={log.guardianReport}
          />
        ) : null}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* 대화 전문 */}
          <Card className="xl:col-span-2">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold">대화 전문</h3>
            </div>
            <div className="p-5 space-y-4 max-h-[640px] overflow-y-auto">
              {log.turns.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-12">
                  대화 내용이 없습니다.
                </div>
              ) : (
                log.turns.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      'flex items-end gap-3',
                      t.speaker === 'Elderly' ? 'justify-end' : ''
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
                          : 'bg-brand-500 text-white rounded-br-md'
                      )}
                    >
                      <div>{t.text}</div>
                      {t.topic ? (
                        <div className="text-[10px] mt-1 opacity-70">#{t.topic}</div>
                      ) : null}
                      {t.extractedKeywords && t.extractedKeywords.length > 0 ? (
                        <div className="text-[10px] mt-1 opacity-90 border-t border-white/30 pt-1">
                          AI 추출: {t.extractedKeywords.map((k) => `#${k}`).join(' ')}
                        </div>
                      ) : null}
                    </div>
                    {t.speaker === 'Elderly' ? (
                      <Avatar name={elder.name} color={elder.avatarColor} size="sm" />
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* 자동 축적된 연대기 */}
          <Card>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles size={15} className="text-purple-500" />
                이번 대화에서 모은 연대기
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                AI가 어르신 발화에서 자동으로 추출한 항목입니다.
              </p>
            </div>
            <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {extracted.length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-slate-500">
                  이번 대화에서는 새로 추출된 항목이 없습니다.
                </div>
              ) : (
                extracted.map((e) => (
                  <div key={e.id} className="px-5 py-4">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Badge tone="pink">
                        <Sparkles size={10} className="mr-0.5" /> AI 자동
                      </Badge>
                      <Badge tone="brand">{e.topic}</Badge>
                    </div>
                    <div className="text-sm text-slate-800 leading-relaxed">{e.content}</div>
                    {e.keywords.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {e.keywords.map((k) => (
                          <span
                            key={k}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                          >
                            <Hash size={9} className="inline -mt-0.5" />
                            {k}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardBody>
        <div className="text-xs text-slate-500">{label}</div>
        <div
          className={cn(
            'text-2xl font-bold mt-1 tabular-nums',
            highlight ? 'text-purple-600' : 'text-slate-900'
          )}
        >
          {value}
        </div>
      </CardBody>
    </Card>
  );
}

function GuardianReportCard({
  elderName,
  guardianName,
  guardianRelation,
  startedAt,
  report,
}: {
  elderName: string;
  guardianName?: string;
  guardianRelation?: string;
  startedAt: string;
  report: GuardianReport;
}) {
  const meta = EMOTION_META[report.emotionTone];
  const targetLine = guardianName
    ? `${guardianName} 님 (${elderName} 어르신의 ${guardianRelation})에게 전송됩니다.`
    : '보호자 정보를 등록하면 자동으로 전송됩니다.';

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 bg-gradient-to-r from-violet-50 via-rose-50 to-amber-50 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-violet-500 text-white flex items-center justify-center">
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">보호자 리포트</h3>
              <p className="text-xs text-slate-600">AI가 자동 생성한 감정 요약 메시지</p>
            </div>
          </div>
          <span
            className={cn(
              'text-xs font-bold px-2.5 py-1 rounded-full border',
              meta.color
            )}
          >
            {meta.emoji} {meta.label}
          </span>
        </div>
      </div>

      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 스마트폰 알림 미리보기 */}
          <div className="bg-slate-900 rounded-2xl p-3 shadow-lg">
            <div className="rounded-xl bg-white p-3.5 shadow-soft">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded bg-warm-500 text-white text-[10px] font-bold flex items-center justify-center">
                  기억온
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  <div className="font-semibold text-slate-800">기억온</div>
                  <div>{formatKoreanDateTime(startedAt)}</div>
                </div>
              </div>
              <div className="text-sm font-bold text-slate-900 mb-1" style={{ wordBreak: 'keep-all' }}>
                {report.headline}
              </div>
              <div className="text-xs text-slate-700 leading-relaxed" style={{ wordBreak: 'keep-all' }}>
                {report.body}
              </div>
            </div>
            <div className="text-center text-[10px] text-slate-400 mt-2">
              📱 보호자 스마트폰 알림 미리보기
            </div>
          </div>

          {/* 분석 디테일 */}
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-slate-500 mb-1">전송 대상</div>
              <div className="text-slate-800">{targetLine}</div>
            </div>
            {report.highlightTopics.length > 0 ? (
              <div>
                <div className="text-xs text-slate-500 mb-1.5">자주 언급된 주제</div>
                <div className="flex flex-wrap gap-1.5">
                  {report.highlightTopics.map((t) => (
                    <Badge key={t} tone="brand">
                      <Hash size={10} className="-ml-0.5" />
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <div className="text-xs text-slate-500 mb-1.5">감정 톤 추정</div>
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full border',
                  meta.color
                )}
              >
                {meta.emoji} {meta.label}
              </div>
            </div>
            {report.newChronicleCount > 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-purple-600 font-semibold">
                <Sparkles size={13} />
                이번 대화에서 새 연대기 {report.newChronicleCount}개 모음
              </div>
            ) : null}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
