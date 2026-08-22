// 보호자 — 어르신 연결 (Figma 31:616 연결 전 · 50:528 연결 후 · 69:320 여러 어르신)
//   제목 @(322,169) · 부제 2줄 w562 @(322,236.16)
//   카드1 1054×457 @(322,340) — 연결 코드 입력
//     제목 @(87,27) · 단계 3칸 @(87|470|854, 106.3) 원 26 · 잇는 선 192×1 @(239|623,118) ·
//     안내 @(86,170.34) · 입력 878×57 @(88,216.37) · 버튼 878×71 @(88,314)
//   카드2 1054×559 @(322,861) — 연결 과정 안내
//     제목 @(87,27) · 원 94 @(156|484|806, 113) · 라벨 @113·221.7 · 설명 @(87|425|750, 263.75)
//     화살표 14.25×22 @(362|697, 155) · 도움말 박스 868×120.1 @(87,375.82)
//
// ⚠️ 화살표는 좌우 반전 노드라 metadata(698.22,1037.81)가 렌더 위치가 아니다 — 잉크 실측(684,1016).
// ⚠️ 연결은 **어르신 코드**로 요청하고 요양보호사가 승인한다(`link_guardian_by_elder_code`).
//    승인 전에는 아무 기록도 보이지 않는다 — RLS 가 최종 방어선이다.
import { useMemo, useState } from 'react';
import { useLinkGuardianByElderCode, useMyGuardianLinks } from '@giokon/data';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import { cn } from '../../lib/utils';

const Y = (v: number) => v - 122;

const CARD1_TOP = 340;
const CARD2_TOP = 861;

/** 진행 단계 — 코드 입력 → 승인 대기 → 연결 완료. */
const STEPS = ['코드 입력', '승인 대기', '연결 완료'];
/** 안내 3단계(원 94 + 라벨 + 설명). */
const GUIDE = [
  { icon: asset.gStepCode, w: 47.74, h: 52.17, label: '코드 입력',
    desc: '담당 요양보호사에게 받은 코드를 입력하고 연결을 요청합니다.', circle: 156, descLeft: 87, descW: 232 },
  { icon: asset.gStepWait, w: 45, h: 45.03, label: '승인 대기',
    desc: '요양보호사가 요청을 확인하고 승인하면 연결이 완료됩니다.', circle: 484, descLeft: 425, descW: 212 },
  { icon: asset.gStepDone, w: 46, h: 38, label: '연결 완료',
    desc: '공개된 일지와 대화 분석 등의 소식을 확인할 수 있습니다.', circle: 806, descLeft: 750, descW: 205 },
];

