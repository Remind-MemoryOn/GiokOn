// 보호자 — 설정 (Figma 334:697 — 1440×1248)
//   제목 @169 · 부제 w223 @236.21
//   카드1 1054×377 @(322,315) 계정 정보 — 이름 입력 576×57 · 저장 102×57 · 이메일/전화번호 2열
//   카드2 1054×251 @(322,750) 알림·버전 — 행 제목 SemiBold 20 · 설명 18 · 구분선 922 @122
//   카드3 1054×80 @(322,1058) 하단 바 — 방패 21.3×26 · 처리방침·약관 · 비의료 고지
//
// 요양보호사 설정(121:598)과 계정 카드·하단 바가 같은 좌표다 — 값만 다르다.
// ⚠️ 알림 설정 행에는 시안에 화살표가 있지만 **여는 화면이 디자인에 없고** 알림 센터도
//    아직 배선 전이다(Phase 2) → 행은 그대로 그리되 누를 수 없게 둔다.
import { useState } from 'react';
import { useCurrentUser, useUpdateMyName, type UserRow } from '@giokon/data';
import { PageHeader } from '../../components/Layout';
import { asset } from '../../assets/ui';
import { useStore } from '../../store/store';
import { APP_VERSION } from '../../lib/version';

const HEADER_GAP = 49;

const CARD1_TOP = 315;
const CARD2_TOP = 750;
const CARD3_TOP = 1058;

// 계정 정보의 라벨·값은 Regular 18 이다(폼 라벨 SemiBold 20 과 다르다).
const FIELD_LABEL = 'absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-700';
const FIELD_VALUE = 'absolute whitespace-nowrap text-[18px] leading-[21px] text-ink-700';

export function SettingsPage() {
  const me = useCurrentUser();
  // 폼 초기값은 서버 값이다 — 로드된 뒤에 마운트해 effect 로 되심지 않는다.
  return <SettingsBody key={me.data?.id ?? 'none'} me={me.data ?? null} />;
}

function SettingsBody({ me }: { me: UserRow | null }) {
  const rename = useUpdateMyName();
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState(me?.name ?? '');

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

  return (
    <>
      <PageHeader title="설정" descMax={223} description="계정과 데이터를 관리합니다." />

      {/* 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다. */}
      <div
        className="relative -ml-[323px] w-[1440px]"
        style={{ marginTop: HEADER_GAP, height: CARD3_TOP - CARD1_TOP + 80 + 110 }}
      >
        {/* ── 계정 정보 ─────────────────────────────────────────────── */}
        <div
          data-fx="334:765"
          className="absolute left-[322px] h-[377px] w-[1054px] rounded-[10px] bg-white shadow-card"
          style={{ top: 0 }}
        >
          <h2
            data-fx="334:766"
            className="absolute left-[66px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
          >
            계정 정보
          </h2>
          {/* 연필 — 이름 칸으로 보내는 표시다(수정은 아래 입력에서 한다) */}
          <button
            type="button"
            data-fx="334:815"
            aria-label="이름 수정"
            onClick={() => document.getElementById('g-set-name')?.focus()}
            className="absolute block"
            style={{ left: 974, top: 49, width: 22, height: 22 }}
          >
            <img src={asset.iconPencilMd} alt="" className="block h-full w-full" />
          </button>
          <label
            data-fx="334:767"
            htmlFor="g-set-name"
            className="absolute whitespace-nowrap text-w-body font-semibold leading-[24px] text-ink-900"
            style={{ left: 67, top: 119.38 }}
          >
            이름
          </label>
          <input
            id="g-set-name"
            data-fx="334:768"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="absolute left-[66px] top-[154.42px] h-[57.05px] w-[576px] rounded-[10px] border border-line bg-white px-[29px] text-[18px] leading-[21px] text-ink-900 focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            data-fx="334:769"
            disabled={rename.isPending}
            onClick={onSave}
            className="absolute left-[651px] top-[154.42px] h-[57.05px] w-[102px] rounded-[10px] bg-accent text-w-sub font-semibold leading-[29px] text-white disabled:opacity-60"
          >
            저장
          </button>

          {[
            { fxL: '334:771', fxV: '334:773', label: '이메일', value: me?.email, left: 67 },
            { fxL: '334:774', fxV: '334:775', label: '전화번호', value: me?.phone, left: 373 },
          ].map((f) => (
            <div key={f.label}>
              <span data-fx={f.fxL} className={FIELD_LABEL} style={{ left: f.left, top: 250.5 }}>
                {f.label}
              </span>
              <span data-fx={f.fxV} className={FIELD_VALUE} style={{ left: f.left, top: 289.54 }}>
                {/* 값이 없으면 만들지 않는다 */}
                {f.value ?? '—'}
              </span>
            </div>
          ))}
        </div>

        {/* ── 알림 · 버전 ───────────────────────────────────────────── */}
        <div
          data-fx="334:540"
          className="absolute left-[322px] h-[251px] w-[1054px] rounded-[10px] bg-white shadow-card"
          style={{ top: CARD2_TOP - CARD1_TOP }}
        >
          <p
            data-fx="334:553"
            className="absolute whitespace-nowrap text-w-body font-semibold leading-[28px] text-ink-900"
            style={{ left: 75, top: 33.24 }}
          >
            알림 설정
          </p>
          <p
            data-fx="334:552"
            className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-400"
            style={{ left: 75, top: 68.27 }}
          >
            서비스 알림 및 이메일 수신 설정을 관리합니다.
          </p>
          {/* 여는 화면이 디자인에 없고 알림 센터도 배선 전이라 아직 누를 수 없다 */}
          <img
            data-fx="334:584"
            src={asset.iconChevronRightSm}
            alt=""
            aria-hidden
            className="absolute block opacity-40"
            style={{ left: 953.03, top: 73.58, width: 16.03, height: 24.61 }}
          />
          <div data-fx="334:554" className="absolute left-[66px] top-[122px] h-px w-[922px] bg-line" />
          <p
            data-fx="334:559"
            className="absolute whitespace-nowrap text-w-body font-semibold leading-[28px] text-ink-900"
            style={{ left: 75, top: 155.34 }}
          >
            웹 사이트 버전 정보
          </p>
          <p
            data-fx="334:558"
            className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-400"
            style={{ left: 75, top: 190.38 }}
          >
            {APP_VERSION}
          </p>
        </div>

        {/* ── 하단 바 ───────────────────────────────────────────────── */}
        <div
          data-fx="334:776"
          className="absolute left-[322px] h-[80px] w-[1054px] rounded-[10px] bg-white shadow-card"
          style={{ top: CARD3_TOP - CARD1_TOP }}
        >
          <img
            data-fx="334:777"
            src={asset.iconShieldMd}
            alt=""
            className="absolute block"
            style={{ left: 66, top: 28, width: 21.27, height: 25.99 }}
          />
          <a
            data-fx="334:783"
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
            data-fx="334:784"
            href="/terms"
            className="absolute whitespace-nowrap text-[18px] leading-[21px] text-ink-700 underline"
            style={{ left: 274, top: 31.88 }}
          >
            이용약관
          </a>
          <p
            data-fx="334:786"
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
