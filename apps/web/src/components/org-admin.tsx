// 기관 관리 — 권한 위임 · 기관 설정 카드 (파일럿 W6 후반 · SCR-W18 — Figma 시안 없음)
//
// 시안이 없는 카드라 기관 관리의 **카드2(구성원) 리듬을 그대로** 쓴다(계획 §7 디자인 결정 2026-09-24):
//   카드 1054 r10 shadow-card · 제목 @(66,27) Bold 25/70 · 설명 @(66,93.68) 18/28 ink-400 · 구분선 922 @(66,154) ·
//   오른쪽 위 주 버튼 134×44 @(854,40)(카드4 '코드 만들기'와 같은 자리) · 입력 h57.05 r10 1px line 글자 18(카드1 기관 이름).
//
// 사용자 결정(2026-09-26): 관리 역할이 아닌 직원에게도 **읽기 전용으로** 보여 준다(누가 무엇을 할 수 있는지 안다) ·
//   권한표는 체크를 모아 **저장 버튼**으로 한 번에 저장한다(권한 변경은 감사 로그에 남는 제도 증빙).
// ⚠️ 편집 판정은 서버(RLS — org_admin·center_director)가 한다. 화면은 잠그고 이유를 말할 뿐이다.
// ⚠️ AI 초안 스위치(ai_drafts_enabled)는 플랫폼 운영자만 켠다 — 편집 UI 를 만들지 않고 상태만 보여 준다.
import { useMemo, useState, type ReactNode } from 'react';
import {
  CARE_TEAM_ROLES,
  ORG_CAPABILITIES,
  ORG_ROLE_LABEL,
  parseTopicList,
  useOrgCapabilities,
  useOrgSettings,
  useUpdateOrgCapabilities,
  useUpdateOrgSettings,
  type CapabilityTable,
  type OrgCapability,
  type OrgRole,
} from '@giokon/data';
import { asset } from '../assets/ui';
import { useStore } from '../store/store';
import { orgJoinErrorMessage } from '../lib/orgJoinErrors';
import { cn } from '../lib/utils';

const CARD = 'absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card';
const TITLE = 'absolute left-[66px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900';
const DESC = 'absolute left-[66px] top-[93.68px] w-[922px] text-[18px] leading-[28px] text-ink-400';
const SAVE =
  'absolute left-[854px] top-[40px] h-[44px] w-[134px] rounded-[10px] bg-accent text-w-sub font-semibold leading-[30px] text-white disabled:opacity-50';
const LABEL = 'absolute whitespace-nowrap text-w-body font-semibold leading-[24px] text-ink-900';
const INPUT =
  'absolute h-[57.05px] rounded-[10px] border border-line bg-white px-[29px] text-[18px] leading-[21px] text-ink-900 placeholder:text-ink-500 focus:border-accent focus:outline-none disabled:bg-mute-pale disabled:text-ink-500';

const CAPABILITY_TEXT: Record<OrgCapability, { label: string; help: string }> = {
  journal_finalize: { label: '일지 확정', help: '프로그램 일지 확정 · 확정 뒤 수정(사유 필수)' },
  share_revoke: { label: '공개 철회', help: '보호자에게 공개한 기록 거두기' },
  guardian_link_approve: { label: '보호자 연결 승인', help: '보호자의 어르신 연결 요청 승인' },
};

/** 권한표 — 첫 행 시작(머리글 아래)·행 피치. */
const CAP_ROW_TOP = 220;
const CAP_ROW_PITCH = 76;
export const CAPABILITIES_CARD_H = CAP_ROW_TOP + ORG_CAPABILITIES.length * CAP_ROW_PITCH + 24;

/** 기관 설정 — 두 열(66 · 548, 폭 440)과 줄 기준(라벨 → 입력 +35). */
const COL = [66, 548];
const COL_W = 440;
const SETTING_ROWS = [180, 304, 428];
const AI_LINE_TOP = 576;
export const SETTINGS_CARD_H = AI_LINE_TOP + 28 + 60;

const FACILITY_LABEL: Record<string, string> = { '': '정하지 않음', nursing_home: '요양원', day_care: '주간보호' };
const TARGET_MINUTES = [5, 6, 7, 8, 9, 10];

