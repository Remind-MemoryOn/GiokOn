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
import { Link, useSearchParams } from 'react-router-dom';
import {
  toElderProfile,
  useLinkGuardianByElderCode,
  useMyGuardianLinks,
  useMySharedContent,
  useOrganization,
  useProfile,
  useProfiles,
  useRevokeGuardianLink,
  type ProfileGuardianRow,
} from '@giokon/data';
import { birthLabel, dateDot, elderAge } from '@giokon/core';
import { asset } from '../../assets/ui';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { useAuth } from '../../auth/AuthProvider';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { feedHref } from '../../lib/guardianElder';
import { useElderPhotoUrls } from '../../lib/elderPhotos';
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
  const [params] = useSearchParams();
  const all = useMyGuardianLinks({ enabled: isConfigured });
  const approved = (all.data ?? []).filter((l) => l.status === 'approved');
  // 새 코드로 다시 연결할 때는 연결 전 화면(코드 입력)을 그대로 쓴다.
  if (params.get('relink') === '1') return <ConnectForm />;
  if (approved.length > 1) return <MultiConnectView links={approved} />;
  if (approved.length === 1) return <ConnectedView link={approved[0]} />;
  return <ConnectForm />;
}

function ConnectForm() {
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
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[70px] text-accent"
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

/** 연결 후(50:528) — 승인된 연결이 있을 때. */
function ConnectedView({ link }: { link: ProfileGuardianRow }) {
  const { isConfigured } = useAuth();
  const profileQuery = useProfile(link.profile_id);
  const org = useOrganization({ enabled: isConfigured });
  const shared = useMySharedContent({ enabled: isConfigured });
  const revoke = useRevokeGuardianLink();
  const toast = useStore((s) => s.toast);
  /** 연결 해제 확인 — 되돌릴 수 없어 확인을 받는다(네이티브 confirm 금지). */
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );
  const photos = useElderPhotoUrls(elder?.photoPath ? [elder.photoPath] : [], isConfigured);
  /** 마지막 활동 = 가장 최근에 공개된 항목 시각. 없으면 만들지 않는다. */
  const lastAt = useMemo(() => {
    const list = shared.data?.shares ?? [];
    return list.length > 0 ? list[0].shared_at : null;
  }, [shared.data]);
  const linkedAt = link.approved_at ?? link.created_at;

  function unlink() {
    revoke.mutate(
      { id: link.id },
      {
        onSuccess: () => toast('success', '연결을 해제했어요.'),
        onError: (e) => toast('error', e.message),
      },
    );
  }

  return (
    <div className="relative -ml-[323px] h-[1278px] w-[1440px]">
      <h1
        data-fx="50:243"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[70px] text-accent"
        style={{ top: Y(169) }}
      >
        연결된 어르신
      </h1>
      <p
        data-fx="50:245"
        className="absolute left-[322px] w-[562px] text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.17), wordBreak: 'keep-all' }}
      >
        현재 연결된 어르신 정보를 확인하고 공개된 요양일지와 AI 회상 대화 요약을 확인할 수 있어요.
      </p>
      <Link
        to={feedHref(link.profile_id)}
        data-fx="69:615"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1285, top: Y(197.14) }}
      >
        <img src={asset.iconChevronRightSm} alt="" className="block rotate-180" style={{ width: 12.18, height: 18.73 }} />
        돌아가기
      </Link>

      {/* ── 어르신 카드 ─────────────────────────────────────────────── */}
      <div
        data-fx="50:354"
        className="absolute left-[322px] h-[340px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(347) }}
      >
        <Avatar
          data-fx="50:378"
          src={elder?.photoPath ? photos.data?.[elder.photoPath] : undefined}
          name={elder?.name ?? ''}
          px={175}
          shape="rounded"
          className="absolute"
          style={{ left: 88, top: 68 }}
        />
        <span
          data-fx="50:355"
          className="absolute whitespace-nowrap text-[35px] font-bold leading-[70px] text-ink-900"
          style={{ left: 298, top: 73 }}
        >
          {elder?.name ?? '—'}
        </span>
        <span
          data-fx="50:370"
          className="absolute whitespace-nowrap text-[24px] leading-[30px] text-ink-700"
          style={{ left: 298, top: 155.36 }}
        >
          {/* 생년월일·나이는 아는 만큼만 쓴다 */}
          {elder ? `${birthLabel(elder)}${elder.birthYear ? ` (${elderAge(elder)}세)` : ''}` : '—'}
        </span>
        <span
          data-fx="50:380"
          className="absolute whitespace-nowrap text-[24px] leading-[30px] text-ink-700"
          style={{ left: 298, top: 203.39 }}
        >
          {org.data?.name ?? '—'}
        </span>
        <Badge data-fx="50:387" tone="live" tag className="absolute" style={{ left: 129, top: 253, width: 100 }}>
          연결됨
        </Badge>

        <div
          data-fx="50:406"
          className="absolute h-[239px] w-[319px] rounded-[10px] bg-accent/[0.05]"
          style={{ left: 647, top: 48 }}
        >
          {/* ⚠️ 내보낸 글리프(88×87)와 Figma 박스(19×20.01) 의 비율이 6% 다르다.
              object-contain 이라야 박스는 실측 그대로 두면서 그림이 눌리지 않는다. */}
          <img
            src={asset.iconCaregiver}
            alt=""
            className="absolute block object-contain"
            style={{ left: 60.92, top: 47.32, width: 19, height: 20.01 }}
          />
          <span className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-500" style={{ left: 97, top: 42.31 }}>
            담당 요양보호사
          </span>
          <span className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-900" style={{ left: 97, top: 83.34 }}>
            {/* 보호자에게는 담당자 이름이 공개 항목이 아니면 보이지 않는다 */}
            {link.approved_by ? '담당 요양보호사' : '—'}
          </span>
          <img src={asset.iconCalendar} alt="" className="absolute block" style={{ left: 61, top: 137.38, width: 21, height: 21.02 }} />
          <span className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-500" style={{ left: 97, top: 133.38 }}>
            연결일
          </span>
          <span className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-900" style={{ left: 97, top: 174.41 }}>
            {dateDot(linkedAt)}
          </span>
        </div>
      </div>

      {/* ── 연결 관리 ───────────────────────────────────────────────── */}
      <div
        data-fx="50:408"
        className="absolute left-[322px] h-[559px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(753) }}
      >
        <h2
          data-fx="50:409"
          className="absolute left-[85px] top-[27px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        >
          연결 관리
        </h2>
        {/* ⚠️ 세로 구분선은 180° 회전 노드라 metadata y(1070)가 아래끝이다 — 실제는 864~1070. */}
        <div data-fx="50:438" className="absolute h-[206px] w-px bg-line" style={{ left: 431, top: 111 }} />
        <div data-fx="50:451" className="absolute h-[206px] w-px bg-line" style={{ left: 722, top: 111 }} />

        <span data-fx="50:413" className="absolute left-[86px] top-[111.62px] whitespace-nowrap text-[22px] font-semibold leading-[30px] text-ink-900">
          연결 정보
        </span>
        {[
          { fx: '50:414', label: '연결 상태' },
          { fx: '50:418', label: '연결 코드' },
          { fx: '50:420', label: '연결일' },
          { fx: '50:421', label: '마지막 활동' },
        ].map((r, i) => (
          <span
            key={r.label}
            data-fx={r.fx}
            className="absolute whitespace-nowrap text-[18px] leading-[29px] text-ink-500"
            style={{ left: 86, top: 162.65 + i * 42.03 }}
          >
            {r.label}
          </span>
        ))}
        <Badge data-fx="50:430" tone="live" className="absolute w-[67px]" style={{ left: 319, top: 163.99 }}>
          양호
        </Badge>
        <span
          data-fx="50:432"
          className="absolute whitespace-nowrap text-[18px] leading-[21px] text-ink-900"
          style={{ left: 270, top: 206.69 }}
        >
          {/* 어르신 코드는 보호자에게 공개하지 않는다(elder_codes 미열람) */}
          —
        </span>
        <span
          data-fx="50:434"
          className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-900"
          style={{ left: 292, top: 246.71 }}
        >
          {dateDot(linkedAt)}
        </span>
        <span
          data-fx="50:435"
          className="absolute whitespace-nowrap text-[18px] leading-[28px] text-ink-900"
          style={{ left: 242, top: 289.74 }}
        >
          {lastAt ? `${dateDot(lastAt)} ${new Date(lastAt).getHours()}:${String(new Date(lastAt).getMinutes()).padStart(2, '0')}` : '—'}
        </span>

        <span data-fx="50:440" className="absolute left-[469px] top-[111.62px] whitespace-nowrap text-[22px] font-semibold leading-[30px] text-ink-900">
          연결 해제
        </span>
        <p
          data-fx="50:441"
          className="absolute left-[469px] top-[162.65px] w-[216px] text-[18px] leading-[28px] text-ink-500"
          style={{ wordBreak: 'keep-all' }}
        >
          연결을 해제하면 공개된 기록을 더 이상 확인할 수 없어요.
        </p>
        <button
          type="button"
          data-fx="50:455"
          onClick={() => setConfirmUnlink(true)}
          className="absolute h-[57px] w-[158px] rounded-[10px] border border-accent bg-white text-w-sub font-semibold leading-[30px] text-accent"
          style={{ left: 469, top: 255 }}
        >
          연결 해제하기
        </button>

        <ConfirmDialog
          open={confirmUnlink}
          title="연결을 해제할까요?"
          description="해제하면 공개된 기록을 더 이상 볼 수 없어요. 연결 코드로 다시 연결할 수 있습니다."
          confirmLabel="연결 해제"
          onConfirm={unlink}
          onClose={() => setConfirmUnlink(false)}
        />

        <span data-fx="50:460" className="absolute left-[768px] top-[107.61px] whitespace-nowrap text-[22px] font-semibold leading-[30px] text-ink-900">
          다시 연결하기
        </span>
        <p
          data-fx="50:461"
          className="absolute left-[768px] top-[158.65px] w-[201px] text-[18px] leading-[28px] text-ink-500"
          style={{ wordBreak: 'keep-all' }}
        >
          새로운 연결 코드를 입력하여 다시 연결할 수 있어요.
        </p>
        <Link
          to="/guardian?relink=1"
          data-fx="50:463"
          className="absolute flex h-[57px] w-[173px] items-center rounded-[10px] bg-accent"
          style={{ left: 768, top: 251 }}
        >
          <img src={asset.iconRefresh} alt="" className="absolute left-[24px] block" style={{ width: 19.03, height: 17.97 }} />
          <span className="absolute left-[51px] whitespace-nowrap text-w-sub font-semibold leading-[30px] text-white">
            다시 연결하기
          </span>
        </Link>

        <div
          data-fx="50:501"
          className="absolute h-[120.09px] w-[883px] rounded-[10px] border border-line bg-white"
          style={{ left: 85, top: 376.81 }}
        >
          <p
            data-fx="50:504"
            className="absolute left-[53px] top-[30.02px] whitespace-nowrap text-[22px] font-semibold leading-[30px] text-ink-700"
          >
            연결 코드를 다시 받으셨나요?
          </p>
          <p
            data-fx="50:503"
            className="absolute left-[53px] top-[65.05px] whitespace-nowrap text-[18px] leading-[21px] text-ink-500"
          >
            담당 요양보호사님에게 새로운 연결 코드를 받아 다시 연결해보세요.
          </p>
          <a
            data-fx="50:502"
            href="/guide"
            className="absolute flex h-[50.03px] w-[213px] items-center rounded-[10px] border border-line bg-white"
            style={{ left: 619, top: 35.03 }}
          >
            <span data-fx="50:505" className="absolute left-[34px] whitespace-nowrap text-w-body leading-[30px] text-ink-900">
              연결 방법 안내
            </span>
            <img src={asset.iconChevronRightSm} alt="" className="absolute left-[177.21px] block" style={{ width: 12.18, height: 18.73 }} />
          </a>
        </div>
      </div>
    </div>
  );
}