export function ConnectPage() {
  const { isConfigured } = useAuth();
  const links = useMyGuardianLinks({ enabled: isConfigured });
  const link = useLinkGuardianByElderCode();
  const toast = useStore((s) => s.toast);
  const [code, setCode] = useState('');

  const rows = useMemo(() => links.data ?? [], [links.data]);
  const approved = useMemo(() => rows.filter((l) => l.status === 'approved'), [rows]);
  const pending = useMemo(() => rows.filter((l) => l.status === 'pending'), [rows]);
  /** 진행 단계 — 승인된 연결이 있으면 3, 대기 중이면 2, 아니면 1. */
  const step = approved.length > 0 ? 3 : pending.length > 0 ? 2 : 1;

  function submit() {
    const value = code.trim().toUpperCase();
    if (!value) return toast('error', '연결 코드를 입력해주세요.');
    if (!isConfigured) return toast('error', 'Supabase 연동 후 연결할 수 있어요.');
    link.mutate(
      { code: value },
      {
        onSuccess: () => {
          setCode('');
          toast('success', '연결을 요청했어요. 요양보호사가 승인하면 소식이 보여요.');
        },
        onError: (e) => toast('error', e.message),
      },
    );
  }

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] h-[1386px] w-[1440px]">
      <h1
        data-fx="46:77"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[70px] text-ink-900"
        style={{ top: Y(169) }}
      >
        {/* 연결 상태를 그대로 말한다 — 없는 연결을 있는 것처럼 쓰지 않는다 */}
        {approved.length > 0
          ? '연결된 어르신의 소식을 확인하세요'
          : pending.length > 0
            ? '요양보호사의 승인을 기다리고 있어요'
            : '아직 연결된 어르신이 없어요'}
      </h1>
      <p
        data-fx="46:94"
        className="absolute left-[322px] w-[562px] text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.16), wordBreak: 'keep-all' }}
      >
        요양보호사에게 받은 연결 코드를 입력하시면 공개된 요양일지와 AI 회상 대화 요약을 확인할 수
        있어요.
      </p>

      {/* ── 연결 코드 입력 ─────────────────────────────────────────── */}
      <div
        data-fx="46:89"
        className="absolute left-[322px] h-[457px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD1_TOP) }}
      >
        <h2
          data-fx="46:96"
          className="absolute left-[87px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        >
          연결 코드 입력
        </h2>

        {STEPS.map((label, i) => {
          const on = step >= i + 1;
          return (
            <div key={label}>
              <span
                data-fx={i === 0 ? '46:110' : undefined}
                className={cn(
                  'absolute flex h-[26px] w-[26px] items-center justify-center rounded-full text-[16px] font-semibold leading-[16px]',
                  on ? 'bg-accent text-white' : 'bg-mute-strong text-ink-500',
                )}
                style={{ left: 87 + i * 383, top: 108 }}
              >
                {i + 1}
              </span>
              <span
                data-fx={i === 0 ? '46:113' : undefined}
                className={cn(
                  'absolute whitespace-nowrap text-w-body leading-[30px]',
                  on ? 'text-ink-900' : 'text-ink-500',
                )}
                style={{ left: 125 + i * 383, top: 106.3 }}
              >
                {label}
              </span>
              {i < STEPS.length - 1 ? (
                <div
                  data-fx={i === 0 ? '46:127' : undefined}
                  className="absolute h-px w-[192px] bg-line"
                  style={{ left: 239 + i * 384, top: 118 }}
                />
              ) : null}
            </div>
          );
        })}

        <p
          data-fx="46:97"
          className="absolute left-[86px] top-[170.34px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        >
          담당 요양보호사에게 전달받은 연결 코드를 입력해 주세요.
        </p>
        <input
          data-fx="46:101"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          aria-label="어르신 연결 코드"
          placeholder="연결 코드 입력 (예: K7M2Q9RXTV)"
          className="absolute left-[88px] top-[216.37px] h-[57.04px] w-[878px] rounded-[10px] border border-line bg-white px-[32px] text-w-body leading-[24px] text-ink-900 placeholder:text-ink-500 focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          data-fx="46:107"
          disabled={link.isPending}
          onClick={submit}
          className="absolute left-[88px] top-[314px] h-[71px] w-[878px] rounded-[10px] bg-accent text-w-section font-semibold leading-[29px] text-white disabled:opacity-60"
        >
          연결 요청하기
        </button>
      </div>

      {/* ── 연결 과정 안내 ─────────────────────────────────────────── */}
      <div
        data-fx="46:137"
        className="absolute left-[322px] h-[559px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD2_TOP) }}
      >
        <h2
          data-fx="46:138"
          className="absolute left-[87px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        >
          연결 과정 안내
        </h2>
        {GUIDE.map((g, i) => (
          <div key={g.label}>
            <span
              data-fx={i === 0 ? '46:140' : undefined}
              className="absolute flex h-[94px] w-[94px] items-center justify-center rounded-full bg-accent-tint"
              style={{ left: g.circle, top: 113 }}
            >
              <img src={g.icon} alt="" className="block" style={{ width: g.w, height: g.h }} />
            </span>
            <span
              data-fx={i === 0 ? '46:141' : undefined}
              className="absolute w-[82px] text-center text-w-body leading-[30px] text-ink-900"
              style={{ left: g.circle + 6, top: 221.72 }}
            >
              {g.label}
            </span>
            <p
              data-fx={i === 0 ? '46:143' : undefined}
              className="absolute text-[18px] leading-[28px] text-ink-500"
              style={{ left: g.descLeft, top: 263.75, width: g.descW, wordBreak: 'keep-all' }}
            >
              {g.desc}
            </p>
            {i < GUIDE.length - 1 ? (
              <img
                data-fx={i === 0 ? '46:184' : undefined}
                src={asset.gStepArrow}
                alt=""
                className="absolute block"
                style={{ left: 362 + i * 335, top: 155, width: 14.25, height: 22 }}
              />
            ) : null}
          </div>
        ))}

        <div
          data-fx="46:198"
          className="absolute left-[87px] h-[120.08px] w-[868px] rounded-[10px] border border-line bg-white"
          style={{ top: 375.82 }}
        >
          <p
            data-fx="46:203"
            className="absolute left-[53px] top-[30.02px] whitespace-nowrap text-[22px] font-semibold leading-[30px] text-ink-700"
          >
            도움이 필요하신가요?
          </p>
          <p
            data-fx="46:201"
            className="absolute left-[53px] top-[65.04px] whitespace-nowrap text-[18px] leading-[21px] text-ink-500"
          >
            연결 방법을 잘 모르겠다면 요양보호사에게 문의해 주세요.
          </p>
          <a
            data-fx="46:205"
            href="/guide"
            className="absolute flex h-[50.03px] w-[213px] items-center rounded-[10px] border border-line bg-white"
            style={{ left: 600, top: 35.02 }}
          >
            <span
              data-fx="46:207"
              className="absolute left-[34px] whitespace-nowrap text-w-body leading-[30px] text-ink-900"
            >
              연결 방법 안내
            </span>
            <img
              src={asset.iconChevronRightSm}
              alt=""
              className="absolute left-[178.21px] block"
              style={{ width: 12.18, height: 18.73 }}
            />
          </a>
        </div>
      </div>
    </div>
  );
}
