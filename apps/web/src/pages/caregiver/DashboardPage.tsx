// 대시보드 (Figma 118:300 — 1440×2218 실측)
//   제목 Bold 30 accent @169 · 설명 Regular 20/30 #404040 @236
//   안전 알림 배너 r10 border #ff0004 bg 3% (미확인 이벤트가 있을 때만)
//   통계 4카드 243×107 r10 shadow-card @657 (x 323/593/863/1134)
//   담당 어르신 카드 1054×701.6 @ 815.7 · 최근 대화 카드 1054×564.5 @ 1568.4
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
import { cn, formatRelative } from '../../lib/utils';

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

  // fx = Figma 노드 id(카드·아이콘·라벨·값) — 실측 감사 앵커.
  const stats = [
    { icon: asset.statElders, label: '등록된 어르신', value: elders.length, fx: ['216:374', '216:383', '216:389', '216:382'] },
    { icon: asset.statSessions, label: '준비된 세션', value: sessionCounts.data?.total ?? 0, fx: ['216:391', '216:393', '216:395', '216:392'] },
    { icon: asset.statChronicles, label: '연대기 항목', value: chronicleCounts.data?.total ?? 0, fx: ['216:399', '216:401', '216:402', '216:400'] },
    { icon: asset.statAi, label: 'AI 자동 축적', value: chronicleCounts.data?.aiTotal ?? 0, fx: ['216:413', '216:415', '216:416', '216:414'] },
  ];

  const events = safetyEvents.data ?? [];
  const nameOf = (profileId: string) => elders.find((e) => e.id === profileId)?.name ?? '어르신';

  return (
    <>
      <PageHeader
        title="대시보드"
        tone="accent"
        description={
          <>
            기억온은 요양보호사가 설계한 세션을 AI가 어르신과 대화로 진행하고,
            <br />그 대화에서 새로운 연대기를 스스로 모아갑니다.
          </>
        }
      />

      {/* 안전 알림 — 미확인 이벤트가 있을 때만 (M12 안전장치)
          Figma 216:236 실측: 배너 1054×255.23 @ (322,347.31) · 제목 @367 · 부제 @429.4 ·
          구분선 @476(950) · 행 [배지 379 · 시간 453 · 미확인 1242] @504.5 · 발화 @540.5 */}
      {events.length > 0 ? (
        <section
          role="alert"
          aria-live="assertive"
          data-fx="216:236"
          className="-ml-px mb-[54px] mt-[51px] w-[1054px] rounded-[10px] border border-alert bg-alert-soft px-[51px] pb-[32px] pt-[20px]"
        >
          <h2 data-fx="216:238" className="text-w-section font-bold leading-[70px] text-alert">
            확인이 필요한 안전 알림 {events.length}건
          </h2>
          <p data-fx="216:239" className="-mt-[8px] text-w-sub leading-[28px] text-ink-700">
            대화 중 감지된 위기·관찰 신호입니다. 키워드 기반 안전장치이며 의학적 판단이 아닙니다.
          </p>
          <div data-fx="216:240" className="mt-[19px] h-px bg-alert-line" />
          <ul className="pl-[5px]">
            {events.map((ev, i) => (
              <li key={ev.id} className="flex items-center gap-[10px] pt-[27px]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[10px]">
                    <Badge
                      tone={ev.level === 'crisis' ? 'alert' : 'info'}
                      data-fx={i === 0 ? '216:247' : undefined}
                    >
                      {ev.level === 'crisis' ? '위기' : '관찰'}
                    </Badge>
                    <span
                      data-fx={i === 0 ? '216:241' : undefined}
                      className="text-w-body leading-[28px] text-ink-500"
                    >
                      {formatRelative(ev.created_at)}
                    </span>
                    {/* 디자인 시안은 한 어르신만 보여주지만 대시보드는 담당 전체를 모은다 —
                        어느 어르신인지 없으면 알림이 무의미해 같은 줄에 링크를 둔다. */}
                    <Link
                      to={`/caregiver/elders/${ev.profile_id}`}
                      className="truncate text-w-body font-semibold leading-[28px] text-ink-900 hover:underline"
                    >
                      {nameOf(ev.profile_id)}
                    </Link>
                  </div>
                  <p
                    data-fx={i === 0 ? '216:249' : undefined}
                    className="mt-[8px] text-w-body leading-[28px] text-ink-700"
                  >
                    {ev.excerpt ? `발화: “${ev.excerpt}”` : ev.caregiver_alert}
                  </p>
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
                  <Badge tone="muteStrong" fixed data-fx={i === 0 ? '216:244' : undefined}>
                    미확인
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 통계 4카드 */}
      <section className={cn('flex gap-[27px]', events.length === 0 && 'mt-[51px]')}>
        {stats.map((s) => (
          <div
            key={s.label}
            data-fx={s.fx[0]}
            className="flex h-[107px] w-[243px] items-center gap-[21px] rounded-[10px] bg-white px-6 shadow-card"
          >
            <img
              src={s.icon}
              alt=""
              width={50}
              height={50}
              data-fx={s.fx[1]}
              className="block h-[50px] w-[50px]"
            />
            {/* Figma 실측 순서 — 라벨(Regular 16/35 #7b7c7c)이 위, 값(SemiBold 35/35)이 아래 */}
            <div>
              <div data-fx={s.fx[2]} className="text-w-label text-ink-500">
                {s.label}
              </div>
              <div
                data-fx={s.fx[3]}
                className="-mt-[4px] text-w-stat font-semibold text-ink-900 tabular-nums"
              >
                {s.value}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* 담당 어르신 */}
      <Card data-fx="219:546" className="mt-[52px]">
        <div className="flex items-start justify-between px-[52px] pt-[19px]">
          <div>
            <h2 data-fx="219:550" className="text-w-section font-bold leading-[70px] text-ink-900">
              담당 어르신
            </h2>
            <p data-fx="219:551" className="-mt-[7px] text-w-sub leading-[28px] text-ink-700">
              탭하여 세션을 시작하거나 연대기를 확인하세요.
            </p>
          </div>
          <Link
            to="/caregiver/elders"
            className="mt-[45px] flex items-center gap-[15px] text-w-body font-semibold leading-[21px] text-ink-700"
          >
            <span data-fx="221:142">전체 보기</span>
            <img src={asset.iconChevronRight} alt="" width={12} height={19} className="block" />
          </Link>
        </div>
        <div className="mt-[31px] pb-[7px]">
          {elders.length === 0 ? (
            <CardBody className="py-16 text-center text-w-body text-ink-500">
              {isConfigured ? '아직 등록된 어르신이 없습니다.' : 'Supabase 연동 후 표시됩니다.'}
            </CardBody>
          ) : (
            elders.slice(0, 4).map((e, i) => (
              <div key={e.id}>
                <RowDivider data-fx={i === 0 ? '219:552' : i === 1 ? '219:553' : undefined} />
                <Link
                  to={`/caregiver/elders/${e.id}`}
                  className="flex gap-[24px] px-[52px] pb-[36px] pt-[13px] transition hover:bg-mute/40"
                >
                  <Avatar
                    src={photoOf(e.photoPath)}
                    name={e.name}
                    size="xl"
                    data-fx={i === 0 ? '219:501' : undefined}
                    className="mt-[26px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-[17px]">
                      <span
                        data-fx={i === 0 ? '219:465' : undefined}
                        className="text-w-section font-bold leading-[70px] text-ink-900"
                      >
                        {e.name}
                      </span>
                      <span
                        data-fx={i === 0 ? '219:467' : undefined}
                        className="text-w-body leading-[28px] text-ink-500"
                      >
                        {birthLabel(e)}
                      </span>
                    </div>
                    <p
                      data-fx={i === 0 ? '219:469' : undefined}
                      className="-mt-[7px] text-w-body leading-[28px] text-ink-700"
                    >
                      {[e.hometown, e.job].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <div className="mt-[11px] flex gap-[17px]">
                      <Badge tone="info" large data-fx={i === 0 ? '219:471' : undefined}>
                        세션 {sessionCounts.data?.byProfile[e.id] ?? 0}
                      </Badge>
                      <Badge tone="chronicle" large data-fx={i === 0 ? '219:496' : undefined}>
                        연대기 {chronicleCounts.data?.byProfile[e.id] ?? 0}
                      </Badge>
                    </div>
                  </div>
                  <img
                    src={asset.iconChevronRight}
                    alt=""
                    width={12}
                    height={19}
                    className="mr-[47px] mt-[59px] block"
                  />
                </Link>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* 최근 대화 */}
      <Card data-fx="216:349" className="mt-[51px]">
        <div className="px-[52px] pt-[19px]">
          <h2 data-fx="216:351" className="text-w-section font-bold leading-[70px] text-ink-900">
            최근 대화
          </h2>
          <p data-fx="216:352" className="-mt-[7px] text-w-sub leading-[28px] text-ink-700">
            AI가 진행한 회상 세션
          </p>
        </div>
        <div className="mt-[31px]">
          {(recentSessions.data ?? []).length === 0 ? (
            <CardBody className="py-16 text-center text-w-body text-ink-500">
              {isConfigured
                ? '아직 진행한 세션이 없습니다.'
                : 'Supabase 연동 후 앱 대화 기록이 표시됩니다.'}
            </CardBody>
          ) : (
            (recentSessions.data ?? []).map((s, i) => {
              const elder = elders.find((e) => e.id === s.profile_id);
              const minutes = s.duration_seconds ? Math.round(s.duration_seconds / 60) : null;
              return (
                <div key={s.id}>
                  <RowDivider />
                  <Link
                    to={`/caregiver/sessions/${s.profile_id}/${s.id}`}
                    className="flex gap-[14px] px-[52px] pb-[29px] pt-[13px] transition hover:bg-mute/40"
                  >
                    <Avatar
                      src={photoOf(elder?.photoPath)}
                      name={elder?.name}
                      size="lg"
                      data-fx={i === 0 ? '219:503' : undefined}
                      className="mt-[12px]"
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        data-fx={i === 0 ? '219:505' : undefined}
                        className="text-w-section font-bold leading-[70px] text-ink-900"
                      >
                        {elder?.name ?? '알 수 없음'}
                      </div>
                      <div
                        data-fx={i === 0 ? '219:504' : undefined}
                        className="-mt-[11px] text-w-body leading-[28px] text-ink-500"
                      >
                        {formatRelative(s.started_at)}
                        {minutes ? ` · ${minutes}분` : ''}
                      </div>
                    </div>
                    <Badge
                      tone={s.status === 'ended' ? 'mute' : 'live'}
                      fixed
                      data-fx={i === 0 ? '216:363' : undefined}
                      className="mt-[41px]"
                    >
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