// ── 여러 어르신 연결 (Figma 69:320 — 1440×1587) ─────────────────────────────
//   제목 @(322,169) · 부제 2줄 w562 @(322,236.15) · + 새 어르신 연결 190×57 @(1180,211)
//   카드 1054×340 @(322,347) 피치 406 — 사진 187 @(+86,+53) · 이름 Bold 35/70 @(+322,+41) ·
//   나이·기관 Medium 24/30 @(+322,+108.29) · 정보 3줄(라벨 Regular 22 · 값 Bold 22) ·
//   연결됨 배지 100×35.25 @(+130,+252) · 더보기 @(+864,+155.32)
//
// ⚠️ 더보기 화살표는 반전 노드라 metadata x(1273.66)가 렌더 위치가 아니다 — 프레임 오른끝 − 폭.
const MULTI = {
  cardTop: 347,
  pitch: 406,
  h: 340,
  photo: { left: 86, top: 53, px: 187 },
  name: { left: 322, top: 41 },
  meta: { left: 322, top: 108.29 },
  badge: { left: 130, top: 252, w: 100, h: 35.25 },
  more: { left: 864, top: 155.32, chevron: { left: 938, top: 180.95, w: 13.66, h: 20.97 } },
};

/** 정보 3줄 — 아이콘·라벨·값의 카드 안 상대 좌표(실측). */
const MULTI_ROWS = [
  { key: 'caregiver', icon: asset.iconCaregiver, iconAt: [323, 164.32, 19, 20.01], label: '담당 요양보호사', labelLeft: 360, valueLeft: 516, top: 159.32, fx: '69:336' },
  { key: 'linked', icon: asset.iconCalendar, iconAt: [321, 207.35, 25, 25.02], label: '연결일', labelLeft: 363, valueLeft: 440, top: 204.35, fx: '69:442' },
  { key: 'updated', icon: asset.iconClock, iconAt: [321, 256.38, 25, 25.02], label: '최근 업데이트', labelLeft: 363, valueLeft: 503, top: 254.38, fx: '69:454' },
] as const;

