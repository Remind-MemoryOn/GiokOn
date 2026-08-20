// 대시보드 (Figma 118:300 — 1440×2218 실측)
//   제목 Bold 30 accent @169 · 설명 Regular 20/30 #404040 @236
//   안전 알림 배너 r10 border #ff0004 bg 3% (미확인 이벤트가 있을 때만)
//   통계 4카드 243×107 r10 shadow-card @657 (x 323/593/863/1134)
//   담당 어르신 카드(1054) @ 793 · 최근 대화 카드 @ 1545
import { Link } from 'react-router-dom';
import {
  toElderProfile,
  useAcknowledgeSafetyEvent,
  useChronicleCounts,
  useCurrentUser,
  useProfiles,
  useRecentSessions,
  useSessionCounts,
  useUnacknowledgedSafetyEvents,
} from '@giokon/data';
import { birthLabel } from '@giokon/core';
import { PageHeader } from '../../components/Layout';
import { Card, CardBody, RowDivider } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import { useElderPhotoUrls } from '../../lib/elderPhotos';
import { formatRelative } from '../../lib/utils';

export function DashboardPage() {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const profilesQuery = useProfiles();
  const sessionCounts = useSessionCounts();
  const chronicleCounts = useChronicleCounts();
  const recentSessions = useRecentSessions({ limit: 5, enabled: isConfigured });
  const safetyEvents = useUnacknowledgedSafetyEvents({ enabled: isConfigured });
  const currentUser = useCurrentUser();
  const acknowledge = useAcknowledgeSafetyEvent();

  const elders = (profilesQuery.data ?? []).map(toElderProfile);
  const photos = useElderPhotoUrls(elders.map((e) => e.photoPath), isConfigured);
  const photoOf = (path?: string) => (path ? photos.data?.[path] : undefined);

  const stats = [
    { icon: asset.statElders, label: '등록된 어르신', value: elders.length },
    { icon: asset.statSessions, label: '준비된 세션', value: sessionCounts.data?.total ?? 0 },
    { icon: asset.statChronicles, label: '연대기 항목', value: chronicleCounts.data?.total ?? 0 },
    { icon: asset.statAi, label: 'AI 자동 축적', value: chronicleCounts.data?.aiTotal ?? 0 },
  ];

  const events = safetyEvents.data ?? [];
  const nameOf = (profileId: string) => elders.find((e) => e.id === profileId)?.name ?? '어르신';

  return (
    <>
      <PageHeader
        title="대시보드"
        description={
          <>
            기억온은 요양보호사가 설계한 세션을 AI가 어르신과 대화로 진행하고,
            <br />그 대화에서 새로운 연대기를 스스로 모아갑니다.
          </>
        }
      />

      {/* 안전 알림 — 미확인 이벤트가 있을 때만 (M12 안전장치) */}
      {events.length > 0 ? (
        <section
          role="alert"
          aria-live="assertive"
          className="mb-[68px] rounded-[10px] border border-alert bg-alert-soft px-[52px] pb-8 pt-6"
        >
          <h2 className="text-w-section font-bold leading-[70px] text-alert">
            확인이 필요한 안전 알림 {events.length}건
          </h2>
          <p className="text-w-sub leading-[28px] text-ink-700">
            대화 중 감지된 위기·관찰 신호입니다. 키워드 기반 안전장치이며 의학적 판단이 아닙니다.
          </p>
          <div className="mt-6 h-px bg-alert-line" />
          <ul>
            {events.map((ev) => (
              <li key={ev.id} className="flex items-start gap-4 pt-7">
                <Badge tone={ev.level === 'crisis' ? 'alert' : 'info'}>
                  {ev.level === 'crisis' ? '위기' : '관찰'}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/caregiver/elders/${ev.profile_id}`}
                      className="text-w-body font-semibold text-ink-900 hover:underline"
                    >
                      {nameOf(ev.profile_id)}
                    </Link>
                    <span className="text-w-body leading-[28px] text-ink-500">
                      {formatRelative(ev.created_at)}
                    </span>
                  </div>
                  <p className="text-w-body leading-[28px] text-ink-700">{ev.caregiver_alert}</p>
                  {ev.excerpt ? (
                    <p className="text-w-body leading-[28px] text-ink-700">발화: “{ev.excerpt}”</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const userId = currentUser.data?.id;
                    if (!userId) return;
                    acknowledge.mutate(
                      { id: ev.id, userId },
                      {
                        onSuccess: () => toast('success', '안전 알림을 확인 처리했습니다.'),
                        onError: (err) =>
                          toast('error', err instanceof Error ? err.message : '확인 처리 실패'),
                      },
                    );
                  }}
                  className="shrink-0"
                >
                  <Badge tone="muteStrong">미확인</Badge>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 통계 4카드 */}
      <section className="flex gap-[27px]">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex h-[107px] w-[243px] items-center gap-4 rounded-[10px] bg-white px-6 shadow-card"
          >
            <img src={s.icon} alt="" width={50} height={50} className="block h-[50px] w-[50px]" />
            <div>
              <div className="text-w-stat font-semibold text-ink-900 tabular-nums">{s.value}</div>
              <div className="text-w-label text-ink-500">{s.label}</div>
            </div>
          </div>
        ))}
      </section>

      {/* 담당 어르신 */}
      <Card className="mt-[68px]">
        <div className="flex items-start justify-between px-[52px] pt-6">
          <div>
            <h2 className="text-w-section font-bold leading-[70px] text-ink-900">담당 어르신</h2>
            <p className="text-w-sub leading-[28px] text-ink-700">
              탭하여 세션을 시작하거나 연대기를 확인하세요.
            </p>
          </div>
          <Link
            to="/caregiver/elders"
            className="mt-7 flex items-center gap-3 text-w-body font-semibold text-ink-700"
          >
            전체 보기
            <img src={asset.iconChevronRight} alt="" width={12} height={19} className="block" />
          </Link>
        </div>
        <div className="mt-4">
          {elders.length === 0 ? (
            <CardBody className="py-16 text-center text-w-body text-ink-500">
              {isConfigured ? '아직 등록된 어르신이 없습니다.' : 'Supabase 연동 후 표시됩니다.'}
            </CardBody>
          ) : (
            elders.slice(0, 4).map((e) => (
              <div key={e.id}>
                <RowDivider />
                <Link
                  to={`/caregiver/elders/${e.id}`}
                  className="flex items-center gap-[24px] px-[52px] py-[26px] transition hover:bg-mute/40"
                >
                  <Avatar src={photoOf(e.photoPath)} name={e.name} size="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-4">
                      <span className="text-w-section font-bold text-ink-900">{e.name}</span>
                      <span className="text-w-body text-ink-500">{birthLabel(e)}</span>
                    </div>
                    <p className="text-w-body leading-[28px] text-ink-700">
                      {[e.hometown, e.job].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <div className="mt-3 flex gap-[17px]">
                      <Badge tone="info" large>
                        세션 {sessionCounts.data?.byProfile[e.id] ?? 0}
                      </Badge>
                      <Badge tone="chronicle" large>
                        연대기 {chronicleCounts.data?.byProfile[e.id] ?? 0}
                      </Badge>
                    </div>
                  </div>
                  <img src={asset.iconChevronRight} alt="" width={12} height={19} className="block" />
                </Link>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* 최근 대화 */}
      <Card className="mt-[68px]">
        <div className="px-[52px] pt-6">
          <h2 className="text-w-section font-bold leading-[70px] text-ink-900">최근 대화</h2>
          <p className="text-w-sub leading-[28px] text-ink-700">AI가 진행한 회상 세션</p>
        </div>
        <div className="mt-4">
          {(recentSessions.data ?? []).length === 0 ? (
            <CardBody className="py-16 text-center text-w-body text-ink-500">
              {isConfigured
                ? '아직 진행한 세션이 없습니다.'
                : 'Supabase 연동 후 앱 대화 기록이 표시됩니다.'}
            </CardBody>
          ) : (
            (recentSessions.data ?? []).map((s) => {
              const elder = elders.find((e) => e.id === s.profile_id);
              const minutes = s.duration_seconds ? Math.round(s.duration_seconds / 60) : null;
              return (
                <div key={s.id}>
                  <RowDivider />
                  <Link
                    to={`/caregiver/sessions/${s.profile_id}/${s.id}`}
                    className="flex items-center gap-[24px] px-[52px] py-[22px] transition hover:bg-mute/40"
                  >
                    <Avatar src={photoOf(elder?.photoPath)} name={elder?.name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="text-w-section font-bold text-ink-900">
                        {elder?.name ?? '알 수 없음'}
                      </div>
                      <div className="text-w-body leading-[28px] text-ink-500">
                        {formatRelative(s.started_at)}
                        {minutes ? ` · ${minutes}분` : ''}
                      </div>
                    </div>
                    <Badge tone={s.status === 'ended' ? 'mute' : 'live'}>
                      {s.status === 'ended' ? '종료' : '진행 중'}
                    </Badge>
                  </Link>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </>
  );
}
