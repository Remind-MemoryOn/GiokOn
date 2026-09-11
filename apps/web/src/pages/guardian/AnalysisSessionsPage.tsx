// 보호자 — 대화 분석(세션 목록) (Figma 104:1041 — 1440×1106)
//   인사말 @(322,186) · 부제 @(322,236.21) · 어르신 pill @(1054,187)
//   탭 @301(종합 분석 426 · 대화 분석 598 활성, 밑줄 81×3 @340) · 기간 pill 127×30 @(1249,292)
//   카드 1054 @(322,343) — 대화 세션 목록 @(409,385) · 행 881×140 @458 피치 180
//
// 행은 요양보호사 목록과 **같은 부품**이되 상대일·상태 배지가 없다(compact) —
// 세션 상태는 보호자에게 공개하는 항목이 아니다.
// ⚠️ Figma 3번째 행만 x 를 1 적게 그렸다(408/471/622/1063) → 409/472/623/1064 로 통일.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  toElderProfile, useProfile, useSessions,
} from '@giokon/data';
import { withinMonths } from '@giokon/core';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useGuardianElder } from '../../lib/guardianElder';
import { ElderPill, GuardianGreeting } from '../../components/guardian-header';
import { SessionRow } from '../../components/session-row';
import { ROW_H, ROW_PITCH } from '../../lib/session-row';
import { PERIODS, Y, type Months } from '../../lib/analysis';

const CARD_TOP = 343;
const ROW_TOP = 458;
/** 마지막 행 아래 카드 여백(시안: 3행 끝 958 → 카드 끝 1024). */
const CARD_PAD_BOTTOM = 66;

export function AnalysisSessionsPage() {
  const { userRow } = useAuth();
  const [months, setMonths] = useState<Months>(3);
  const { link: approvedLink } = useGuardianElder();
  const profileQuery = useProfile(approvedLink?.profile_id);
  const sessionsQuery = useSessions(approvedLink?.profile_id);

  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );
  // 보호자에게는 **끝난 대화**만 보인다(진행 중·설계된 세션은 공개 항목이 아니다).
  const rows = useMemo(
    () => (sessionsQuery.data ?? [])
      .filter((s) => s.status === 'ended')
      .filter((s) => withinMonths(s.ended_at ?? s.started_at, months)),
    [sessionsQuery.data, months],
  );

  const cardHeight = rows.length === 0
    ? ROW_TOP - CARD_TOP + 120
    : ROW_TOP - CARD_TOP + (rows.length - 1) * ROW_PITCH + ROW_H + CARD_PAD_BOTTOM;

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: Y(CARD_TOP) + cardHeight + 82 }}>
      <GuardianGreeting
        name={userRow?.name}
        subtitle="AI 회상 대화 세션을 선택하여 대화 분석 결과를 확인해보세요."
        fxTitle="104:1110"
        fxDesc="104:1111"
        descTop={236.21}
      />
      <ElderPill
        elderName={elder?.name}
        to="/guardian"
        fxBox="104:1113"
        fxLabel="104:1114"
        fxName="104:1115"
      />

      {/* 탭 — 종합 분석 / 대화 분석(활성) */}
      <Link
        to="/guardian/analysis"
        data-fx="104:1119"
        className="absolute whitespace-nowrap text-w-nav leading-[30px] text-ink-500"
        style={{ left: 426, top: Y(301) }}
      >
        종합 분석
      </Link>
      <span
        data-fx="104:1120"
        className="absolute whitespace-nowrap text-w-nav font-semibold leading-[30px] text-accent"
        style={{ left: 598, top: Y(301) }}
      >
        대화 분석
      </span>
      <div
        data-fx="104:1121"
        className="absolute h-[3px] w-[81px] bg-accent"
        style={{ left: 598, top: Y(340) }}
      />

      {/* 기간 — 시안은 '최근 3개월' 하나지만 실제로는 고를 수 있어야 한다 */}
      <div
        data-fx="104:1122"
        className="absolute h-[30px] w-[127px] rounded-[5px] border border-ink-500/30 bg-ink-500/[0.03]"
        style={{ left: 1249, top: Y(292) }}
      >
        <span
          data-fx="104:1124"
          className="pointer-events-none absolute left-[19px] whitespace-nowrap text-[16px] leading-[23px] text-ink-500"
        >
          최근 {months}개월
        </span>
        <img
          src={asset.iconChevronDownSm}
          alt=""
          width={12}
          height={7.81}
          className="pointer-events-none absolute left-[97px] top-1/2 block -translate-y-1/2"
        />
        <select
          aria-label="분석 기간"
          value={months}
          onChange={(e) => setMonths(Number(e.target.value) as Months)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {PERIODS.map((m) => (
            <option key={m} value={m}>
              최근 {m}개월
            </option>
          ))}
        </select>
      </div>

      <div
        data-fx="104:1524"
        className="absolute left-[322px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD_TOP), height: cardHeight }}
      />
      <h2
        data-fx="104:1526"
        className="absolute left-[409px] whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
        style={{ top: Y(385) }}
      >
        대화 세션 목록
      </h2>

      {rows.length === 0 ? (
        <p
          className="absolute left-[409px] w-[881px] text-center text-w-body leading-[30px] text-ink-500"
          style={{ top: Y(ROW_TOP + 30) }}
        >
          이 기간에 공개된 회상 대화가 없어요.
        </p>
      ) : (
        rows.map((s, i) => (
          <SessionRow
            key={s.id}
            session={s}
            compact
            top={Y(ROW_TOP + i * ROW_PITCH)}
            to={`/guardian/analysis/sessions/${s.id}`}
            actionLabel="대화 분석 보기"
            fx={i === 0 ? {
              row: '104:1564', title: '104:1566', date: '104:1570',
              clock: '104:1572', duration: '104:1577', link: '104:1535', chevron: '104:1536',
            } : undefined}
          />
        ))
      )}
    </div>
  );
}
