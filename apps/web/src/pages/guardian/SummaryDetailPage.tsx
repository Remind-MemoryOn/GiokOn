// 보호자 — AI 회상 대화 요약 상세 (Figma 55:1258 — 1440×1324)
//   돌아가기 @(322,187.14) · 배지 175×35 @(343,260) · 제목 @(362,292) ·
//   담당 요양보호사 @(362,356.27) · 카드 1054×810.61 @(322,432.33)
//   오늘 대화 주제 @(408,479) → 값 @(408,543.41) | AI 회상 대화 시간 @(1112,479) → 값 @(1112,543.41)
//   대화 요약 @(408,607) → 본문 735 @(408,671.51)
//   기억에 남은 이야기 @(408,839) → 인용 상자 876×118 @(408,909), 인용문 @(445,954.72)
//   이번 대화에서 나온 기억 @(408,1063) → 값 @(408,1127.85)
//
// ⚠️ 파일럿 W4(2026-09-27): **대화 요약만 공개**(session_summary)된 경우도 연다 — 그때 서버는 요약 문장·첫 주제만 준다
//    (get_my_shared_summaries). 분석 세부(대화 시간·인용·기억 키워드)는 오지 않으므로 지어내지 않고 비운다.
//    카드 아래 보호자 리포트 고정 문구.
// ⚠️ 시안의 요약 본문 상자는 6줄인데 그중 마지막 한 줄이 비어 있다(맨 끝 줄바꿈). 그 빈 줄을
//    빼고 재면 "기억에 남은 이야기" 앞 간격은 27.4 다 — 빈 줄을 흉내 내지 않고 27.4 를 쓴다.
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { parseSessionAnalysis, useMySharedContent } from '@giokon/data';
import { useAuth } from '../../auth/AuthProvider';
import {
  BackLink, BODY_DY, CARD_TOP, DetailHead, PAD_TOP, PAD_X, SectionBody, SectionTitle,
  TokenList, Y,
} from '../../components/guardian-detail';
import { useMarkShareViewedOnce } from '../../lib/shareViewed';
import { GuardianReportNotice } from '../../components/guardian-report-notice';

const SEC_GAP = 35.5;
/** 두 번째 열(AI 회상 대화 시간) — 1112 − 408. */
const COL2 = 704;
/** 인용 상자 — 876×118, 안쪽 (37, 45.72). */
const QUOTE = { w: 876, h: 118, x: 37, y: 45.72 };

export function SummaryDetailPage() {
  const { itemId } = useParams();
  const { isConfigured } = useAuth();
  const shared = useMySharedContent({ enabled: isConfigured });

  const row = (shared.data?.analyses ?? []).find((a) => a.id === itemId) ?? null;
  const live = (type: 'analysis' | 'session_summary') =>
    (shared.data?.shares ?? []).find((s) => s.item_type === type && s.item_id === itemId && !s.revoked_at);
  // 분석까지 공개됐으면 그 공개가 기준이고, 요약만 공개됐으면 요약 공개가 기준이다(열람 기록도 그 공개에 남긴다).
  const share = live('analysis') ?? live('session_summary');
  const summaryOnly = (shared.data?.summaries ?? []).find((m) => m.id === itemId) ?? null;
  const analysis = useMemo(() => (row ? parseSessionAnalysis(row) : null), [row]);

  // 보호자가 열어 본 사실을 남긴다(공개 id 당 한 번).
  useMarkShareViewedOnce(share?.id, isConfigured);

  const topics = analysis?.topicOutcomes.map((t) => t.topic) ?? (summaryOnly?.first_topic ? [summaryOnly.first_topic] : []);
  const keywords = analysis?.interestKeywords ?? [];
  // 기억에 남은 이야기 = 호응이 좋았던 주제에서 뽑아 둔 어르신 발화(core 가 분석에 담는다).
  const quote = analysis?.topicOutcomes.find((t) => t.reaction === 'engaged' && t.excerpt)?.excerpt
    ?? analysis?.topicOutcomes.find((t) => t.excerpt)?.excerpt
    ?? null;
  const minutes = analysis?.durationMinutes ?? null;

  return (
    <div className="relative -ml-[323px] w-[1440px]" style={{ minHeight: Y(1324) }}>
      <BackLink to="/guardian/feed?tab=analysis" />
      <DetailHead
        fx={{ badge: '55:1349', label: '55:1350', at: '55:1351', title: '55:1329', author: '55:1333' }}
        badge="AI 회상 대화 요약"
        tone="accent"
        badgeW={175}
        at={share?.shared_at ?? row?.created_at ?? summaryOnly?.created_at ?? ''}
        title={
          analysis?.topicsEngaged[0]
            ? `${analysis.topicsEngaged[0]} 이야기`
            : summaryOnly?.first_topic
              ? `${summaryOnly.first_topic} 이야기`
              : 'AI 회상 대화 요약'
        }
      />

      {/* 카드 높이가 내용에 따라 변해 고정 문구를 카드 바로 아래 흐름으로 붙인다(자리는 카드와 같다). */}
      <div className="absolute left-[322px] w-[1054px]" style={{ top: Y(CARD_TOP) }}>
      <div
        data-fx="55:1328"
        className="relative w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{
          paddingLeft: PAD_X, paddingRight: PAD_X, paddingTop: PAD_TOP, paddingBottom: 87.07,
        }}
      >
        <div className="relative">
          <SectionTitle fx="55:1334">오늘 대화 주제</SectionTitle>
          <TokenList fx="55:1335" items={topics} style={{ marginTop: BODY_DY - 70 }} />
          <SectionTitle fx="55:1365" className="absolute" style={{ left: COL2, top: 0 }}>
            AI 회상 대화 시간
          </SectionTitle>
          <SectionBody
            fx="55:1366"
            className="absolute !text-[25px] font-semibold"
            style={{ left: COL2, top: BODY_DY, lineHeight: '28px' }}
          >
            {/* 대화 시간은 세션을 끝낸 쪽이 분석에 붙인다 — 예전 기록에는 없어 그때는 — 로 둔다. */}
            {minutes != null ? `약 ${minutes}분` : '—'}
          </SectionBody>
        </div>

        <SectionTitle fx="55:1336" gap={SEC_GAP}>대화 요약</SectionTitle>
        <SectionBody fx="55:1337" under pre width={735}>
          {analysis?.summary ?? summaryOnly?.summary ?? '—'}
        </SectionBody>

        <SectionTitle fx="55:1356" gap={27.4}>기억에 남은 이야기</SectionTitle>
        <div
          data-fx="55:1359"
          className="relative rounded-[10px] bg-accent-tint"
          style={{ width: QUOTE.w, height: QUOTE.h }}
        >
          <p
            data-fx="55:1357"
            className="absolute text-w-body text-ink-700"
            style={{ left: QUOTE.x, top: QUOTE.y, lineHeight: '28.021px', wordBreak: 'keep-all' }}
          >
            {quote ? `“${quote}”` : !analysis && summaryOnly ? '대화 요약만 공개된 기록이에요.' : '아직 옮겨 둘 말씀이 없어요.'}
          </p>
        </div>

        <SectionTitle fx="55:1361" gap={36}>이번 대화에서 나온 기억</SectionTitle>
        <TokenList fx="55:1362" items={keywords} style={{ marginTop: BODY_DY - 70 }} />
      </div>
      <GuardianReportNotice />
      </div>
    </div>
  );
}
