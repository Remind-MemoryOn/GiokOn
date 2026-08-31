// 분석 — 대화 분석 상세 (Figma 228:4430 — 1440×1688)
//   제목·부제 없음 · 돌아가기 @(322,187.11) · 카드 1054×1347.8 @(322,259.15)
//   카드는 보호자 대화 분석 상세(104:1830)와 같아 `components/analysis-session` 공용.
import { Link, useParams } from 'react-router-dom';
import { asset } from '../../assets/ui';
import { SessionAnalysisCard } from '../../components/analysis-session';
import { Y } from '../../lib/analysis';

export function ConversationAnalysisPage() {
  const { elderId, sessionId } = useParams<{ elderId: string; sessionId: string }>();

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] h-[1566px] w-[1440px]">
      <Link
        to={`/caregiver/analysis/${elderId ?? ''}/sessions`}
        data-fx="228:4502"
        className="absolute flex items-center gap-[9px] text-[20px] font-semibold leading-[24px] text-ink-700"
        style={{ left: 322, top: Y(187.11) }}
      >
        <img
          src={asset.iconChevronRightSm}
          alt=""
          className="block rotate-180"
          style={{ width: 12.18, height: 18.73 }}
        />
        돌아가기
      </Link>

      <SessionAnalysisCard sessionId={sessionId} />
    </div>
  );
}
