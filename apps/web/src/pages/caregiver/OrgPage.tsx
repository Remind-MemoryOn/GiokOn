// 기관 관리 (Figma 131:959 — 1440×1238)
//   제목 @169 · 부제 w547 @236.19
//   카드1 1054×360 @(322,315) — 기관 정보
//     기관 정보 @(66,27) · 라벨 @(67,119.35) · 입력 576×57 @(66,154.38) ·
//     저장 102×57 @(651,154.38) · 도움말 @(68,219.43) · 기관 ID @(66,281.48)
//   카드2 1054×410 @(322,742) — 구성원
//     구성원 @(66,27) · 설명 @(66,93.68) · 구분선 922 @(66,154) ·
//     행: 아바타 79 @(217,+22) · 역할 배지 119×33 @(66,+48) ·
//         이름 @(328,+34.75) · 이메일 @(328,+69.78) · 피치 122
//
// ⚠️ 기관 이름 수정은 기관 관리자만 할 수 있다(서버 RLS 가 최종 방어선) — 권한이 없으면
//    입력을 잠그고 이유를 보여 준다. 화면에서 감추는 것으로 접근통제를 대신하지 않는다.
//
// ⚠️ 카드3 "승인 대기"는 **Figma 에 없다**. RPC 는 있는데 제품에 처리 화면이 없어
//    보호자 연결·기관 합류 요청을 아무도 승인할 수 없었다(배포 차단). 새 디자인 언어를
//    만들지 않고 **카드2(구성원)의 실측 리듬을 그대로** 쓴다 — 카드 1054 · 제목 @(66,27) ·
//    설명 @(66,93.68) · 구분선 922 @(66,154) · 행 기준 152 · 피치 122.
//    대기 건이 없으면 카드를 그리지 않는다(빈 카드로 화면을 늘리지 않는다).
import { useMemo, useState } from 'react';
import {
  toElderProfile,
  useApproveCaregiverAssignment,
  useApproveGuardianLink,
  useCurrentUser,
  useOrgGuardianLinks,
  useOrgPendingAssignments,
  useRemoveCaregiverAssignment,
  useRevokeGuardianLink,
  useOrgMembers,
  useOrganization,
  useProfiles,
  useUpdateOrganization,
  type OrganizationRow,
} from '@giokon/data';
import { dateDot } from '@giokon/core';
import { PageHeader } from '../../components/Layout';
import { Avatar } from '../../components/ui/Avatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import { cn } from '../../lib/utils';

const Y = (v: number) => v - 122;
/** PageHeader(제목+설명) 블록이 끝나는 266 에서 첫 카드(315)까지의 간격. */
const HEADER_GAP = 49;

const CARD1_TOP = 315;
const CARD2_TOP = 742;
/** 구성원 행 — 행 기준선(아바타가 +22)과 세로 피치. 시안: 아바타 916 = 742+174. */
const MEMBER_TOP = 152;
const MEMBER_PITCH = 122;
/** 카드 사이 간격 — 카드1 끝(315+360=675) → 카드2(742). */
const CARD_GAP = 67;

/** 승인 대기 한 건 — 두 종류(기관 합류 · 보호자 연결)를 한 목록으로 다룬다. */
interface Waiting {
  key: string;
  kind: 'join' | 'guardian';
  id: string;
  /** 요청한 사람. 이름이 없으면 이메일, 그것도 없으면 만들지 않는다. */
  who: string;
  detail: string | null;
  /** 어느 어르신에 대한 요청인가. 우리가 읽을 수 없는 어르신이면 null. */
  elder: string | null;
  at: string;
  selfRequest: boolean;
}

const WAITING_LABEL: Record<Waiting['kind'], string> = {
  join: '기관 합류',
  guardian: '보호자 연결',
};

const ROLE_LABEL: Record<string, string> = {
  org_admin: '기관 관리자',
  caregiver: '요양보호사',
  guardian: '보호자',
};

export function OrgPage() {
  const { isConfigured } = useAuth();
  const org = useOrganization({ enabled: isConfigured });
  // 폼 초기값은 서버 값이다 — 로드된 뒤에 마운트해 effect 로 되심지 않는다.
  return <OrgForm key={org.data?.id ?? 'none'} org={org.data ?? null} />;
}

