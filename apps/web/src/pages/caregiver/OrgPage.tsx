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
import { useMemo, useState } from 'react';
import {
  toElderProfile,
  useCurrentUser,
  useOrgMembers,
  useOrganization,
  useProfiles,
  useUpdateOrganization,
  type OrganizationRow,
} from '@giokon/data';
import { PageHeader } from '../../components/Layout';
import { Avatar } from '../../components/ui/Avatar';
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

  const [name, setName] = useState(orgRow?.name ?? '');

  const isAdmin = me.data?.role === 'org_admin';
  const elders = useMemo(() => (profiles.data ?? []).map(toElderProfile), [profiles.data]);
  const rows = members.data ?? [];
  /** 카드 높이는 구성원 수에서 계산한다(시안은 2명 고정). */
  const card2Height = MEMBER_TOP + Math.max(rows.length, 1) * MEMBER_PITCH + 114;

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
      <div className="relative -ml-[323px] w-[1440px]" style={{ marginTop: HEADER_GAP, height: Y(CARD2_TOP) + card2Height + 86 - Y(315) }}>
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
      </div>
    </>
  );
}
