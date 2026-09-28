// 어르신 상세 (Figma 161:373 — 1440×3416 실측)
//   목록으로 @194 · 제목 Bold 30/40 @243 · 기본 정보 수정 188×57 @(1191,189)
//   프로필 1057×340 @343 · 기본 정보 447×419 @718 · 동의 관리 575×419 @(804,718)
//   어르신 코드 1057×337 @1173 · 세션 설계 1054×336 @1545 · 연대기 1054×429 @1916
//   대화 이력 1054×564 @2380 · 안전 이벤트 1054×271 @2980 · 삭제하기 @(1147,3295)
//
// 카드 높이가 디자인에 고정돼 있어 목록은 **디자인과 같은 줄 수만** 보여주고
// 나머지는 "자세히 보기"로 넘긴다(연대기 2 · 대화 이력 3 · 안전 이벤트 1).
// ⚠️ 동의 문구는 Figma 라벨이 아니라 `@giokon/core` 동의 카탈로그가 SoT 다(법무 문구가
//    바뀌면 화면이 따라와야 한다). 시안은 어르신 필수 동의 3종 기준이라 행 피치가 92 였는데,
//    법률 문서 확정본(2026-09-24)으로 4종이 되어 같은 카드(높이 419.25) 안에 들어가도록 74 로 줄였다.
//    첫 행의 좌표(시안 실측)는 그대로다.
// ⚠️ 특이사항(profiles.note)은 없을 수 있다 → 값을 만들지 않고 `—`(Figma 도 "-").
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useChronicles,
  useConsents,
  useElderCode,
  useOrganization,
  useProfile,
  useProfileCaregivers,
  useRotateElderCode,
  useSafetyEvents,
  useSessions,
  useDeleteProfile,
  CARE_GRADE_LABEL,
  careGradeRequired,
  useOrgSettings,
} from '@giokon/data';
import {
  CONSENT_CATALOG,
  birthLabel,
  elderAge,
  isKeyMemory,
  requiredConsents,
} from '@giokon/core';
import { asset } from '../../assets/ui';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import { useElderPhotoUrls } from '../../lib/elderPhotos';
import { cn, relativeDay } from '../../lib/utils';
import { Y } from '../../lib/figmaY';
import { useElderProfile } from '../../lib/elderProfile';
import { currentConsentOf } from '../../lib/consents';

/** 동의 행 세로 피치 — 시안 92(3행) → 4행이 카드 안에 들어가도록 74. */
const CONSENT_PITCH = 74;
/** 값이 없으면 만들어내지 않는다 — 화면은 `—`. */
const val = (v?: string | null) => (v && v.trim() ? v : '—');
/** 날짜 표기 — Figma 는 `2026.06.08` 처럼 두 자리로 채운다. */
const ymd = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

