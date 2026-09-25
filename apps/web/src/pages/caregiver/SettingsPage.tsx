// 설정 (Figma 121:598 — 1440×2258)
//   제목 @169 · 부제 w223 @236.21
//   카드1 1054×460 @(322,315) 계정 정보 — 이름 입력 576×57 · 저장 102×57 ·
//         이메일/전화번호/역할/소속 기관 2열(왼 389 · 오른 695)
//   카드2 1054×261 @(322,842) 내 데이터 다운로드 — 버튼 237×57 @(66,155)
//   카드3 1054×854 @(322,1170) 계정 삭제 — 5행(배지 119×33 @66 · 항목 @218 · 설명 @218)
//   카드4 1054×80 @(322,2091) 하단 바 — 방패 21.3×26 · 처리방침·약관 · 비의료 고지
//
// ⚠️ 계정 삭제는 **셀프서비스가 아니다**(시안 문구 그대로) — 기관 관리자·지원 채널 접수.
//    화면은 처리 기준만 알린다.
// ⚠️ 다운로드는 지금 화면이 이미 받은 데이터(계정·담당 어르신 연대기·동의)를 JSON 으로 묶는다.
//    받지 못한 항목은 넣지 않는다(빈 배열) — 없는 데이터를 만들지 않는다.
import { useMemo, useState } from 'react';
import {
  toElderProfile,
  useCurrentUser,
  useOrganization,
  useProfiles,
  useUpdateMyName,
  ORG_ROLE_LABEL,
  type UserRow,
} from '@giokon/data';
import { PageHeader } from '../../components/Layout';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';

const Y = (v: number) => v - 122;
/** PageHeader(제목+설명) 블록이 끝나는 266 에서 첫 카드(315)까지의 간격. */
const HEADER_GAP = 49;

const CARD1_TOP = 315;
const CARD2_TOP = 842;
const CARD3_TOP = 1170;
const CARD4_TOP = 2091;
/** 계정 삭제 표의 첫 행(구분선 1362 아래)과 세로 피치. */
const RULE_TOP = 238;
const RULE_PITCH = 122;

// 사회복지사·센터장까지 — 역할 이름은 @giokon/data 한 곳에서(파일럿 W6).
const ROLE_LABEL: Record<string, string> = ORG_ROLE_LABEL;

/** 계정 삭제 시 데이터 처리 기준(시안 5행). 문구는 컴플라이언스 근거라 그대로 옮긴다. */
const DELETION_RULES = [
  { tone: 'mute', badge: '기관 재귀속', item: '어르신(profiles)·연대기·세션·대화로그',
    note: '기관 귀속 데이터 - 요양보호사 삭제 시 기관 관리자에게 재귀속(파기 아님)' },
  { tone: 'accent', badge: '파기', item: '음성 원본(Storage)',
    note: '민감정보 - 보관기간 만료분 즉시 파기' },
  { tone: 'mute', badge: '익명화 보존', item: '동의 이력(consents)',
    note: '동의·철회 증빙은 보존하되 계정 식별 링크(user_id) 해제 · 관련 분쟁 소멸시효 경과 후 파기' },
  { tone: 'mute', badge: '법정 보존', item: '접속·처리기록(audit_log)',
    note: '안전성 확보조치 기준 의무 보존 · 최소 2년 경과 후 파기' },
  { tone: 'accent', badge: '파기', item: '계정 식별정보(auth.users·public.users)',
    note: '재귀속·보존 처리 완료 후 본인 식별정보' },
] as const;

// 계정 정보의 라벨·값은 Regular 18 이다(시안 121:743 실측 — 폼 라벨과 다르다).
const FIELD_LABEL = 'absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-700';
const FIELD_VALUE = 'absolute whitespace-nowrap text-[18px] leading-[21px] text-ink-700';

export function SettingsPage() {
  const me = useCurrentUser();
  // 폼 초기값은 서버 값이다 — 로드된 뒤에 마운트해 effect 로 되심지 않는다.
  return <SettingsBody key={me.data?.id ?? 'none'} me={me.data ?? null} />;
}

