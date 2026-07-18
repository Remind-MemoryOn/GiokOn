// 세션 기록 목록 (Phase W2 — DB 배선)
//
// 앱(요양보호사 세션 실행 도구)이 sessions/session_logs 에 기록한 대화를
// RLS 범위(본인+기관)에서 조회한다. Realtime(T-E3)이 새 세션을 즉시 반영한다.
// 이전 Zustand 스토어 기반 목업 로그는 제거됨.

import { Link } from 'react-router-dom';
import { useProfiles, useRecentSessions, toElderProfile } from '@giokon/data';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../auth/AuthProvider';
import { formatKoreanDateTime, formatRelative } from '../lib/utils';

export function LogsPage() {
  const { isConfigured } = useAuth();
  const profilesQuery = useProfiles();
  const sessionsQuery = useRecentSessions({ limit: 100, enabled: isConfigured });

  const elders = (profilesQuery.data ?? []).map(toElderProfile);
  const sessions = sessionsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="세션 기록"
        description="앱에서 진행된 대화의 전문과 자동 분석을 확인할 수 있습니다."
      />
      <div className="flex-1 px-8 py-6 overflow-y-auto">
        <Card>
          {!isConfigured ? (
            <CardBody className="py-16 text-center text-sm text-slate-500">
              Supabase 연동 후 앱 대화 기록이 표시됩니다.
            </CardBody>
          ) : sessionsQuery.isLoading ? (
            <CardBody className="py-16 text-center text-sm text-slate-500">
              불러오는 중...
            </CardBody>
          ) : (
            <div className="divide-y divide-slate-100">
              {sessions.length === 0 ? (
                <div className="px-5 py-16 text-center text-sm text-slate-500">
                  아직 진행한 세션이 없습니다. 앱에서 세션을 시작하면 이곳에 실시간으로
                  나타나요.
                </div>
              ) : (
                sessions.map((s) => {
                  const elder = elders.find((e) => e.id === s.profile_id);
                  return (
                    <Link
                      key={s.id}
                      to={`/caregiver/logs/${s.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition"
                    >
                      <Avatar name={elder?.name || '?'} color={elder?.avatarColor} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-slate-900 truncate">
                            {elder?.name || '알 수 없음'} · 회상 대화
                            {s.current_topic ? ` (${s.current_topic})` : ''}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {formatKoreanDateTime(s.started_at)} · {s.turn_count}턴
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">{formatRelative(s.started_at)}</div>
                      <Badge tone={s.status === 'ended' ? 'neutral' : 'success'}>
                        {s.status === 'ended' ? '종료' : '진행 중'}
                      </Badge>
                    </Link>
                  );
                })
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