/** 관리 역할이 아니면 보이는 안내 — 잠근 이유. */
function readOnlyNote(isManager: boolean, what: string): string {
  return isManager ? '' : ` ${what}은 기관 관리자·센터장만 바꿀 수 있어요.`;
}

/** 입력 칸 틀의 드롭다운 — 시안의 큰 꺾쇠(221:680)를 오른쪽에. */
function FieldSelect({ id, value, onChange, disabled, left, top, width, children }: {
  id: string; value: string; onChange: (v: string) => void; disabled: boolean;
  left: number; top: number; width: number; children: ReactNode;
}) {
  return (
    <div className="absolute" style={{ left, top, width, height: 57.05 }}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT, 'left-0 top-0 w-full cursor-pointer appearance-none pr-[56px] disabled:cursor-not-allowed')}
      >
        {children}
      </select>
      <img
        src={asset.iconChevronDownLg}
        alt=""
        className="pointer-events-none absolute right-[27px] top-1/2 block -translate-y-1/2"
        style={{ width: 19.29, height: 13.02 }}
      />
    </div>
  );
}

export function CapabilitiesCard({ top, orgId, isManager, enabled }: {
  top: number; orgId: string | undefined; isManager: boolean; enabled: boolean;
}) {
  const toast = useStore((s) => s.toast);
  const caps = useOrgCapabilities({ enabled });
  const save = useUpdateOrgCapabilities();
  const [draft, setDraft] = useState<CapabilityTable | null>(null);
  // 서버 값이 바뀌면(저장 후 다시 읽기 · 다른 관리자) 고치던 표를 버리고 새 값으로 그린다(렌더 중 상태 조정).
  const [seen, setSeen] = useState(caps.data);
  if (seen !== caps.data) {
    setSeen(caps.data);
    setDraft(null);
  }
  const table = draft ?? caps.data ?? null;
  const changed = useMemo(() => {
    if (!draft || !caps.data) return {} as Partial<CapabilityTable>;
    const out: Partial<CapabilityTable> = {};
    for (const c of ORG_CAPABILITIES) {
      const a = [...draft[c]].sort().join(',');
      const b = [...caps.data[c]].sort().join(',');
      if (a !== b) out[c] = draft[c];
    }
    return out;
  }, [draft, caps.data]);
  const dirty = Object.keys(changed).length > 0;

  function toggle(c: OrgCapability, role: OrgRole, on: boolean) {
    if (!table) return;
    const roles = table[c].filter((r) => r !== role);
    setDraft({ ...table, [c]: on ? [...roles, role] : roles });
  }

  function onSave() {
    if (!orgId || !dirty) return;
    save.mutate(
      { orgId, changes: changed },
      {
        onSuccess: () => toast('success', '권한 위임을 저장했어요.'),
        onError: (e) => toast('error', orgJoinErrorMessage(e, '권한 위임을 저장하지 못했어요.')),
      },
    );
  }

  return (
    <div className={CARD} style={{ top, height: CAPABILITIES_CARD_H }}>
      <h2 className={TITLE}>권한 위임</h2>
      {isManager ? (
        <button type="button" className={SAVE} disabled={!dirty || save.isPending} onClick={onSave}>
          저장
        </button>
      ) : null}
      <p className={DESC} style={{ wordBreak: 'keep-all' }}>
        체크한 역할의 직원이 그 일을 할 수 있어요.{readOnlyNote(isManager, '권한표')}
      </p>
      <div className="absolute left-[66px] top-[154px] h-px w-[922px] bg-line" />

      {caps.isError ? (
        // 조회 실패를 '권한 없음'으로 보이지 않게 한다.
        <p role="alert" className="absolute left-[66px] w-[922px] text-w-body leading-[30px] text-alert" style={{ top: CAP_ROW_TOP }}>
          권한표를 불러오지 못했어요. 권한이 없다는 뜻은 아닙니다.
        </p>
      ) : !table ? (
        <p className="absolute left-[66px] w-[922px] text-w-body leading-[30px] text-ink-500" style={{ top: CAP_ROW_TOP }}>
          {enabled ? '권한표를 불러오고 있어요.' : 'Supabase 연동 후 권한표가 표시됩니다.'}
        </p>
      ) : (
        // 표 — 권한 열 394(66~460) + 역할 열 120 × 4(가운데 520·640·760·880). 머리글 52 · 행 76.
        <table className="absolute left-[66px] top-[168px] w-[874px] table-fixed border-collapse">
          <caption className="sr-only">역할별 위임 권한</caption>
          <colgroup>
            <col style={{ width: 394 }} />
            {CARE_TEAM_ROLES.map((r) => <col key={r} style={{ width: 120 }} />)}
          </colgroup>
          <thead>
            <tr className="h-[52px] align-top">
              <th scope="col" className="text-left text-[18px] font-semibold leading-[28px] text-ink-700">권한</th>
              {CARE_TEAM_ROLES.map((role) => (
                <th key={role} scope="col" className="whitespace-nowrap text-center text-[18px] font-semibold leading-[28px] text-ink-700">
                  {ORG_ROLE_LABEL[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORG_CAPABILITIES.map((c) => (
              <tr key={c} style={{ height: CAP_ROW_PITCH }} className="align-top">
                <th scope="row" className="text-left font-normal">
                  <span className="block whitespace-nowrap text-w-body font-semibold leading-[28px] text-ink-900">
                    {CAPABILITY_TEXT[c].label}
                  </span>
                  <span className="block whitespace-nowrap text-[16px] leading-[24px] text-ink-500">
                    {CAPABILITY_TEXT[c].help}
                  </span>
                </th>
                {CARE_TEAM_ROLES.map((role) => (
                  <td key={role} className="pt-[12px] text-center">
                    <input
                      type="checkbox"
                      aria-label={`${CAPABILITY_TEXT[c].label} — ${ORG_ROLE_LABEL[role]}`}
                      checked={table[c].includes(role)}
                      disabled={!isManager || save.isPending}
                      onChange={(e) => toggle(c, role, e.target.checked)}
                      className="inline-block h-[24px] w-[24px] cursor-pointer accent-accent disabled:cursor-not-allowed"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function OrgSettingsCard({ top, orgId, isManager, enabled }: {
  top: number; orgId: string | undefined; isManager: boolean; enabled: boolean;
}) {
  const toast = useStore((s) => s.toast);
  const settings = useOrgSettings({ enabled });
  const save = useUpdateOrgSettings();
  const row = settings.data;

  // 서버 값 → 폼(문자열). 행이 없으면 서버 기본값(목표 10분 · 기본 프로그램 유형).
  const base = useMemo(
    () => ({
      facility: row?.facility_type ?? '',
      minutes: String(row?.target_minutes ?? 10),
      programType: row?.default_program_type ?? '인지활동 - 회상훈련',
      location: row?.default_location ?? '',
      topics: (row?.default_avoid_topics ?? []).join(', '),
    }),
    [row],
  );
  const [form, setForm] = useState(base);
  // 서버 값이 바뀌면(저장 후 다시 읽기 · 다른 관리자) 폼을 다시 심는다(렌더 중 상태 조정).
  const [seen, setSeen] = useState(base);
  if (seen !== base) {
    setSeen(base);
    setForm(base);
  }
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const topics = parseTopicList(form.topics);
  const dirty =
    form.facility !== base.facility ||
    form.minutes !== base.minutes ||
    form.programType.trim() !== base.programType ||
    form.location.trim() !== base.location ||
    topics.join('\n') !== parseTopicList(base.topics).join('\n');
  const locked = !isManager || save.isPending;

  function onSave() {
    if (!orgId || !dirty) return;
    if (!form.programType.trim()) return toast('error', '기본 프로그램 유형을 입력해 주세요.');
    save.mutate(
      {
        orgId,
        patch: {
          facility_type: (form.facility || null) as 'nursing_home' | 'day_care' | null,
          target_minutes: Number(form.minutes),
          default_program_type: form.programType.trim(),
          default_location: form.location.trim() || null,
          default_avoid_topics: topics,
        },
      },
      {
        onSuccess: () => toast('success', '기관 설정을 저장했어요.'),
        onError: (e) => toast('error', orgJoinErrorMessage(e, '기관 설정을 저장하지 못했어요.')),
      },
    );
  }

  const [r1, r2, r3] = SETTING_ROWS;
  return (
    <div className={CARD} style={{ top, height: SETTINGS_CARD_H }}>
      <h2 className={TITLE}>기관 설정</h2>
      {isManager ? (
        <button type="button" className={SAVE} disabled={!dirty || save.isPending || !row} onClick={onSave}>
          저장
        </button>
      ) : null}
      <p className={DESC} style={{ wordBreak: 'keep-all' }}>
        새 세션과 직접 쓰는 일지의 기본값이에요. 세션 1회는 최대 10분이에요.{readOnlyNote(isManager, '기관 설정')}
      </p>
      <div className="absolute left-[66px] top-[154px] h-px w-[922px] bg-line" />

      {settings.isError ? (
        <p role="alert" className="absolute left-[66px] w-[922px] text-w-body leading-[30px] text-alert" style={{ top: r1 }}>
          기관 설정을 불러오지 못했어요. 설정이 없다는 뜻은 아닙니다.
        </p>
      ) : null}

      <label htmlFor="org-facility" className={LABEL} style={{ left: COL[0], top: r1 }}>시설 유형</label>
      <FieldSelect id="org-facility" value={form.facility} disabled={locked} onChange={(v) => set('facility', v)}
        left={COL[0]} top={r1 + 35} width={COL_W}>
        {Object.entries(FACILITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </FieldSelect>
      <label htmlFor="org-minutes" className={LABEL} style={{ left: COL[1], top: r1 }}>목표 시간</label>
      <FieldSelect id="org-minutes" value={form.minutes} disabled={locked} onChange={(v) => set('minutes', v)}
        left={COL[1]} top={r1 + 35} width={COL_W}>
        {TARGET_MINUTES.map((m) => <option key={m} value={String(m)}>{m}분</option>)}
      </FieldSelect>

      <label htmlFor="org-program-type" className={LABEL} style={{ left: COL[0], top: r2 }}>기본 프로그램 유형</label>
      <input id="org-program-type" className={INPUT} style={{ left: COL[0], top: r2 + 35, width: COL_W }} maxLength={60}
        value={form.programType} disabled={locked} onChange={(e) => set('programType', e.target.value)} />
      <label htmlFor="org-location" className={LABEL} style={{ left: COL[1], top: r2 }}>기본 장소</label>
      <input id="org-location" className={INPUT} style={{ left: COL[1], top: r2 + 35, width: COL_W }} maxLength={60}
        value={form.location} disabled={locked} placeholder="예: 2층 프로그램실" onChange={(e) => set('location', e.target.value)} />

      <label htmlFor="org-avoid" className={LABEL} style={{ left: COL[0], top: r3 }}>기본 피할 주제</label>
      <input id="org-avoid" className={INPUT} style={{ left: COL[0], top: r3 + 35, width: 922 }}
        value={form.topics} disabled={locked} placeholder="예: 전쟁, 병원, 돌아가신 가족"
        aria-describedby="org-avoid-help" onChange={(e) => set('topics', e.target.value)} />
      <p id="org-avoid-help" className="absolute left-[66px] whitespace-nowrap text-[16px] leading-[28px] text-ink-500" style={{ top: r3 + 35 + 57.05 + 6 }}>
        쉼표로 구분해요 · 최대 30개 · 지금 {topics.length}개
      </p>

      <p className="absolute left-[66px] whitespace-nowrap text-[18px] leading-[28px] text-ink-700" style={{ top: AI_LINE_TOP }}>
        AI 일지 초안: <span className="font-semibold text-ink-900">{row ? (row.ai_drafts_enabled ? '켜짐' : '꺼짐') : '—'}</span>
        <span className="text-ink-500"> · 기억온 운영팀이 기관별로 켜고 꺼요. 꺼져 있으면 대화가 끝난 뒤 빈 일지가 만들어져요.</span>
      </p>
    </div>
  );
}
