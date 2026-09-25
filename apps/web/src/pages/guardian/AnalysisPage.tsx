// 보호자 — 종합 분석 (Figma 96:94 — 1440×3624)
//   인사말 @(322,186) · 부제 @(322,236.13) · 어르신 pill @(1054,188)
//   탭 @301(종합 분석 426 활성 · 대화 분석 598, 밑줄 81×3 @341) · 기간 pill 127×30 @(1249,292)
//   카드 2장은 요양보호사 개인별 종합분석(228:4091)과 **같은 화면**이라 공용 부품을 쓴다.
//
// ⚠️ 기간 pill 의 ∨ 는 반전 노드라 metadata x(1358)가 렌더 위치가 아니다 — 프레임 오른끝 − 폭.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '@giokon/data';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useGuardianElder } from '../../lib/guardianElder';
import { ElderAnalysisCards } from '../../components/analysis-comprehensive';
import { ElderPill, GuardianGreeting } from '../../components/guardian-header';
import { PERIODS, Y, type Months } from '../../lib/analysis';
import { useElderProfile } from '../../lib/elderProfile';

export function AnalysisPage() {
  const { userRow } = useAuth();
  const [months, setMonths] = useState<Months>(3);
  const { link: approvedLink } = useGuardianElder();
  const profileQuery = useProfile(approvedLink?.profile_id);
  const elder = useElderProfile(profileQuery.data);

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] h-[3502px] w-[1440px]">
      <GuardianGreeting
        name={userRow?.name}
        subtitle="어르신의 AI 회상 대화 종합 분석 결과를 확인해보세요."
        fxTitle="96:98"
        fxDesc="96:99"
        descTop={236.13}
      />
      <ElderPill
        elderName={elder?.name}
        to="/guardian"
        fxBox="96:101"
        fxLabel="96:102"
        fxName="96:103"
        top={188}
      />

      {/* 탭 — 종합 분석(활성) / 대화 분석 */}
      <span
        data-fx="96:107"
        className="absolute whitespace-nowrap text-w-nav font-semibold leading-[30px] text-accent"
        style={{ left: 426, top: Y(301) }}
      >
        종합 분석
      </span>
      <div
        data-fx="96:154"
        className="absolute h-[3px] w-[81px] bg-accent"
        style={{ left: 426, top: Y(341) }}
      />
      <Link
        to="/guardian/analysis/sessions"
        data-fx="96:108"
        className="absolute whitespace-nowrap text-w-nav leading-[30px] text-ink-500"
        style={{ left: 598, top: Y(301) }}
      >
        대화 분석
      </Link>

      {/* 기간 — 시안은 '최근 3개월' 하나지만 실제로는 고를 수 있어야 한다 */}
      <div
        data-fx="99:426"
        className="absolute h-[30px] w-[127px] rounded-[5px] border border-ink-500/30 bg-ink-500/[0.03]"
        style={{ left: 1249, top: Y(292) }}
      >
        <span
          data-fx="99:427"
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

      <ElderAnalysisCards elderId={approvedLink?.profile_id} months={months} />
    </div>
  );
}