function OrgForm({ org: orgRow }: { org: OrganizationRow | null }) {
  const { isConfigured } = useAuth();
  const members = useOrgMembers();
  const me = useCurrentUser();
  const save = useUpdateOrganization();
  const toast = useStore((s) => s.toast);
  const profiles = useProfiles();
  const org = { data: orgRow };
  // 승인 대기 — 보호자 연결 요청 + 요양보호사 기관 합류 요청.
  const pendingJoins = useOrgPendingAssignments({ enabled: isConfigured });
  const guardianLinks = useOrgGuardianLinks({ enabled: isConfigured });
  const approveJoin = useApproveCaregiverAssignment();
  const approveGuardian = useApproveGuardianLink();
  const rejectGuardian = useRevokeGuardianLink();
  const rejectJoin = useRemoveCaregiverAssignment();

  const [name, setName] = useState(orgRow?.name ?? '');
  /** 거절 확인 대상 — 되돌리려면 상대가 다시 요청해야 한다. */
  const [rejecting, setRejecting] = useState<Waiting | null>(null);

  const isAdmin = me.data?.role === 'org_admin';
  const elders = useMemo(() => (profiles.data ?? []).map(toElderProfile), [profiles.data]);
  const rows = members.data ?? [];
  /** 카드 높이는 구성원 수에서 계산한다(시안은 2명 고정). */
  const card2Height = MEMBER_TOP + Math.max(rows.length, 1) * MEMBER_PITCH + 114;

  const elderName = useMemo(
    () => new Map(elders.map((e) => [e.id, e.name])),
    [elders],
  );
  /** 승인 대기 두 종류를 한 목록으로. 오래 기다린 것이 위로 온다. */
  const waiting = useMemo<Waiting[]>(() => {
    const out: Waiting[] = [];
    for (const a of pendingJoins.data ?? []) {
      out.push({
        key: `join-${a.id}`,
        kind: 'join',
        id: a.id,
        who: a.caregiver?.name ?? a.caregiver?.email ?? '—',
        detail: a.caregiver?.email ?? null,
        elder: elderName.get(a.profile_id) ?? null,
        at: a.assigned_at,
        // 자기 요청은 스스로 승인할 수 없다(서버가 3중으로 막는다) — 버튼도 잠근다.
        selfRequest: a.caregiver_user_id === me.data?.id,
      });
    }
    for (const g of guardianLinks.data ?? []) {
      if (g.status !== 'pending') continue;
      out.push({
        key: `guardian-${g.id}`,
        kind: 'guardian',
        id: g.id,
        who: g.guardian?.name ?? g.guardian?.email ?? '—',
        detail: g.guardian?.email ?? null,
        elder: elderName.get(g.profile_id) ?? null,
        at: g.created_at,
        selfRequest: false,
      });
    }
    return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [pendingJoins.data, guardianLinks.data, elderName, me.data?.id]);

  const card3Top = CARD2_TOP + card2Height + CARD_GAP;
  const card3Height = MEMBER_TOP + waiting.length * MEMBER_PITCH + 114;
  const pageBottom = waiting.length > 0 ? card3Top + card3Height : CARD2_TOP + card2Height;

  function decide(w: Waiting, approve: boolean) {
    const done = (msg: string) => () => toast('success', msg);
    const fail = (e: Error) => toast('error', e.message);
    if (w.kind === 'join') {
      if (approve) approveJoin.mutate({ id: w.id }, { onSuccess: done('기관 합류를 승인했어요.'), onError: fail });
      else rejectJoin.mutate({ id: w.id }, { onSuccess: done('합류 요청을 거절했어요.'), onError: fail });
      return;
    }
    if (approve) {
      if (!me.data?.id) return;
      approveGuardian.mutate(
        { id: w.id, userId: me.data.id },
        { onSuccess: done('보호자 연결을 승인했어요.'), onError: fail },
      );
    } else {
      rejectGuardian.mutate({ id: w.id }, { onSuccess: done('연결 요청을 거절했어요.'), onError: fail });
    }
  }

  function onSave() {
    if (!org.data) return;
    if (!name.trim()) return toast('error', '기관 이름을 입력해주세요.');
    save.mutate(
      { id: org.data.id, name: name.trim() },
      {
        onSuccess: () => toast('success', '기관 이름을 저장했어요.'),
        onError: (e) => toast('error', e.message),
      },
    );
  }

  return (
    <>
      <PageHeader
        title="기관 관리"
        descMax={547}
        description="기관 정보와 구성원을 관리합니다. 어르신 데이터는 기관에 귀속됩니다."
      />

      {/* 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다. */}
      <div className="relative -ml-[323px] w-[1440px]" style={{ marginTop: HEADER_GAP, height: Y(pageBottom) + 86 - Y(315) }}>
        <div
          data-fx="131:962"
          className="absolute left-[322px] h-[360px] w-[1054px] rounded-[10px] bg-white shadow-card"
          style={{ top: Y(CARD1_TOP) - Y(315) }}
        >
          <h2
            data-fx="131:963"
            className="absolute left-[66px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          >
            기관 정보
          </h2>
          <label
            data-fx="131:964"
            htmlFor="org-name"
            className="absolute left-[67px] top-[119.35px] whitespace-nowrap text-w-body font-semibold leading-[24px] text-ink-900"
          >
            기관 이름
          </label>
          <input
            id="org-name"
            data-fx="131:965"
            value={name}
            disabled={!isAdmin}
            onChange={(e) => setName(e.target.value)}
            placeholder="요양원·복지관 등 기관 이름"
            className="absolute left-[66px] top-[154.38px] h-[57.05px] w-[576px] rounded-[10px] border border-line bg-white px-[29px] text-[18px] leading-[21px] text-ink-900 placeholder:text-ink-500 focus:border-accent focus:outline-none disabled:bg-mute-pale disabled:text-ink-500"
          />
          <button
            type="button"
            data-fx="131:966"
            disabled={!isAdmin || save.isPending}
            onClick={onSave}
            className="absolute left-[651px] top-[154.38px] h-[57.05px] w-[102px] rounded-[10px] bg-accent text-w-sub font-semibold leading-[29px] text-white disabled:opacity-60"
          >
            저장
          </button>
          <p
            data-fx="131:1093"
            className="absolute left-[68px] top-[219.43px] whitespace-nowrap text-[16px] leading-[28px] text-ink-400"
          >
            {isAdmin ? '요양원·복지관 등 기관 이름' : '기관 이름은 기관 관리자만 바꿀 수 있어요.'}
          </p>
          <p
            data-fx="131:1095"
            className="absolute left-[66px] top-[281.48px] whitespace-nowrap text-[18px] leading-[28px] text-ink-400"
          >
            {/* 기관이 없으면 만들지 않는다 */}
            기관 ID: {org.data?.id ?? '—'}
          </p>
        </div>

        <div
          data-fx="131:993"
          className="absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
          style={{ top: Y(CARD2_TOP) - Y(315), height: card2Height }}
        >
          <h2
            data-fx="131:1002"
            className="absolute left-[66px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          >
            구성원
          </h2>
          <p
            data-fx="131:1003"
            className="absolute left-[66px] top-[93.68px] whitespace-nowrap text-[18px] leading-[28px] text-ink-400"
          >
            기관에 소속된 계정 목록입니다. 담당 어르신 {elders.length}명.
          </p>
          <div data-fx="131:1007" className="absolute left-[66px] top-[154px] h-px w-[922px] bg-line" />

          {rows.length === 0 ? (
            <p
              className="absolute left-[66px] w-[922px] text-w-body leading-[30px] text-ink-500"
              style={{ top: MEMBER_TOP + 20 }}
            >
              {isConfigured ? '구성원이 없습니다.' : 'Supabase 연동 후 구성원이 표시됩니다.'}
            </p>
          ) : (
            rows.map((m, i) => {
              const top = MEMBER_TOP + i * MEMBER_PITCH;
              return (
                <div key={m.id}>
                  <span
                    data-fx={i === 0 ? '131:1008' : undefined}
                    className={cn(
                      'absolute flex h-[33px] w-[119px] items-center justify-center rounded-pill',
                      'bg-accent-soft text-w-body font-medium leading-[28px] text-ink-900',
                    )}
                    style={{ left: 66, top: top + 48 }}
                  >
                    {ROLE_LABEL[m.role] ?? m.role}
                  </span>
                  <Avatar
                    data-fx={i === 0 ? '131:1101' : undefined}
                    name={m.name ?? ''}
                    px={79}
                    className="absolute"
                    style={{ left: 217, top: top + 22 }}
                  />
                  <span
                    data-fx={i === 0 ? '131:1005' : undefined}
                    className="absolute whitespace-nowrap text-w-body leading-[28px] text-ink-900"
                    style={{ left: 328, top: top + 34.75 }}
                  >
                    {m.name ?? '—'}
                  </span>
                  <span
                    data-fx={i === 0 ? '131:1004' : undefined}
                    className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-500"
                    style={{ left: 328, top: top + 69.78 }}
                  >
                    {m.email ?? '—'}
                  </span>
                  {i < rows.length - 1 ? (
                    <div
                      data-fx={i === 0 ? '131:1006' : undefined}
                      className="absolute left-[66px] h-px w-[922px] bg-line"
                      style={{ top: top + 124 }}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* 카드3 · 승인 대기 — 대기 건이 있을 때만 그린다(Figma 에 없는 화면, 위 주석 참조) */}
        {waiting.length > 0 ? (
          <div
            className="absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
            style={{ top: Y(card3Top) - Y(315), height: card3Height }}
          >
            <h2 className="absolute left-[66px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900">
              승인 대기 {waiting.length}건
            </h2>
            <p className="absolute left-[66px] top-[93.68px] whitespace-nowrap text-[18px] leading-[28px] text-ink-400">
              승인하면 그때부터 기록에 접근할 수 있어요. 요청한 사람이 맞는지 확인하고 승인해 주세요.
            </p>
            <div className="absolute left-[66px] top-[154px] h-px w-[922px] bg-line" />

            {waiting.map((w, i) => {
              const top = MEMBER_TOP + i * MEMBER_PITCH;
              const busy =
                approveJoin.isPending ||
                approveGuardian.isPending ||
                rejectJoin.isPending ||
                rejectGuardian.isPending;
              return (
                <div key={w.key}>
                  <span
                    className={cn(
                      'absolute flex h-[33px] w-[119px] items-center justify-center rounded-pill',
                      'text-w-body font-medium leading-[28px] text-ink-900',
                      w.kind === 'join' ? 'bg-accent-soft' : 'bg-info-soft',
                    )}
                    style={{ left: 66, top: top + 48 }}
                  >
                    {WAITING_LABEL[w.kind]}
                  </span>
                  <Avatar name={w.who} px={79} className="absolute" style={{ left: 217, top: top + 22 }} />
                  <span
                    className="absolute whitespace-nowrap text-w-body leading-[28px] text-ink-900"
                    style={{ left: 328, top: top + 34.75 }}
                  >
                    {/* 어느 어르신에 대한 요청인지 없으면 만들지 않는다 */}
                    {w.elder ? `${w.who} → ${w.elder} 어르신` : w.who}
                  </span>
                  <span
                    className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-500"
                    style={{ left: 328, top: top + 69.78 }}
                  >
                    {[w.detail, dateDot(w.at)].filter(Boolean).join(' · ') || '—'}
                  </span>

                  {w.selfRequest ? (
                    <span
                      className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-500"
                      style={{ left: 700, top: top + 52 }}
                    >
                      본인 요청은 다른 담당자가 승인해요
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => decide(w, true)}
                        className="absolute h-[44px] w-[96px] rounded-[10px] bg-accent text-w-sub font-semibold leading-[30px] text-white disabled:opacity-50"
                        style={{ left: 780, top: top + 44 }}
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRejecting(w)}
                        className="absolute h-[44px] w-[96px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent disabled:opacity-50"
                        style={{ left: 892, top: top + 44 }}
                      >
                        거절
                      </button>
                    </>
                  )}

                  {i < waiting.length - 1 ? (
                    <div
                      className="absolute left-[66px] h-px w-[922px] bg-line"
                      style={{ top: top + 124 }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(rejecting)}
        title="요청을 거절할까요?"
        description={
          rejecting
            ? `${rejecting.who} 님의 ${WAITING_LABEL[rejecting.kind]} 요청을 거절합니다. 다시 요청할 수 있어요.`
            : ''
        }
        confirmLabel="거절"
        onConfirm={() => {
          if (rejecting) decide(rejecting, false);
        }}
        onClose={() => setRejecting(null)}
      />
    </>
  );
}