function MultiConnectView({ links }: { links: ProfileGuardianRow[] }) {
  const { isConfigured } = useAuth();
  const profiles = useProfiles({ enabled: isConfigured });
  const org = useOrganization({ enabled: isConfigured });
  const byId = useMemo(
    () => new Map((profiles.data ?? []).map((p) => [p.id, p])),
    [profiles.data],
  );
  const photoPaths = useMemo(
    () => (profiles.data ?? []).map((p) => p.photo_path).filter((v): v is string => Boolean(v)),
    [profiles.data],
  );
  const photos = useElderPhotoUrls(photoPaths, isConfigured);

  const bottom = MULTI.cardTop + (links.length - 1) * MULTI.pitch + MULTI.h;

  return (
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: Y(bottom) + 88 }}>
      <h1
        data-fx="69:321"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[70px] text-accent"
        style={{ top: Y(169) }}
      >
        연결된 어르신
      </h1>
      <p
        data-fx="69:322"
        className="absolute left-[322px] w-[562px] text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.15), wordBreak: 'keep-all' }}
      >
        현재 연결된 모든 어르신을 확인하고, 공개된 기록을 확인해보세요.
      </p>
      <Link
        to="/guardian?relink=1"
        data-fx="69:445"
        className="absolute flex h-[57px] w-[190px] items-center rounded-[10px] border border-accent bg-white"
        style={{ left: 1180, top: Y(211) }}
      >
        <span
          data-fx="69:446"
          className="absolute left-[33px] top-[10px] h-[30px] whitespace-nowrap text-[18px] font-semibold leading-[30px] text-accent"
        >
          {/* 시안은 + 만 25, 글자는 18 이다(잉크 폭 실측). */}
          <span className="text-[25px] leading-[30px]">+</span>
          <span className="leading-[30px]"> 새 어르신 연결</span>
        </span>
      </Link>

      {links.map((link, i) => {
        const p = byId.get(link.profile_id);
        const elder = p ? toElderProfile(p) : null;
        const top = MULTI.cardTop + i * MULTI.pitch;
        const url = p?.photo_path ? photos.data?.[p.photo_path] : undefined;
        // 기관 이름은 우리가 읽을 수 있는 기관(내 소속)일 때만 쓴다 — 다른 기관은 RLS 로 막힌다.
        const orgName = p && org.data && p.org_id === org.data.id ? org.data.name : null;
        const age = elder?.birthYear ? `${elderAge(elder)}세` : null;
        const values: Record<string, string> = {
          // 담당 요양보호사 이름은 보호자 권한으로 읽을 경로가 없다 → 빈 값.
          caregiver: '—',
          linked: dateDot(link.approved_at ?? link.created_at),
          updated: dateDot(link.updated_at),
        };
        return (
          <div
            key={link.id}
            data-fx={i === 0 ? '69:323' : undefined}
            className="absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
            style={{ top: Y(top), height: MULTI.h }}
          >
            {url ? (
              <img
                data-fx={i === 0 ? '69:329' : undefined}
                src={url}
                alt={elder?.name ?? ''}
                className="absolute block rounded-[10px] object-cover"
                style={{ left: MULTI.photo.left, top: MULTI.photo.top, width: MULTI.photo.px, height: MULTI.photo.px }}
              />
            ) : (
              <Avatar
                data-fx={i === 0 ? '69:329' : undefined}
                name={elder?.name ?? ''}
                px={MULTI.photo.px}
                shape="rounded"
                className="absolute"
                style={{ left: MULTI.photo.left, top: MULTI.photo.top }}
              />
            )}
            <Link
              to={feedHref(link.profile_id)}
              data-fx={i === 0 ? '69:326' : undefined}
              className="absolute whitespace-nowrap text-[35px] font-bold leading-[70px] text-ink-900"
              style={{ left: MULTI.name.left, top: MULTI.name.top }}
            >
              {elder ? `${elder.name} 어르신` : '—'}
            </Link>
            <p
              data-fx={i === 0 ? '69:327' : undefined}
              className="absolute whitespace-pre text-[24px] font-medium leading-[30px] text-ink-700"
              style={{ left: MULTI.meta.left, top: MULTI.meta.top }}
            >
              {/* 나이도 기관도 근거가 없으면 만들지 않는다 */}
              {`${age ?? '—'}   I    ${orgName ?? '—'}`}
            </p>

            {MULTI_ROWS.map((row) => (
              <div key={row.key}>
                {/* object-contain: 내보낸 글리프와 Figma 박스의 비율이 어긋나도 눌리지 않는다 */}
                <img
                  src={row.icon}
                  alt=""
                  aria-hidden
                  className="absolute block object-contain"
                  style={{ left: row.iconAt[0], top: row.iconAt[1], width: row.iconAt[2], height: row.iconAt[3] }}
                />
                <span
                  data-fx={i === 0 ? row.fx : undefined}
                  className="absolute whitespace-nowrap text-[22px] leading-[30px] text-ink-700"
                  style={{ left: row.labelLeft, top: row.top }}
                >
                  {row.label}
                </span>
                <span
                  className="absolute whitespace-nowrap text-[22px] font-bold leading-[30px] text-ink-900"
                  style={{ left: row.valueLeft, top: row.top }}
                >
                  {values[row.key]}
                </span>
              </div>
            ))}

            <Badge
              data-fx={i === 0 ? '69:331' : undefined}
              tone="live"
              tag
              className="absolute"
              style={{ left: MULTI.badge.left, top: MULTI.badge.top, width: MULTI.badge.w, height: MULTI.badge.h }}
            >
              연결됨
            </Badge>
            <Link
              to={feedHref(link.profile_id)}
              data-fx={i === 0 ? '69:508' : undefined}
              className="absolute whitespace-nowrap text-[22px] leading-[30px] text-ink-700"
              style={{ left: MULTI.more.left, top: MULTI.more.top }}
            >
              더보기
            </Link>
            <img
              src={asset.iconChevronRightSm}
              alt=""
              aria-hidden
              className="absolute block"
              style={{
                left: MULTI.more.chevron.left, top: MULTI.more.chevron.top,
                width: MULTI.more.chevron.w, height: MULTI.more.chevron.h,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
