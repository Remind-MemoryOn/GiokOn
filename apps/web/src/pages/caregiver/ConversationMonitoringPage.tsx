import { Link } from 'react-router-dom';
import { useActiveConversations, useProfiles } from '@giokon/data';
import { useAuth } from '../../auth/AuthProvider';
import { PageHeader } from '../../components/Layout';
import { cn } from '../../lib/utils';

function timeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function ConversationMonitoringPage() {
  const { isConfigured } = useAuth();
  const conversations = useActiveConversations({ enabled: isConfigured });
  const profiles = useProfiles({ enabled: isConfigured });
  const names = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.name]));
  const compact = (conversations.data?.length ?? 0) >= 5;

  return (
    <div className="pb-12">
      <PageHeader
        title="대화 모니터링"
        description="현재 진행 중인 담당 어르신의 회상 대화를 한눈에 확인합니다. 저장이 끝난 발화가 실시간 알림 또는 5초 간격으로 갱신됩니다."
        descMax={950}
      />
      {!isConfigured ? (
        <p className="mt-12 text-w-body text-ink-500">Supabase를 연결하면 진행 중인 대화가 표시됩니다.</p>
      ) : conversations.isPending || profiles.isPending ? (
        <p className="mt-12 text-w-body text-ink-500">진행 중인 대화를 확인하고 있습니다.</p>
      ) : conversations.isError || profiles.isError ? (
        <div role="alert" className="mt-12 rounded-[10px] border border-alert p-6 text-w-body text-ink-900">
          대화 기록을 불러오지 못했습니다. 화면이 비어 보여도 대화가 없다는 뜻은 아닙니다.
          <button type="button" className="ml-4 font-semibold text-accent underline" onClick={() => void conversations.refetch()}>다시 확인</button>
        </div>
      ) : !conversations.data?.length ? (
        <p className="mt-12 text-w-body text-ink-500">현재 진행 중인 담당 어르신의 대화가 없습니다.</p>
      ) : (
        <section aria-label="진행 중인 대화" className={cn('mt-10 grid grid-cols-1 gap-4 md:grid-cols-2', compact ? 'xl:grid-cols-5' : 'xl:grid-cols-2')}>
          {conversations.data.map(({ session, logs }) => (
            <article key={session.id} className={cn('flex min-h-[290px] min-w-0 flex-col rounded-[10px] border border-line bg-white shadow-card', compact ? 'p-3' : 'p-6')}>
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h2 className={cn('font-bold text-ink-900', compact ? 'text-w-sub' : 'text-w-nav')}>{names.get(session.profile_id) ?? '담당 어르신'}</h2>
                  <p className="mt-1 text-w-label text-ink-500">시작 {timeLabel(session.started_at)} · 최근 대화</p>
                </div>
                <span className={cn('shrink-0 rounded-full bg-accent-soft py-1 text-w-label font-semibold text-accent', compact ? 'px-2' : 'px-3')}>진행 중</span>
              </header>
              <ol aria-label={`${names.get(session.profile_id) ?? '담당 어르신'} 대화 내용`} className={cn('mt-5 flex-1 space-y-3 overflow-y-auto', compact ? 'max-h-[380px]' : 'max-h-[290px]')} aria-live="polite">
                {logs.length === 0 ? (
                  <li className="text-w-sub text-ink-500">아직 확인된 대화 내용이 없습니다.</li>
                ) : logs.slice(-6).map((log) => (
                  <li key={log.id} className={cn('rounded-[10px] bg-[#fbfbfb] py-3', compact ? 'px-2' : 'px-4')}>
                    <div className="flex justify-between gap-3 text-w-label text-ink-500">
                      <span className="font-semibold">{log.role === 'ai' ? 'AI' : '어르신'}</span>
                      <time dateTime={log.spoken_at}>{timeLabel(log.spoken_at)}</time>
                    </div>
                    <p className={cn('mt-1 whitespace-pre-wrap leading-7 text-ink-900', compact ? 'text-w-label' : 'text-w-sub')} style={{ overflowWrap: 'anywhere' }}>{log.content}</p>
                  </li>
                ))}
              </ol>
              <Link to={`/caregiver/sessions/${session.profile_id}/${session.id}`} className="mt-4 self-end text-w-label font-semibold text-accent underline">전체 대화 기록</Link>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
