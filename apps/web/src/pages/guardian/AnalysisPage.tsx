import { PeriodSelect } from '../../components/ui/PeriodSelect';
// 보호자 — 종합 분석 (Figma 96:94 — 1440×3624)
//   인사말 @(322,186) · 부제 @(322,236.13) · 어르신 pill @(1054,188)
//   탭 @301(종합 분석 426 활성 · 대화 분석 598, 밑줄 81×3 @341) · 기간 pill 127×30 @(1249,292)
//   카드 2장은 요양보호사 개인별 종합분석(228:4091)과 **같은 화면**이라 공용 부품을 쓴다.
//
// ⚠️ 파일럿 W4(2026-09-27, 사용자 확정): 이름 '대화 관찰 리포트'(사이드바는 폭 때문에 '관찰 리포트') · 판정형 카드2(인지 효과·향상률·종합 평가)는
//    보호자에게 그리지 않는다(`audience="guardian"`) · 하단 고정 문구. 화면 높이는 카드1 + 고정 문구까지.
// ⚠️ 기간 pill 의 ∨ 는 반전 노드라 metadata x(1358)가 렌더 위치가 아니다 — 프레임 오른끝 − 폭.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '@giokon/data';
import { useAuth } from '../../auth/AuthProvider';
import { useGuardianElder } from '../../lib/guardianElder';
import { ElderAnalysisCards, GUARDIAN_CARDS_BOTTOM } from '../../components/analysis-comprehensive';
import { ElderPill, GuardianGreeting } from '../../components/guardian-header';
import { Y, type Months } from '../../lib/analysis';
import { useElderProfile } from '../../lib/elderProfile';

export function AnalysisPage() {
  const { userRow } = useAuth();
  const [months, setMonths] = useState<Months>(3);
  const { link: approvedLink } = useGuardianElder();
  const profileQuery = useProfile(approvedLink?.profile_id);
  const elder = useElderProfile(profileQuery.data);

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] w-[1440px]" style={{ height: Y(GUARDIAN_CARDS_BOTTOM + 24 + 36 + 28 + 87) }}>
      <GuardianGreeting
        name={userRow?.name}
        subtitle="어르신의 대화 관찰 리포트를 확인해보세요."
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
      <PeriodSelect months={months} onChange={setMonths} fxBox="99:426" fxLabel="99:427" />

      <ElderAnalysisCards elderId={approvedLink?.profile_id} months={months} audience="guardian" />
    </div>
  );
}
