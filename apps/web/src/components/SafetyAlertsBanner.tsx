// 미확인 안전 이벤트 배너 (M12.1) — 대시보드 최상단.
//
// 위기(crisis)·관찰(watch) 이벤트 중 아직 확인(acknowledge)되지 않은 것을 보여주고,
// 확인 처리(확인자·시각 기록)한다. 15초 주기 자동 갱신(훅). 어르신 안전이 최우선
// 정보이므로 통계보다 위에 배치한다.

import { Link } from 'react-router-dom';
import { Siren, CheckCircle2 } from 'lucide-react';
import {
  useAcknowledgeSafetyEvent,
  useCurrentUser,
  useUnacknowledgedSafetyEvents,
  type ProfileRow,
} from '@giokon/data';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { useStore } from '../store/store';
import { useAuth } from '../auth/AuthProvider';
import { formatRelative } from '../lib/utils';

interface Props {
  /** 어르신 이름 표시용(대시보드가 이미 조회한 profiles 재사용). */
  profiles: ProfileRow[];
}

export function SafetyAlertsBanner({ profiles }: Props) {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const currentUser = useCurrentUser();
  const eventsQuery = useUnacknowledgedSafetyEvents({ enabled: isConfigured });
  const acknowledge = useAcknowledgeSafetyEvent();

  if (!isConfigured) return null;
  const events = eventsQuery.data ?? [];
  if (events.length === 0) return null;

  const nameOf = (profileId: string) =>
    profiles.find((p) => p.id === profileId)?.name ?? '어르신';

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="rounded-2xl border-2 border-red-300 bg-red-50 overflow-hidden"
    >
      <div className="px-5 py-3.5 flex items-center gap-2 border-b border-red-200/70">
        <Siren size={18} className="text-red-600" />
        <h2 className="font-bold text-red-900">
          확인이 필요한 안전 알림 {events.length}건
        </h2>
        <span className="text-xs text-red-700/80 ml-auto">
          키워드 기반 안전장치 — 의학적 판단이 아닙니다
        </span>
      </div>
      <div className="divide-y divide-red-100">
        {events.map((ev) => (
          <div key={ev.id} className="px-5 py-3.5 flex items-start gap-3">
            <Badge tone={ev.level === 'crisis' ? 'warning' : 'info'} className="mt-0.5 shrink-0">
              {ev.level === 'crisis' ? '위기' : '관찰'}
            </Badge>
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-semibold text-slate-900">
                <Link to={`/caregiver/elders/${ev.profile_id}`} className="hover:underline">
                  {nameOf(ev.profile_id)}
                </Link>
                <span className="text-xs font-normal text-slate-500 ml-2">
                  {formatRelative(ev.created_at)}
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-1 leading-relaxed">{ev.caregiver_alert}</p>
              {ev.excerpt ? (
                <p className="text-xs text-slate-500 mt-0.5">발화: “{ev.excerpt}”</p>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const userId = currentUser.data?.id;
                if (!userId) return;
                acknowledge.mutate(
                  { id: ev.id, userId },
                  {
                    onSuccess: () => toast('success', '안전 알림을 확인 처리했습니다.'),
                    onError: (err) =>
                      toast('error', err instanceof Error ? err.message : '확인 처리 실패'),
                  }
                );
              }}
            >
              <CheckCircle2 size={14} /> 확인
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
