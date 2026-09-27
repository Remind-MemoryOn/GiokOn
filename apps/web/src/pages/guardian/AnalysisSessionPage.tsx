// 보호자 — 대화 분석 상세 (Figma 104:1830 — 1440×1688)
//   돌아가기 @(322,187.11) · 카드 1054×1347.8 @(322,259.15)
//   카드는 요양보호사 대화 분석 상세(228:4430)와 **같은 카드**라 공용 부품을 쓴다.
import { Link, useParams } from 'react-router-dom';
import { asset } from '../../assets/ui';
import { SessionAnalysisCard } from '../../components/analysis-session';
import { Y } from '../../lib/analysis';
import { GuardianReportNotice } from '../../components/guardian-report-notice';

export function AnalysisSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] h-[1566px] w-[1440px]">
      <Link
        to="/guardian/analysis/sessions"
        data-fx="104:1850"
        className="absolute whitespace-nowrap text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 343, top: Y(187.11) }}
      >
        돌아가기
      </Link>
      <img
        src={asset.iconChevronRightSm}
        alt=""
        data-fx="104:1851"
        aria-hidden
        className="pointer-events-none absolute block rotate-180"
        style={{ left: 322, top: Y(190), width: 12.18, height: 18.73 }}
      />

      <SessionAnalysisCard sessionId={sessionId} />
      {/* 보호자 리포트 하단 고정 문구(파일럿 W4) — 카드 끝 259.15 + 1347.8 아래. */}
      <GuardianReportNotice top={259.15 + 1347.8 + 24} />
    </div>
  );
}
