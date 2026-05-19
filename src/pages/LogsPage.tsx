import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { useStore } from '../store/store';
import { formatKoreanDateTime, formatRelative } from '../lib/utils';

export function LogsPage() {
  const logs = useStore((s) => s.logs);
  const elders = useStore((s) => s.elders);
  const sessions = useStore((s) => s.sessions);

  return (
    <>
      <PageHeader
        title="세션 기록"
        description="진행한 대화의 전문과 AI가 자동으로 모은 연대기 항목을 확인할 수 있습니다."
      />
      <div className="flex-1 px-8 py-6 overflow-y-auto">
        <Card>
          <div className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-slate-500">
                아직 진행한 세션이 없습니다.
              </div>
            ) : (
              logs.map((l) => {
                const elder = elders.find((e) => e.id === l.elderId);
                const ses = sessions.find((s) => s.id === l.sessionId);
                return (
                  <Link
                    key={l.id}
                    to={`/caregiver/logs/${l.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition"
                  >
                    <Avatar name={elder?.name || '?'} color={elder?.avatarColor} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-slate-900 truncate">
                          {elder?.name || '알 수 없음'} · {ses?.title || '세션'}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatKoreanDateTime(l.startedAt)} · {l.turns.length}턴
                        {l.chronicleEntriesAdded.length > 0
                          ? ` · 연대기 +${l.chronicleEntriesAdded.length}`
                          : ''}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">{formatRelative(l.startedAt)}</div>
                    <Badge tone={l.status === 'ended' ? 'neutral' : 'success'}>
                      {l.status === 'ended' ? '종료' : '진행 중'}
                    </Badge>
                  </Link>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