/** 카드(흰 배경 · #d9d9d9 테두리 · r10) — 좌표·크기는 Figma 실측 그대로. */
function Card({
  fx,
  left,
  top,
  width,
  height,
}: {
  fx: string;
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  return (
    <div
      data-fx={fx}
      className="absolute rounded-[10px] border border-line bg-white"
      style={{ left, top: Y(top), width, height }}
    />
  );
}

/** 섹션 제목 — Bold 25/70. */
function Title({ fx, left, top, children }: { fx: string; left: number; top: number; children: React.ReactNode }) {
  return (
    <h2
      data-fx={fx}
      className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
      style={{ left, top: Y(top) }}
    >
      {children}
    </h2>
  );
}

/** 섹션 부제 — Regular 18/28. 카드마다 색이 다르다(코드·설계·연대기 #7b7c7c / 이력 #404040). */
function Sub({
  fx,
  left,
  top,
  width,
  tone = 'mute',
  children,
}: {
  fx: string;
  left: number;
  top: number;
  width: number;
  tone?: 'mute' | 'ink';
  children: React.ReactNode;
}) {
  return (
    <p
      data-fx={fx}
      className={cn(
        'absolute text-w-sub leading-[28px]',
        tone === 'mute' ? 'text-ink-500' : 'text-ink-700',
      )}
      style={{ left, top: Y(top), width }}
    >
      {children}
    </p>
  );
}

/** 카드 우측 상단 액션 — 136×40, outline(자세히 보기) 또는 accent(+ 추가). */
function CardAction({
  fx,
  to,
  left,
  top,
  label,
  plus,
}: {
  fx?: string;
  to: string;
  left: number;
  top: number;
  label: string;
  plus?: boolean;
}) {
  return (
    <Link
      to={to}
      data-fx={fx}
      className={cn(
        'absolute flex h-[40px] w-[136px] items-center justify-center gap-[7px] rounded-[10px] border border-accent text-[18px] font-semibold leading-[30px]',
        plus ? 'bg-accent text-white' : 'bg-white text-accent',
      )}
      style={{ left, top: Y(top) }}
    >
      {plus ? <span className="text-[25px] leading-none">+</span> : null}
      {label}
    </Link>
  );
}

/** 알약 배지 — 실측 높이가 25(상태)와 35(연대기 출처)로 나뉜다. */
function Pill({
  fx,
  left,
  top,
  width,
  height,
  className,
  children,
}: {
  fx?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-fx={fx}
      className={cn(
        'absolute inline-flex items-center justify-center rounded-pill font-semibold',
        className,
      )}
      style={{ left, top: Y(top), width, height }}
    >
      {children}
    </span>
  );
}

/** 기본 정보 카드의 한 줄 — 라벨 18/28 #404040 @375 · 값 20/28 black @485. */
function InfoRow({ fx, top, label, value }: { fx: string; top: number; label: string; value: string }) {
  return (
    <>
      <span
        className="absolute left-[375px] w-[67px] text-w-sub leading-[28px] text-ink-700"
        style={{ top: Y(top) }}
      >
        {label}
      </span>
      <span
        data-fx={fx}
        className="absolute left-[485px] max-w-[231px] truncate text-w-body font-medium leading-[28px] text-ink-900"
        title={value}
        style={{ top: Y(top) }}
      >
        {value}
      </span>
    </>
  );
}

export function ElderDetailPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const { isConfigured } = useAuth();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const deleteProfile = useDeleteProfile();
  /** 삭제 확인 — 되돌릴 수 없고 사진·기록이 함께 파기돼 확인을 받는다(네이티브 confirm 금지). */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const profileQuery = useProfile(elderId);
  const org = useOrganization({ enabled: isConfigured });
  const settings = useOrgSettings({ enabled: isConfigured });
  const gradeRequired = careGradeRequired(settings.data?.facility_type);
  const careGrade = profileQuery.data?.care_grade ?? null;
  const assignments = useProfileCaregivers(elderId);
  const consents = useConsents(elderId);
  const code = useElderCode(elderId);
  const rotate = useRotateElderCode();
  const sessions = useSessions(elderId);
  const chronicles = useChronicles(elderId);
  const safety = useSafetyEvents(elderId);

  const elder = useElderProfile(profileQuery.data);
  const photos = useElderPhotoUrls(elder?.photoPath ? [elder.photoPath] : [], isConfigured);
  const photo = elder?.photoPath ? photos.data?.[elder.photoPath] : undefined;

  const active = (assignments.data ?? []).filter((a) => a.status === 'active');
  // 디자인은 담당자 '이름'을 보여준다 — 배정 훅이 caregiver 를 붙여 준다.
  const caregiverLabel =
    active.length === 0
      ? '—'
      : `${active[0].caregiver?.name ?? '담당자'}${active.length > 1 ? ` 외 ${active.length - 1}명` : ''}`;
  const consentRows = requiredConsents('elder').map((type) => ({
    type,
    label: CONSENT_CATALOG[type].label,
    // 체크 표시는 DB 에 남은 **유효한** 동의 증빙(현재 버전·미철회·부여)으로만 판단한다.
    done: Boolean(currentConsentOf(consents.data, type)),
  }));
  // 주요 기억은 '기본 정보 수정' 폼이 관리한다 → 연대기 목록에서는 감춘다(두 곳에서 지워지지 않게).
  const chronicleRows = (chronicles.data ?? []).filter((c) => !isKeyMemory(c.topic)).slice(0, 2);
  // 설계(planned)와 이력을 가른다 — 설계는 아직 일어나지 않은 일이라 "대화 이력" 이 아니다.
  const allSessions = sessions.data ?? [];
  const plannedRows = allSessions
    .filter((x) => x.status === 'planned')
    .sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''))
    .slice(0, 1);
  const sessionRows = allSessions.filter((x) => x.status !== 'planned').slice(0, 3);
  const safetyRows = (safety.data ?? []).slice(0, 1);

  if (profileQuery.isLoading) return null;
  if (!elder) {
    return (
      <p className="mt-[47px] text-w-body text-ink-500">
        {isConfigured ? '어르신을 찾을 수 없어요.' : 'Supabase 연동 후 어르신 정보가 표시됩니다.'}
      </p>
    );
  }

  const copyCode = async () => {
    const value = code.data?.code;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast('success', '어르신 코드를 복사했어요.');
    } catch {
      toast('error', '복사에 실패했어요. 코드를 길게 눌러 직접 복사해 주세요.');
    }
  };

  return (
    // 이 화면은 좌표가 화면 절대값이라 본문 안쪽 여백(pl-27)과 사이드바(296)를 되빼
    // 컨테이너를 페이지 원점(0)에 맞춘다.
    <div className="relative -ml-[323px] h-[3294px] w-[1440px]">
      {/* 목록으로 */}
      <Link
        to="/caregiver/elders"
        data-fx="161:552"
        className="absolute left-[322px] flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ top: Y(194.11) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        목록으로
      </Link>
      <h1
        data-fx="161:448"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(243) }}
      >
        어르신 상세
      </h1>
      <p
        data-fx="161:449"
        className="absolute left-[322px] w-[752px] text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(293.17) }}
      >
        ※ 어르신의 정보는 보호자와의 동의를 바탕으로 관리되며, 안전한 서비스 제공을 위해
        노력합니다.
      </p>
      <Link
        to={`/caregiver/elders/${elder.id}/edit`}
        data-fx="169:894"
        className="absolute flex h-[57px] w-[188px] items-center justify-center gap-[9px] rounded-[10px] border border-accent bg-accent text-[18px] font-semibold leading-[30px] text-white"
        style={{ left: 1191, top: Y(189) }}
      >
        <img src={asset.iconPencil} alt="" width={18} height={18} className="block" />
        기본 정보 수정
      </Link>

      {/* ── 프로필 ─────────────────────────────────────────────────────── */}
      <Card fx="161:704" left={322} top={343.2} width={1057} height={340.2} />
      <img
        data-fx="161:594"
        src={photo || asset.avatarDefault}
        alt={`${elder.name} 어르신 사진`}
        className="absolute left-[410px] h-[175px] w-[175px] rounded-pill object-cover"
        style={{ top: Y(411) }}
      />
      <Pill
        fx="161:597"
        left={451}
        top={596}
        width={100}
        height={35.25}
        className="bg-live-soft text-[20px] text-live"
      >
        연결됨
      </Pill>
      <p
        data-fx="161:591"
        className="absolute left-[620px] whitespace-nowrap text-[35px] font-bold leading-[70px] text-ink-900"
        style={{ top: Y(416) }}
      >
        {elder.name} 어르신
      </p>
      <p
        data-fx="161:592"
        className="absolute left-[620px] text-[24px] font-medium leading-[30px] text-ink-700"
        style={{ top: Y(498.29) }}
      >
        {birthLabel(elder)} ({elderAge(elder)}세)
      </p>
      <p
        data-fx="161:593"
        className="absolute left-[620px] text-[24px] leading-[30px] text-ink-700"
        style={{ top: Y(546.32) }}
      >
        {val(org.data?.name)}
      </p>
      {/* 장기요양등급(파일럿 W8, 사용자 확정 2026-09-27) — 프로필 카드 넷째 줄(피치 48 · 카드 끝 683 안). 다른 카드는 움직이지 않는다.
          값이 없으면: 주간보호 기관은 입력하라고 알리고, 그 밖에는 줄을 그리지 않는다(없는 값을 만들지 않는다). */}
      {careGrade || gradeRequired ? (
        <p
          // 미입력 안내는 한 단계 작게(20) — 24 로는 오른쪽 요약 박스(969)에 닿는다.
          className={cn('absolute left-[620px] leading-[30px]', careGrade ? 'text-[24px] text-ink-700' : 'text-w-body font-semibold text-alert')}
          style={{ top: Y(546.32 + 48.03) }}
        >
          {careGrade ? `장기요양등급 ${CARE_GRADE_LABEL[careGrade]}` : '장기요양등급 미입력 (주간보호 필수)'}
        </p>
      ) : null}
      {/* 우측 요약 박스 — accent 5% */}
      <div
        data-fx="161:590"
        className="absolute left-[969px] h-[239px] w-[319px] rounded-[10px] bg-accent/5"
        style={{ top: Y(391) }}
      />
      {[
        {
          icon: asset.iconCaregiver,
          iconAt: [1007.5, 444.75, 22, 21.75],
          label: '담당 요양보호사',
          labelAt: [1046, 441.26],
          value: caregiverLabel,
          valueAt: [1202, 441.26],
          fx: '161:638',
        },
        {
          icon: asset.iconCalendar,
          iconAt: [1007, 501.25, 25, 25.25],
          label: '연결일',
          labelAt: [1049, 498.29],
          value: ymd(active[0]?.created_at),
          valueAt: [1126, 498.29],
          fx: '161:641',
        },
        {
          icon: asset.iconClock,
          iconAt: [1007, 557.25, 25, 25.25],
          label: '최근 업데이트',
          labelAt: [1049, 555.33],
          value: relativeDay(elder.updatedAt),
          valueAt: [1189, 555.33],
          fx: '161:642',
        },
      ].map((r) => (
        <div key={r.label}>
          <img
            src={r.icon}
            alt=""
            className="absolute block"
            style={{ left: r.iconAt[0], top: Y(r.iconAt[1]), width: r.iconAt[2], height: r.iconAt[3] }}
          />
          <span
            className="absolute whitespace-nowrap text-w-nav leading-[30px] text-ink-700"
            style={{ left: r.labelAt[0], top: Y(r.labelAt[1]) }}
          >
            {r.label}
          </span>
          <span
            data-fx={r.fx}
            className="absolute whitespace-nowrap text-w-nav font-medium leading-[30px] text-ink-900"
            style={{ left: r.valueAt[0], top: Y(r.valueAt[1]) }}
          >
            {r.value}
          </span>
        </div>
      ))}

      {/* ── 기본 정보 ──────────────────────────────────────────────────── */}
      <Card fx="161:688" left={322} top={718.42} width={447} height={419.25} />
      <Title fx="161:689" left={374} top={738}>
        기본 정보
      </Title>
      <InfoRow fx="161:690" top={804} label="출신지" value={val(elder.hometown)} />
      <InfoRow fx="161:692" top={856.5} label="가족 구성" value={val(elder.family)} />
      <InfoRow
        fx="161:706"
        top={909.5}
        label="보호자"
        value={
          elder.guardian?.name
            ? `${elder.guardian.name}${elder.guardian.relation ? ` (${elder.guardian.relation})` : ''}`
            : '—'
        }
      />
      <InfoRow fx="161:694" top={963} label="직업 이력" value={val(elder.job)} />
      <InfoRow fx="161:696" top={1015.6} label="취미" value={val(elder.hobbies)} />
      <InfoRow fx="161:702" top={1069} label="특이사항" value={val(elder.note)} />

      {/* ── 동의 관리 ──────────────────────────────────────────────────── */}
      <Card fx="167:876" left={804} top={718.42} width={575} height={419.25} />
      <img
        src={asset.iconShield}
        alt=""
        className="absolute left-[866px] block h-[24.25px] w-[20px]"
        style={{ top: Y(761) }}
      />
      <Title fx="161:747" left={897} top={738}>
        동의 관리
      </Title>
      <Link
        to={`/caregiver/elders/${elder.id}/consents`}
        data-fx="161:811"
        className="absolute flex items-center gap-[6px] text-w-sub font-semibold leading-[21px] text-ink-700"
        style={{ left: 1262, top: Y(769.45) }}
      >
        <img src={asset.iconRevoke} alt="" width={16} height={18} className="block" />
        철회
      </Link>
      {consentRows.map((c, i) => (
        <div key={c.type}>
          <div
            data-fx={i === 0 ? '161:756' : undefined}
            className="absolute left-[866px] h-[62px] w-[452px] rounded-[10px] bg-mute-pale"
            style={{ top: Y(831 + i * CONSENT_PITCH) }}
          />
          <img
            src={asset.iconCheckCircle}
            alt=""
            width={34}
            height={34}
            data-fx={i === 0 ? '161:774' : undefined}
            className={cn('absolute left-[897px] block', !c.done && 'opacity-30 grayscale')}
            style={{ top: Y(845 + i * CONSENT_PITCH) }}
          />
          {/* ⚠️ 폭을 주지 않으면 "민감정보(건강·음성) 처리 동의(필수, 별도)" 가 오른쪽
              상태 pill(left 1212) 을 뚫고 **글자가 겹쳐 보인다**(2026-09-11 사용자 신고).
              라벨 문구는 core 동의 카탈로그가 SoT 라 길이를 코드가 정할 수 없다 →
              칸(953 ~ pill 1212, 여백 14) 안에서 두 줄로 접고 행 높이 62 안에 세로 중앙. */}
          <span
            data-fx={i === 0 ? '161:757' : undefined}
            className="absolute left-[953px] flex items-center text-w-body font-medium leading-[24px] tracking-[-0.2px] text-ink-900"
            style={{ top: Y(831 + i * CONSENT_PITCH), height: 62, width: 245, wordBreak: 'keep-all' }}
          >
            {c.label}
          </span>
          <Pill
            fx={i === 0 ? '161:768' : undefined}
            left={1212}
            top={850 + i * CONSENT_PITCH}
            width={82}
            height={25}
            className={cn(
              'text-w-sub',
              c.done ? 'bg-live-soft text-live' : 'bg-mute text-ink-400',
            )}
          >
            {c.done ? '완료' : '미동의'}
          </Pill>
        </div>
      ))}

      {/* ── 어르신 코드·연결 ───────────────────────────────────────────── */}
      <Card fx="178:703" left={322} top={1172.69} width={1057} height={337.2} />
      <Title fx="178:704" left={383} top={1193}>
        어르신 코드<span className="font-normal">·</span>연결
      </Title>
      <Link
        to="/caregiver/org"
        data-fx="178:734"
        className="absolute flex items-center gap-[16px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1144, top: Y(1216.71) }}
      >
        연결·승인 상세보기
        <img src={asset.iconChevronRightSm} alt="" width={12} height={19} className="block" />
      </Link>
      <Sub fx="178:705" left={384} top={1253.73} width={544}>
        {elder.name} 어르신의 코드 하나로 보호자 연결과 담당 요양보호사 인계를 처리해요.
        <br />
        담당이 바뀌거나 늘어도 이 코드로 이어받으면 기록이 그대로 유지됩니다.
      </Sub>
      <span
        data-fx="178:707"
        className="absolute left-[384px] text-w-nav font-semibold leading-[26px] text-ink-900"
        style={{ top: Y(1338.78) }}
      >
        어르신 코드
      </span>
      <div
        data-fx="178:708"
        className="absolute left-[383px] h-[57px] w-[936px] rounded-[10px] border border-line bg-white"
        style={{ top: Y(1379.81) }}
      />
      <span
        data-fx="178:709"
        className="absolute left-[412px] whitespace-nowrap text-w-sub font-bold leading-[21px] text-ink-900"
        style={{ top: Y(1397.82) }}
      >
        {code.data?.code ? code.data.code.split('').join(' ') : '—'}
      </span>
      <button
        type="button"
        onClick={copyCode}
        data-fx="178:711"
        className="absolute flex h-[37px] w-[143px] items-center justify-center gap-[10px] rounded-[5px] border border-line bg-white text-w-sub leading-[21px] text-ink-700"
        style={{ left: 978, top: Y(1389.81) }}
      >
        <img src={asset.iconCopy} alt="" width={22} height={21} className="block" />
        코드 복사
      </button>
      <button
        type="button"
        onClick={() =>
          elderId &&
          rotate.mutate(
            { profileId: elderId },
            {
              onSuccess: () => toast('success', '어르신 코드를 교체했어요.'),
              onError: (err) => toast('error', err.message),
            },
          )
        }
        disabled={rotate.isPending}
        data-fx="178:719"
        className="absolute flex h-[37px] w-[143px] items-center justify-center gap-[10px] rounded-[5px] border border-line bg-white text-w-sub leading-[21px] text-ink-700 disabled:opacity-50"
        style={{ left: 1137, top: Y(1389.81) }}
      >
        <img src={asset.iconRefresh} alt="" width={17} height={16} className="block" />
        코드 교체
      </button>
      <p
        data-fx="178:706"
        className="absolute left-[384px] w-[820px] text-w-label leading-[28px] text-ink-500"
        style={{ top: Y(1442.84) }}
      >
        보호자에게 주면 “어르신 연결” 요청이 오고, 다른 요양보호사에게 주면 이 어르신을 담당으로
        이어받습니다. 코드는 소진되지 않아요.
      </p>

      {/* ── 회상 세션 설계 ─────────────────────────────────────────────── */}
      <Card fx="195:291" left={322} top={1544.9} width={1054} height={336.2} />
      <Title fx="195:292" left={384} top={1564}>
        회상 세션 설계
      </Title>
      <Sub fx="195:293" left={384} top={1628.95} width={288}>
        설계한 세션은 어르신 앱에서 진행됩니다.
        <br />
        대화 기록은 여기서 확인해주세요.
      </Sub>
      <CardAction fx="195:307" to={`/caregiver/sessions/${elder.id}`} left={1023} top={1590} label="자세히 보기" />
      <CardAction fx="195:295" to={`/caregiver/sessions/${elder.id}/new`} left={1178} top={1590} label="세션 설계" plus />
      <div
        data-fx="195:300"
        className="absolute left-[384px] h-px w-[930px] bg-line"
        style={{ top: Y(1709) }}
      />
      {/* 설계된 세션 — Figma 는 빈 상태만 그렸다. 행이 생기면 이 페이지가 이미 쓰는
          세션 행 모양(상대일 + 제목 + 상태 pill · 피치 137)을 그대로 쓴다. 카드 높이가
          고정이라 한 줄만 보여주고 나머지는 "자세히 보기"로 넘긴다(연대기 2 · 대화 이력 3
          · 안전 이벤트 1 과 같은 규칙). */}
      {plannedRows.length === 0 ? (
        <p
          data-fx="195:313"
          className="absolute left-[677px] w-[343px] text-w-sub leading-[28px] text-ink-500"
          style={{ top: Y(1776.04) }}
        >
          설계된 세션이 없습니다. 첫 세션을 만들어보세요.
        </p>
      ) : (
        plannedRows.map((p) => (
          <div key={p.id}>
            <span
              className="absolute left-[379px] whitespace-pre text-w-body leading-[28px] text-ink-500"
              style={{ top: Y(1738.49) }}
            >
              {`${ymd(p.planned_date ?? p.started_at)}    ${p.duration_minutes ? `${p.duration_minutes}분 예정` : '앱에서 진행'}`}
            </span>
            <Link
              to={`/caregiver/sessions/${elder.id}/plan/${p.id}`}
              className="absolute left-[379px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
              style={{ top: Y(1753) }}
            >
              {p.title ?? '회상 대화'}
            </Link>
            <Pill
              left={1242}
              top={1764}
              width={82}
              height={25}
              className="bg-accent/10 text-w-sub text-accent"
            >
              설계됨
            </Pill>
          </div>
        ))
      )}

      {/* ── 연대기 ─────────────────────────────────────────────────────── */}
      <Card fx="195:315" left={322} top={1916.12} width={1054} height={429.25} />
      <Title fx="195:316" left={384} top={1935}>
        연대기
      </Title>
      <Sub fx="195:317" left={384} top={2000.17} width={257}>
        AI 자동 축적 + 요양보호사 직접 입력
      </Sub>
      <CardAction fx="195:326" to={`/caregiver/elders/${elder.id}/chronicles`} left={1023} top={1961} label="자세히 보기" />
      <CardAction fx="195:320" to={`/caregiver/elders/${elder.id}/chronicles`} left={1178} top={1961} label="항목 추가" plus />
      <div className="absolute left-[384px] h-px w-[930px] bg-line" style={{ top: Y(2052) }} />
      {chronicleRows.length === 0 ? (
        <p
          className="absolute left-[677px] w-[343px] text-w-sub leading-[28px] text-ink-500"
          style={{ top: Y(2110) }}
        >
          아직 연대기 항목이 없습니다.
        </p>
      ) : (
        chronicleRows.map((c, i) => {
          const ai = c.source === 'ai';
          return (
            <div key={c.id}>
              {i > 0 ? (
                <div className="absolute left-[384px] h-px w-[930px] bg-line" style={{ top: Y(2052 + i * 132) }} />
              ) : null}
              <Pill
                fx={i === 0 ? '195:344' : '195:350'}
                left={384}
                top={2076 + i * 140}
                width={ai ? 95 : 124}
                height={35}
                className={cn(
                  'text-[20px]',
                  ai ? 'bg-accent-tint text-accent' : 'bg-manual-soft text-manual',
                )}
              >
                {ai ? 'AI 자동' : '요양보호사'}
              </Pill>
              <span
                className="absolute whitespace-pre text-w-body leading-[28px] text-ink-500"
                style={{ left: ai ? 494 : 528, top: Y(2081.22 + i * 140) }}
              >
                {`${ymd(c.recorded_at)}   ${relativeDay(c.recorded_at)}`}
              </span>
              <p
                data-fx={i === 0 ? '195:341' : '195:353'}
                className="absolute left-[389px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
                style={{ top: Y(2101 + i * 140) }}
              >
                {c.title ?? c.content}
              </p>
            </div>
          );
        })
      )}

      {/* ── 대화 이력 ──────────────────────────────────────────────────── */}
      <Card fx="196:370" left={322} top={2380.39} width={1054} height={564.33} />
      <Title fx="196:372" left={374} top={2399}>
        대화 이력
      </Title>
      <Sub fx="196:374" left={374} top={2462.44} width={437} tone="ink">
        앱에서 진행된 세션이 종료되면 이곳에 실시간으로 나타납니다.
      </Sub>
      <CardAction fx="260:138" to={`/caregiver/sessions/${elder.id}`} left={1188} top={2443} label="자세히 보기" />
      {sessionRows.length === 0 ? (
        <>
          <div data-fx="196:378" className="absolute left-[374px] h-px w-[950px] bg-line" style={{ top: Y(2521) }} />
          <p
            className="absolute left-[677px] w-[343px] text-w-sub leading-[28px] text-ink-500"
            style={{ top: Y(2570) }}
          >
            아직 진행한 세션이 없습니다.
          </p>
        </>
      ) : (
        sessionRows.map((s, i) => {
          const ended = s.status === 'ended';
          return (
            <div key={s.id}>
              <div
                data-fx={i === 0 ? '196:378' : undefined}
                className="absolute left-[374px] h-px w-[950px] bg-line"
                style={{ top: Y(2521 + i * 137) }}
              />
              <span
                data-fx={i === 0 ? '196:382' : undefined}
                className="absolute left-[379px] whitespace-pre text-w-body leading-[28px] text-ink-500"
                style={{ top: Y(2550.49 + i * 137) }}
              >
                {`${relativeDay(s.started_at)}    ${s.turn_count ?? 0}턴`}
              </span>
              <Link
                to={`/caregiver/sessions/${elder.id}/${s.id}`}
                data-fx={i === 0 ? '196:383' : undefined}
                className="absolute left-[379px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
                style={{ top: Y(2565 + i * 137) }}
              >
                {s.current_topic ?? '회상 대화'}
              </Link>
              <Pill
                fx={i === 0 ? '198:447' : undefined}
                left={1242}
                top={2576 + i * 137}
                width={82}
                height={25}
                className={cn('text-w-sub', ended ? 'bg-mute text-ink-400' : 'bg-live-soft text-live')}
              >
                {ended ? '완료' : '진행 중'}
              </Pill>
            </div>
          );
        })
      )}

      {/* ── 안전 이벤트 이력 ───────────────────────────────────────────── */}
      <Card fx="198:458" left={322} top={2979.74} width={1054} height={271.16} />
      <Title fx="198:460" left={374} top={2998}>
        안전 이벤트 이력
      </Title>
      <Sub fx="198:461" left={374} top={3061.79} width={619} tone="ink">
        대화 중 감지된 위기·관찰 신호입니다. 키워드 기반 안전장치이며 의학적 판단이 아닙니다.
      </Sub>
      <div data-fx="198:462" className="absolute left-[374px] h-px w-[950px] bg-line" style={{ top: Y(3115) }} />
      {safetyRows.length === 0 ? (
        <p
          className="absolute left-[677px] w-[343px] text-w-sub leading-[28px] text-ink-500"
          style={{ top: Y(3160) }}
        >
          감지된 안전 이벤트가 없습니다.
        </p>
      ) : (
        safetyRows.map((ev) => (
          <div key={ev.id}>
            <Pill
              fx="198:480"
              left={379}
              top={3145}
              width={64}
              height={25}
              className={cn('text-w-sub', ev.level === 'crisis' ? 'bg-alert-soft text-alert' : 'bg-info-soft text-info')}
            >
              {ev.level === 'crisis' ? '위기' : '관찰'}
            </Pill>
            <span
              data-fx="198:466"
              className="absolute left-[453px] whitespace-nowrap text-w-body leading-[28px] text-ink-500"
              style={{ top: Y(3144.84) }}
            >
              {relativeDay(ev.created_at)}
            </span>
            <p
              data-fx="198:489"
              className="absolute left-[379px] w-[700px] text-w-body leading-[28px] text-ink-700"
              style={{ top: Y(3180.86) }}
            >
              {ev.excerpt ? `발화: “${ev.excerpt}”` : ev.caregiver_alert}
            </p>
            <Pill
              fx="198:484"
              left={1242}
              top={3167}
              width={82}
              height={25}
              className={cn('text-w-sub', ev.acknowledged_at ? 'bg-live-soft text-live' : 'bg-mute text-ink-400')}
            >
              {ev.acknowledged_at ? '확인' : '미확인'}
            </Pill>
          </div>
        ))
      )}

      {/* 삭제 — 확인 뒤 Storage 파일 → 프로필 행 순서로 파기(useDeleteProfile). 연대기·세션·일지 등은 DB cascade. */}
      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        disabled={deleteProfile.isPending}
        className="absolute flex items-center gap-[10px] text-w-nav font-semibold leading-[30px] text-ink-500 disabled:opacity-60"
        style={{ left: 1147, top: Y(3295) }}
      >
        <img
          src={asset.iconTrash}
          alt=""
          className="block object-contain"
          style={{ width: 30, height: 30 }}
        />
        <span data-fx="196:140">{deleteProfile.isPending ? '삭제하는 중…' : '어르신 정보 삭제하기'}</span>
      </button>

      <ConfirmDialog
        open={confirmingDelete}
        title="어르신 정보를 삭제할까요?"
        description={`${profileQuery.data?.name ?? ''} 어르신의 사진·연대기·대화 기록·프로그램 일지·동의 기록이 모두 함께 삭제됩니다. 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        onConfirm={() => {
          if (!elderId) return;
          deleteProfile.mutate(elderId, {
            onSuccess: () => {
              toast('success', '어르신 정보를 삭제했어요.');
              navigate('/caregiver/elders', { replace: true });
            },
            onError: (err) => toast('error', err.message),
          });
        }}
        onClose={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
