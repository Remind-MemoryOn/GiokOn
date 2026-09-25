// 감독 화면 (파일럿 W2 · T21.5) — Figma 에 없는 화면
//
// 요양보호사 한 명이 여러 기기(최대 4대)의 회상 대화를 지켜보며 멈추고·재개하고·끝낸다. 세션 중 태블릿은
// 어르신이 들고 있으므로 감독은 **다른 기기**에서 한다 — 휴대폰 브라우저가 기본이라 1440 절대좌표 셸 밖의
// **반응형 단독 화면**으로 만든다(사용자 확정: 감독 화면은 웹, 반응형 우선). 시안이 없어 기존 카드·버튼·
// 색·글꼴로 끊긴 흐름을 잇는 최소 구현만 한다(시안이 오면 교체).
//
// ⚠️ 원격 제어는 RPC(request_session_control)만 — 중계가 2초마다 session_tick 으로 읽어 기기에 전한다.
//    원격 종료는 **기기를 멈출 뿐** 저장은 요양보호사가 기기에서 한다(앱 M5 — 자동 저장하지 않는다).
// ⚠️ 위기 카드의 안내(전화번호·비의료 고지)는 safety_events.caregiver_alert 에 서버가 저장한
//    문구를 그대로 쓴다 — 어르신 화면에서 옮겨 온 것이다(M3). 여기서 새 문구를 만들지 않는다.
// ⚠️ 세션에는 기기 정보가 없다 — 기기 이름을 지어내지 않고 '시작한 사람'을 보인다(읽을 수 있을 때만).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  elapsedLabel,
  sessionTargetMinutes,
  supervisionState,
  toElderProfile,
  useAcknowledgeSafetyEvent,
  useActiveOrgSessions,
  useCurrentUser,
  useGiokonRealtime,
  useOrgMembers,
  useOrgSettings,
  useProfiles,
  useRequestSessionControl,
  useSessionInterventions,
  useUnacknowledgedSafetyEvents,
  SESSION_PHASE_LABEL,
  type SessionControlAction,
  type SessionRow,
} from '@giokon/data';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { useStore } from '../../store/store';
import { cn } from '../../lib/utils';

const ACTION_LABEL: Record<string, string> = {
  pause: '일시정지',
  resume: '재개',
  end: '종료 요청',
  phase_advance: '단계 전환',
};

const CONTROL_ERRORS: Record<string, string> = {
  SESSION_CONTROL_NOT_FOUND: '이 세션을 찾을 수 없어요. 이미 끝났거나 우리 기관 세션이 아니에요.',
  SESSION_CONTROL_NOT_ACTIVE: '이미 끝난 세션이에요.',
  SESSION_CONTROL_REASON: '사유는 1~200자로 적어 주세요.',
  SESSION_CONTROL_ACTION: '알 수 없는 요청이에요.',
};
function controlError(e: unknown): string {
  const raw = e instanceof Error ? e.message : '';
  const code = Object.keys(CONTROL_ERRORS).find((k) => raw.includes(k));
  return code ? CONTROL_ERRORS[code] : raw || '요청하지 못했어요.';
}