function SettingsBody({ me }: { me: UserRow | null }) {
  const { isConfigured } = useAuth();
  const org = useOrganization({ enabled: isConfigured });
  const profiles = useProfiles();
  const rename = useUpdateMyName();
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState(me?.name ?? '');

  const elders = useMemo(() => (profiles.data ?? []).map(toElderProfile), [profiles.data]);
  const card3Height = RULE_TOP + DELETION_RULES.length * RULE_PITCH + 54;

  function onSave() {
    if (!me) return;
    if (!name.trim()) return toast('error', '이름을 입력해 주세요.');
    rename.mutate(
      { id: me.id, name: name.trim() },
      {
        onSuccess: () => toast('success', '이름을 저장했어요.'),
        onError: (e) => toast('error', e.message),
      },
    );
  }

  function onDownload() {
    const payload = {
      exportedAt: new Date().toISOString(),
      account: me
        ? { id: me.id, name: me.name, email: me.email, phone: me.phone, role: me.role }
        : null,
      organization: org.data ? { id: org.data.id, name: org.data.name } : null,
      elders: elders.map((e) => ({
        id: e.id, name: e.name, birthYear: e.birthYear, birthDate: e.birthDate ?? null,
        hometown: e.hometown ?? null, family: e.family ?? null, job: e.job ?? null,
        hobbies: e.hobbies ?? null,
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `giokon-내데이터-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('success', 'JSON 파일을 내려받았어요.');
  }

  return (
    <>
      <PageHeader title="설정" descMax={223} description="계정과 데이터를 관리합니다." />

      {/* 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다. */}
      <div className="relative -ml-[323px] w-[1440px]" style={{ marginTop: HEADER_GAP, height: Y(CARD4_TOP) + 80 + 87 - Y(CARD1_TOP) }}>
        {/* ── 계정 정보 ─────────────────────────────────────────────── */}
        <div
          data-fx="121:736"
          className="absolute left-[322px] h-[460px] w-[1054px] rounded-[10px] bg-white shadow-card"
          style={{ top: 0 }}
        >
          <h2
            data-fx="121:737"
            className="absolute left-[66px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          >
            계정 정보
          </h2>
          {/* 연필 — 이름 칸으로 보내는 표시다(수정은 아래 입력에서 한다) */}
          <button
            type="button"
            data-fx="334:537"
            aria-label="이름 수정"
            onClick={() => document.getElementById('set-name')?.focus()}
            className="absolute block"
            style={{ left: 974, top: 49, width: 22, height: 22 }}
          >
            <img src={asset.iconPencilMd} alt="" className="block h-full w-full" />
          </button>
          {/* 폼 라벨은 SemiBold 20 이다(아래 정보 라벨 Regular 18 과 다르다) */}
          <label
            data-fx="121:739"
            htmlFor="set-name"
            className="absolute whitespace-nowrap text-w-body font-semibold leading-[24px] text-ink-900"
            style={{ left: 67, top: 119.38 }}
          >
            이름
          </label>
          <input
            id="set-name"
            data-fx="121:740"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="absolute left-[66px] top-[154.42px] h-[57.05px] w-[576px] rounded-[10px] border border-line bg-white px-[29px] text-[18px] leading-[21px] text-ink-900 focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            data-fx="121:754"
            disabled={rename.isPending}
            onClick={onSave}
            className="absolute left-[651px] top-[154.42px] h-[57.05px] w-[102px] rounded-[10px] bg-accent text-w-sub font-semibold leading-[29px] text-white disabled:opacity-60"
          >
            저장
          </button>

          {[
            { fxL: '121:743', fxV: '121:769', label: '이메일', value: me?.email, left: 67 },
            { fxL: '121:771', fxV: '121:772', label: '전화번호', value: me?.phone, left: 373 },
            { fxL: '121:774', fxV: '121:775', label: '역할', value: me ? (ROLE_LABEL[me.role] ?? me.role) : null, left: 67, row: 1 },
            { fxL: '121:776', fxV: '121:777', label: '소속 기관', value: org.data?.name, left: 373, row: 1 },
          ].map((f) => (
            <div key={f.label}>
              <span data-fx={f.fxL} className={FIELD_LABEL} style={{ left: f.left, top: 250.5 + (f.row ?? 0) * 89.08 }}>
                {f.label}
              </span>
              <span data-fx={f.fxV} className={FIELD_VALUE} style={{ left: f.left, top: 289.54 + (f.row ?? 0) * 89.08 }}>
                {/* 값이 없으면 만들지 않는다 */}
                {f.value ?? '—'}
              </span>
            </div>
          ))}
        </div>

        {/* ── 내 데이터 다운로드 ─────────────────────────────────────── */}
        <div
          data-fx="123:836"
          className="absolute left-[322px] h-[261px] w-[1054px] rounded-[10px] bg-white shadow-card"
          style={{ top: CARD2_TOP - CARD1_TOP }}
        >
          <h2
            data-fx="123:837"
            className="absolute left-[66px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          >
            내 데이터 다운로드
          </h2>
          <p
            data-fx="125:858"
            className="absolute left-[66px] top-[97.83px] whitespace-nowrap text-[18px] leading-[28px] text-ink-400"
          >
            계정 정보, 담당 어르신 연대기, 동의 이력을 이식 가능한 JSON으로 내려받습니다(개인정보 이동권).
          </p>
          <button
            type="button"
            data-fx="125:862"
            onClick={onDownload}
            className="absolute left-[66px] top-[155px] flex h-[57px] w-[237px] items-center rounded-[10px] border border-accent bg-white"
          >
            <img src={asset.iconDownload} alt="" className="absolute left-[30px] block" style={{ width: 18, height: 18.02 }} />
            <span className="absolute left-[59px] whitespace-nowrap text-w-sub font-semibold leading-[30px] text-accent">
              JSON으로 다운로드
            </span>
          </button>
        </div>

        {/* ── 계정 삭제 ─────────────────────────────────────────────── */}
        <div
          data-fx="126:871"
          className="absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
          style={{ top: CARD3_TOP - CARD1_TOP, height: card3Height }}
        >
          <h2
            data-fx="126:872"
            className="absolute left-[66px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          >
            계정 삭제
          </h2>
          <p
            data-fx="126:873"
            className="absolute left-[66px] top-[98.12px] w-[853px] text-[18px] leading-[28px] text-ink-400"
            style={{ wordBreak: 'keep-all' }}
          >
            어르신 데이터는 기관에 귀속되므로 아래 기준에 따라 처리됩니다. 삭제 요청은 기관 관리자
            또는 지원 채널로 접수해 주세요 (서버 연동 후 셀프서비스 제공 예정).
          </p>
          <div data-fx="127:909" className="absolute left-[66px] top-[192px] h-px w-[922px] bg-line" />
          {DELETION_RULES.map((r, i) => {
            const top = RULE_TOP + i * RULE_PITCH;
            return (
              <div key={r.item}>
                <span
                  data-fx={i === 0 ? '127:896' : undefined}
                  className={`absolute flex h-[33px] w-[119px] items-center justify-center rounded-pill text-w-body font-medium leading-[28px] text-ink-900 ${
                    r.tone === 'accent' ? 'bg-accent-soft' : 'bg-mute'
                  }`}
                  style={{ left: 66, top }}
                >
                  {r.badge}
                </span>
                <span
                  data-fx={i === 0 ? '127:890' : undefined}
                  className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-900"
                  style={{ left: 218, top: top - 12.76 }}
                >
                  {r.item}
                </span>
                <span
                  data-fx={i === 0 ? '127:893' : undefined}
                  className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-400"
                  style={{ left: 218, top: top + 22.27 }}
                >
                  {r.note}
                </span>
                {i < DELETION_RULES.length - 1 ? (
                  <div
                    data-fx={i === 0 ? '127:891' : undefined}
                    className="absolute left-[66px] h-px w-[922px] bg-line"
                    style={{ top: top + 76 }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {/* ── 하단 바 ───────────────────────────────────────────────── */}
        <div
          data-fx="131:940"
          className="absolute left-[322px] h-[80px] w-[1054px] rounded-[10px] bg-white shadow-card"
          style={{ top: CARD4_TOP - CARD1_TOP }}
        >
          <img
            data-fx="126:889"
            src={asset.iconShieldMd}
            alt=""
            className="absolute block"
            style={{ left: 66, top: 28, width: 21.27, height: 25.99 }}
          />
          <a
            data-fx="131:945"
            href="/privacy"
            className="absolute whitespace-nowrap text-[18px] leading-[21px] text-ink-700 underline"
            style={{ left: 110, top: 31.88 }}
          >
            개인정보처리방침
          </a>
          <span className="absolute text-[18px] leading-[21px] text-ink-400" style={{ left: 251, top: 31.88 }}>
            |
          </span>
          <a
            data-fx="131:946"
            href="/terms"
            className="absolute whitespace-nowrap text-[18px] leading-[21px] text-ink-700 underline"
            style={{ left: 274, top: 31.88 }}
          >
            이용약관
          </a>
          <p
            data-fx="131:949"
            className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-400"
            style={{ left: 364, top: 28.88 }}
          >
            기억온은 의료기기가 아니며, 인지활동 보조 서비스입니다.
          </p>
        </div>
      </div>
    </>
  );
}
