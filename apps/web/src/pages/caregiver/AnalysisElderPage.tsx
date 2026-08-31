// 분석 — 개인별 종합 (Figma 228:4091 — 1440×3624)
//   제목 @(322,186) · 부제 @(322,236.13) · 목록으로 @(1285,187.1) ·
//   탭 @301(활성=종합 분석, 밑줄 81×3 @341) · 기간 pill 127×30 @(1249,292)
//   카드 2장은 보호자 종합 분석(96:94)과 같은 화면이라 `components/analysis-comprehensive` 공용.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toElderProfile, useProfile } from '@giokon/data';
import { asset } from '../../assets/ui';
import { ElderAnalysisCards } from '../../components/analysis-comprehensive';
import { PERIODS, Y, type Months } from '../../lib/analysis';

export function AnalysisElderPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const [months, setMonths] = useState<Months>(3);
  const profileQuery = useProfile(elderId);
  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] h-[3502px] w-[1440px]">
      <h1
        data-fx="228:4160"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(186) }}
      >
        {elder ? `${elder.name} 어르신의 종합 분석` : '종합 분석'}
      </h1>
      <p
        data-fx="228:4161"
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.13) }}
      >
        어르신의 AI 회상 대화 종합 분석 결과를 확인해보세요.
      </p>
      <Link
        to="/caregiver/analysis/elders"
        data-fx="228:4620"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 1285, top: Y(187.1) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        목록으로
      </Link>

      {/* 탭 — 종합 분석(활성) / 대화 분석 */}
      <span
        data-fx="228:4169"
        className="absolute whitespace-nowrap text-w-nav font-semibold leading-[30px] text-accent"
        style={{ left: 426, top: Y(301) }}
      >
        종합 분석
      </span>
      <div
        data-fx="228:4171"
        className="absolute h-[3px] w-[81px] bg-accent"
        style={{ left: 426, top: Y(341) }}
      />
      <Link
        to={`/caregiver/analysis/${elderId ?? ''}/sessions`}
        data-fx="228:4170"
        className="absolute whitespace-nowrap text-w-nav leading-[30px] text-ink-500"
        style={{ left: 598, top: Y(301) }}
      >
        대화 분석
      </Link>

      {/* 기간 — 시안은 '최근 3개월' 하나지만 실제로는 고를 수 있어야 한다 */}
      <div
        data-fx="228:4172"
        className="absolute h-[30px] w-[127px] rounded-[5px] border border-ink-500/30 bg-ink-500/[0.03]"
        style={{ left: 1249, top: Y(292) }}
      >
        <span
          data-fx="228:4174"
          className="pointer-events-none absolute left-[19px] whitespace-nowrap text-[16px] leading-[23px] text-ink-500"
        >
          최근 {months}개월
        </span>
        <img
          src={asset.iconChevronDownSm}
          alt=""
          width={12}
          height={7.81}
          className="pointer-events-none absolute left-[109px] top-[19.81px] block"
        />
        <select
          aria-label="분석 기간"
          value={months}
          onChange={(e) => setMonths(Number(e.target.value) as (typeof PERIODS)[number])}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {PERIODS.map((m) => (
            <option key={m} value={m}>
              최근 {m}개월
            </option>
          ))}
        </select>
      </div>

      <ElderAnalysisCards elderId={elderId} months={months} />
    </div>
  );
}