function timeHM(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

/** 경과 시간을 1초마다 다시 그리기 위한 시계. */
function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function SupervisionPage() {
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const now = useNow();
  // 데스크톱 셸 밖이라 실시간 구독을 여기서 연다(sessions·session_interventions·safety_events).
  useGiokonRealtime({ enabled: isConfigured });

  const me = useCurrentUser();
  const sessions = useActiveOrgSessions({ enabled: isConfigured });
  const profiles = useProfiles();
  const members = useOrgMembers();
  const settings = useOrgSettings({ enabled: isConfigured });
  const safety = useUnacknowledgedSafetyEvents({ enabled: isConfigured });
  const rows = useMemo(() => sessions.data ?? [], [sessions.data]);
  const interventions = useSessionInterventions(rows.map((r) => r.id), { enabled: isConfigured });
  const control = useRequestSessionControl();
  const ack = useAcknowledgeSafetyEvent();

  const [pausing, setPausing] = useState<SessionRow | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [ending, setEnding] = useState<SessionRow | null>(null);

  const elderName = useMemo(
    () => new Map((profiles.data ?? []).map(toElderProfile).map((e) => [e.id, e.name])),
    [profiles.data],
  );
  // 구성원 이름은 관리 역할에게만 보인다(users RLS). 못 읽으면 이름을 만들지 않는다.
  const memberName = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.name ?? ''])), [members.data]);
  const whoName = (id: string | null | undefined) =>
    !id ? null : id === me.data?.id ? '나' : memberName.get(id) || null;

  function send(row: SessionRow, action: SessionControlAction, reason?: string) {
    control.mutate(
      { sessionId: row.id, action, reason },
      {
        onSuccess: () =>
          toast(
            'success',
            action === 'pause'
              ? '일시정지를 요청했어요. 어르신 화면이 곧 "잠시 쉬어요"로 바뀌어요.'
              : action === 'resume'
                ? '재개를 요청했어요.'
                : '종료를 요청했어요. 요양보호사가 기기에서 저장해 주세요.',
          ),
        onError: (e) => toast('error', controlError(e)),
      },
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <header className="sticky top-0 z-10 bg-white shadow-topbar">
        <div className="mx-auto flex h-[64px] w-full max-w-[1100px] items-center justify-between gap-4 px-4">
          <Link to="/caregiver" aria-label="관리 화면으로" className="flex items-center gap-3">
            <img src={asset.wordmark} alt="기억온" width={120} height={18} className="block" />
          </Link>
          <Link to="/caregiver" className="text-w-label font-semibold text-ink-700 underline">
            관리 화면으로
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-8">
        <h1 className="text-w-section font-bold leading-[34px] text-ink-900">감독 화면</h1>
        <p className="mt-2 text-w-sub leading-[26px] text-ink-700" style={{ wordBreak: 'keep-all' }}>
          우리 기관에서 진행 중인 회상 대화입니다. 멈추면 어르신 화면이 "잠시 쉬어요"로 바뀌고 마이크가 꺼집니다.
          종료를 요청하면 대화가 멈추고, 저장은 기기를 가진 요양보호사가 합니다.
        </p>

        {!isConfigured && !sessions.data ? (
          <p className="mt-10 text-w-sub text-ink-700">Supabase 를 연결하면 진행 중인 대화가 표시됩니다.</p>
        ) : sessions.isPending ? (
          <p className="mt-10 text-w-sub text-ink-700">진행 중인 대화를 확인하고 있어요.</p>
        ) : sessions.isError ? (
          <div role="alert" className="mt-10 rounded-[10px] border border-alert bg-white p-5 text-w-sub text-ink-900">
            진행 중인 대화를 불러오지 못했어요. 화면이 비어 보여도 대화가 없다는 뜻은 아닙니다.
            <button type="button" className="ml-2 font-semibold text-accent underline" onClick={() => void sessions.refetch()}>
              다시 확인
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-10 rounded-[10px] bg-white p-6 text-w-sub text-ink-500 shadow-card">지금 진행 중인 대화가 없어요.</p>
        ) : (
          <section aria-label="진행 중인 대화" className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {rows.map((row) => {
              const state = supervisionState(row);
              const target = sessionTargetMinutes(row.duration_minutes, settings.data?.target_minutes);
              const elapsed = elapsedLabel(row.started_at, now);
              const over = Date.parse(row.started_at) + target * 60_000 < now;
              const alerts = (safety.data ?? []).filter((e) => e.session_id === row.id);
              const history = (interventions.data ?? []).filter((i) => i.session_id === row.id).slice(0, 3);
              const starter = whoName(row.user_id);
              const pausedBy = whoName(row.paused_by);
              const busy = control.isPending;
              return (
                <article
                  key={row.id}
                  aria-label={`${elderName.get(row.profile_id) ?? '어르신'} 대화`}
                  className={cn(
                    'flex min-w-0 flex-col rounded-[10px] bg-white p-5 shadow-card',
                    alerts.length > 0 && 'ring-2 ring-alert',
                  )}
                >
                  {/* 위기 카드 — 서버가 저장한 요양보호사 알림 문구(전화번호·비의료 고지 포함)를 그대로 */}
                  {alerts.map((a) => (
                    <div key={a.id} role="alert" aria-live="assertive" className="mb-4 rounded-[10px] border-l-4 border-alert bg-alert/10 p-4">
                      <p className="text-w-sub font-semibold leading-[26px] text-ink-900" style={{ wordBreak: 'keep-all' }}>
                        {a.caregiver_alert}
                      </p>
                      {a.excerpt ? (
                        <p className="mt-2 text-w-label leading-[22px] text-ink-700">"{a.excerpt}"</p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-w-label text-ink-700">
                          {timeHM(a.created_at)} 감지 · <span className="whitespace-nowrap">키워드 기반 안전장치</span>
                        </span>
                        <button
                          type="button"
                          disabled={ack.isPending || !me.data?.id}
                          onClick={() =>
                            me.data?.id &&
                            ack.mutate(
                              { id: a.id, userId: me.data.id },
                              { onError: (e) => toast('error', e.message || '확인 처리하지 못했어요.') },
                            )
                          }
                          className="shrink-0 rounded-[10px] border-2 border-alert bg-white px-4 py-2 text-w-label font-semibold text-ink-900 disabled:opacity-50"
                        >
                          확인했어요
                        </button>
                      </div>
                    </div>
                  ))}

                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-w-nav font-bold leading-[30px] text-ink-900">
                        {elderName.get(row.profile_id) ?? '어르신'}
                      </h2>
                      <p className="mt-1 text-w-label text-ink-500">
                        {timeHM(row.started_at)} 시작{starter ? ` · ${starter}` : ''}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-2 rounded-pill px-3 py-1 text-w-label font-semibold text-ink-900',
                        state === 'running' && 'bg-live-soft',
                        state === 'paused' && 'bg-accent-soft',
                        state === 'ending' && 'bg-mute',
                      )}
                    >
                      {/* 상태 색은 점으로만 — 색 글자는 연한 배경 위 대비가 모자란다(감독 화면 대비 보정 2026-09-25) */}
                      <span
                        aria-hidden
                        className={cn(
                          'h-2 w-2 rounded-full',
                          state === 'running' && 'bg-live',
                          state === 'paused' && 'bg-accent',
                          state === 'ending' && 'bg-ink-400',
                        )}
                      />
                      {state === 'running' ? '진행 중' : state === 'paused' ? '일시정지' : '종료 요청됨'}
                    </span>
                  </header>

                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-[10px] bg-mute-pale px-2 py-3">
                      <dt className="text-w-label text-ink-700">단계</dt>
                      <dd className="mt-1 text-w-sub font-semibold text-ink-900">
                        {row.phase ? SESSION_PHASE_LABEL[row.phase] : '시작 전'}
                      </dd>
                    </div>
                    <div className="rounded-[10px] bg-mute-pale px-2 py-3">
                      <dt className="text-w-label text-ink-700">경과</dt>
                      <dd
                        className={cn(
                          'mt-1 text-w-sub font-semibold tabular-nums text-ink-900',
                          over && 'underline decoration-alert decoration-2 underline-offset-4',
                        )}
                      >
                        {elapsed ?? '—'}
                        {over ? <span className="sr-only"> (목표 시간 초과)</span> : null}
                      </dd>
                    </div>
                    <div className="rounded-[10px] bg-mute-pale px-2 py-3">
                      <dt className="text-w-label text-ink-700">목표</dt>
                      <dd className="mt-1 text-w-sub font-semibold text-ink-900">{target}분</dd>
                    </div>
                  </dl>

                  {state === 'paused' ? (
                    <p className="mt-3 text-w-label leading-[22px] text-ink-700" style={{ wordBreak: 'keep-all' }}>
                      {row.paused_at ? `${timeHM(row.paused_at)}에 ` : ''}{pausedBy === '나' ? '내가 ' : pausedBy ? `${pausedBy} 님이 ` : ''}멈췄어요
                      {row.pause_reason ? ` — ${row.pause_reason}` : ''}. 재개하면 어르신 화면이 이어집니다.
                    </p>
                  ) : state === 'ending' ? (
                    <p className="mt-3 text-w-label leading-[22px] text-ink-700" style={{ wordBreak: 'keep-all' }}>
                      종료를 요청했어요. 기기에서 저장하면 이 목록에서 사라집니다.
                    </p>
                  ) : null}

                  <div className="mt-4 flex gap-2">
                    {state === 'running' ? (
                      <Button size="sm" variant="outline" className="flex-1" disabled={busy} onClick={() => { setPauseReason(''); setPausing(row); }}>
                        일시정지
                      </Button>
                    ) : state === 'paused' ? (
                      <Button size="sm" className="flex-1 !text-ink-900" disabled={busy} onClick={() => send(row, 'resume')}>
                        재개
                      </Button>
                    ) : null}
                    {state !== 'ending' ? (
                      <Button size="sm" variant="danger" className="flex-1 !text-ink-900" disabled={busy} onClick={() => setEnding(row)}>
                        종료
                      </Button>
                    ) : null}
                  </div>

                  {history.length > 0 ? (
                    <ol aria-label="개입 기록" className="mt-4 space-y-1 border-t border-line pt-3 text-w-label text-ink-500">
                      {history.map((h) => (
                        <li key={h.id}>
                          {timeHM(h.created_at)} · {whoName(h.actor_id) ?? '직원'} · {ACTION_LABEL[h.action] ?? h.action}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </article>
              );
            })}
          </section>
        )}
        <p className="mt-8 text-w-label leading-[22px] text-ink-700">
          위기 안내는 키워드 기반 안전장치이며 의학적 판단이 아닙니다. 요양보호사 한 명이 동시에 진행할 수 있는 대화는 최대 4개입니다.
        </p>
      </main>

      <Dialog
        open={Boolean(pausing)}
        onClose={() => setPausing(null)}
        title="대화를 잠시 멈출까요?"
        description="어르신 화면이 '잠시 쉬어요'로 바뀌고 마이크가 꺼집니다. 이 화면에서 재개할 수 있어요."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPausing(null)}>
              취소
            </Button>
            <Button
              className="!text-ink-900"
              onClick={() => {
                if (pausing) send(pausing, 'pause', pauseReason);
                setPausing(null);
              }}
            >
              일시정지
            </Button>
          </>
        }
      >
        <label htmlFor="pause-reason" className="text-w-sub font-semibold text-ink-900">
          사유(선택)
        </label>
        <input
          id="pause-reason"
          value={pauseReason}
          maxLength={200}
          onChange={(e) => setPauseReason(e.target.value)}
          placeholder="예: 어르신이 쉬고 싶어 하심"
          className="mb-6 mt-2 h-[52px] w-full rounded-[10px] border border-line px-4 text-w-sub text-ink-900 focus:border-accent focus:outline-none"
        />
      </Dialog>

      <ConfirmDialog
        open={Boolean(ending)}
        title="대화를 끝낼까요?"
        description="어르신 기기의 대화가 멈춥니다. 저장은 기기를 가진 요양보호사가 합니다. 되돌려 이어 갈 수 없어요."
        confirmLabel="종료"
        onClose={() => setEnding(null)}
        onConfirm={() => {
          if (ending) send(ending, 'end');
        }}
      />
    </div>
  );
}
