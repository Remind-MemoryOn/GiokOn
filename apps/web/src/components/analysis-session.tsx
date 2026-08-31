// 대화 분석 상세 카드 — 요양보호사(228:4430)와 보호자(104:1830)가 **같은 카드**를 쓴다.
// (원 주석: 분석 — 대화 분석 상세 Figma 228:4430 — 1440×1688)
//   제목·부제 없음 · 돌아가기 @(322,187.11) · 카드 1054×1347.8 @(322,259.15)
//   카드 안(카드 좌상단 기준): 날짜 Regular 22/28 @(86,66.04) · 제목 Bold 30/70 @(86,82.85) ·
//   3칸 271×147 @(86|391.5|697, 161.85) · 핵심 요약 @417.85 · 대화 특성 @697.85 ·
//   특성 4칸 201×141 @(86+227i, 770.85) · 키워드 칩 38 @933.85 · 감정 분석 @1081.85
//
// 수치는 전부 `@giokon/core` 순수함수다. 근거가 없으면 값을 만들지 않고 `—`/빈 상태로 둔다.
// ⚠️ 시안의 14회·14분 12초·85%·"긍정 80%" 와 요약 문장·키워드는 **데모 값**이다.
// ⚠️ 감정 막대의 "긍정/보통/부정" 은 쓰지 않는다 — 우리가 재는 것은 말투 묶음
//    (밝음·차분·그리움)이지 정서의 좋고 나쁨이 아니다. 관찰하지 않은 가치 판단을
//    만들지 않으려고 관찰한 이름을 그대로 쓴다(core `computeEmotionSplit`).
// ⚠️ 표정 마크는 시안에 **긍정 1종만** 있다 → 가장 많은 말투가 '밝음'일 때만 그린다.
import { useMemo } from 'react';
import {
  parseSessionAnalysis,
  toConversationTurn,
  useSession,
  useSessionAnalysisBySession,
  useSessionLogs,
} from '@giokon/data';
import { computeEmotionSplit, describeSessionTraits } from '@giokon/core';
import { webPalette } from '@giokon/theme';
import { asset } from '../assets/ui';
import { cn } from '../lib/utils';

import { Y } from '../lib/analysis';

const CARD_TOP = 259.15;
const COL = 86; // 카드 안 콘텐츠 왼쪽(408 - 322)
/** 감정 막대 전체 폭(시안 실측). */
const BAR_W = 593;

/** 주황 틴트 카드 — accent 3% + accent 30% 테두리 r5(분석 화면 공통 부품). */
const TINT = 'absolute rounded-[5px] border border-accent/30 bg-accent/[0.03]';

/** 섹션 제목(Bold 25/70). */
function Section({ fx, top, children }: { fx?: string; top: number; children: React.ReactNode }) {
  return (
    <h2
      data-fx={fx}
      className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
      style={{ left: COL, top }}
    >
      {children}
    </h2>
  );
}

/** `2026.07.30   9:25` — 날짜와 시각 사이는 시안대로 공백 3칸. 값이 없으면 만들지 않는다. */
function stamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}   ${d.getHours()}:${p(d.getMinutes())}`;
}

/** 초 → `14분 12초` 조각(숫자 SemiBold 35 · 단위 Regular 22). */
function secondsParts(sec: number | null): { n: string; unit: string }[] | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r === 0 ? [{ n: `${m}`, unit: '분' }] : [{ n: `${m}`, unit: '분 ' }, { n: `${r}`, unit: '초' }];
}

function StatValue({ parts }: { parts: { n: string; unit: string }[] | null }) {
  if (!parts) return <span className="text-w-stat font-semibold leading-[35px] text-ink-500">—</span>;
  return (
    <span className="text-w-stat font-semibold leading-[35px] text-ink-900">
      {parts.map((p) => (
        <span key={p.unit}>
          {p.n}
          <span className="text-[22px] font-normal leading-[35px]">{p.unit}</span>
        </span>
      ))}
    </span>
  );
}

/** 카드 한 장만 그린다 — 머리(돌아가기 링크)는 화면마다 다르다. */
export function SessionAnalysisCard({ sessionId }: { sessionId?: string }) {
  const session = useSession(sessionId);
  const analysisRow = useSessionAnalysisBySession(sessionId);
  const logs = useSessionLogs(sessionId);

  const analysis = useMemo(
    () => (analysisRow.data ? parseSessionAnalysis(analysisRow.data) : null),
    [analysisRow.data],
  );
  const turns = useMemo(() => (logs.data ?? []).map(toConversationTurn), [logs.data]);
  const split = useMemo(() => computeEmotionSplit(turns), [turns]);
  const seconds = session.data?.duration_seconds ?? null;
  const traits = useMemo(
    () => describeSessionTraits(analysis, split, seconds),
    [analysis, split, seconds],
  );

  const elderTurns = turns.filter((t) => t.speaker === 'Elderly').length;
  /** 대화 횟수 = 어르신이 답한 횟수(기록이 없으면 분석 지표로 대신한다). */
  const talkCount = turns.length > 0 ? elderTurns : (analysis?.metrics.elderTurns ?? null);
  const responseRate = analysis == null ? null : Math.round(analysis.metrics.responseRate * 100);

  const bands: { key: 'bright' | 'calm' | 'longing'; color: string }[] = [
    { key: 'bright', color: webPalette.accent.DEFAULT },
    { key: 'calm', color: webPalette.topicRamp[3] },
    { key: 'longing', color: webPalette.accent.tint },
  ];
  const BAND_LABEL = { bright: '밝음', calm: '차분', longing: '그리움' } as const;

  /** 핵심 요약 — AI 요약이 있으면 문장을, 없으면 관찰된 호응 주제를 줄로 낸다. */
  const summaryLines = useMemo(() => {
    if (!analysis) return [];
    if (analysis.summary.trim()) return analysis.summary.split('\n').filter(Boolean);
    return analysis.topicsEngaged.map((t) => `· ${t} 주제에 호응하셨습니다.`);
  }, [analysis]);

  return (
    <>
      <div
        data-fx="228:4432"
        className="absolute left-[322px] h-[1347.8px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(CARD_TOP) }}
      >
        <span
          data-fx="228:4433"
          className="absolute whitespace-pre text-[22px] leading-[28px] text-ink-500"
          style={{ left: COL, top: 66.04 }}
        >
          {stamp(session.data?.started_at)}
        </span>
        <h1
          data-fx="228:4434"
          className="absolute w-[880px] truncate text-w-page font-bold leading-[70px] text-ink-900"
          style={{ left: COL, top: 82.85 }}
        >
          {session.data?.title ?? session.data?.current_topic ?? '회상 대화'}
        </h1>

        {[
          { fx: '228:4437', icon: asset.anBadgeMinutes, label: '대화시간', parts: secondsParts(seconds) },
          { fx: '228:4438', icon: asset.anBadgeSessions, label: '대화 횟수', parts: talkCount == null ? null : [{ n: `${talkCount}`, unit: '회' }] },
          { fx: '228:4439', icon: asset.anBadgeRate, label: '응답률', parts: responseRate == null ? null : [{ n: `${responseRate}`, unit: '%' }] },
        ].map((s, i) => (
          <div key={s.label} data-fx={s.fx} className={cn(TINT, 'h-[147px] w-[271px]')} style={{ left: COL + i * 305.5, top: 161.85 }}>
            <img src={s.icon} alt="" className="absolute left-[22px] top-[26px] block" style={{ width: 50, height: 50 }} />
            <div className="absolute left-[85px] top-[30.27px] whitespace-nowrap text-w-section font-medium leading-[35px] text-ink-900">
              {s.label}
            </div>
            <div className="absolute left-[87px] top-[75.29px] whitespace-nowrap">
              <StatValue parts={s.parts} />
            </div>
          </div>
        ))}

        <div data-fx="228:4465" className="absolute h-px w-[880px] bg-line" style={{ left: COL, top: 375.85 }} />
        <Section fx="228:4435" top={417.85}>
          핵심 요약
        </Section>
        <div
          data-fx="228:4468"
          className="absolute w-[880px] text-w-body leading-[38px] text-ink-700"
          style={{ left: COL, top: 485.29, wordBreak: 'keep-all' }}
        >
          {/* 요약이 없으면 문장을 만들지 않는다 */}
          {summaryLines.length === 0
            ? '이 세션의 분석이 아직 없습니다.'
            : summaryLines.map((line) => <p key={line}>{line}</p>)}
        </div>

        <div data-fx="228:4466" className="absolute h-px w-[880px] bg-line" style={{ left: COL, top: 654.85 }} />
        <Section fx="228:4436" top={697.85}>
          대화 특성
        </Section>
        {[
          { fx: '228:4469', label: '주요 감정', value: traits.topEmotion ? `${traits.topEmotion.label} ${traits.topEmotion.percent}%` : null },
          { fx: '228:4478', label: '대화 집중도', value: traits.focus },
          { fx: '228:4475', label: '표현 빈도', value: traits.expression },
          { fx: '228:4472', label: '대화 길이', value: traits.length },
        ].map((c, i) => (
          <div key={c.label} data-fx={c.fx} className={cn(TINT, 'h-[141px] w-[201px]')} style={{ left: COL + i * 227, top: 770.85 }}>
            <div className="absolute inset-x-0 top-[28.63px] text-center text-w-body leading-[30px] text-ink-900">
              {c.label}
            </div>
            <div className="absolute inset-x-0 top-[71.65px] text-center text-w-stat font-semibold leading-[35px] text-ink-900">
              {c.value ?? '—'}
            </div>
          </div>
        ))}

        {/* 키워드 칩 — 칩 38 r5, 글자 SemiBold 20 주황, 좌우 여백 18, 칩 사이 36 */}
        <div className="absolute flex items-center gap-[36px]" style={{ left: COL, top: 933.85 }}>
          {(analysis?.interestKeywords ?? []).length === 0 ? (
            <span className="text-w-body leading-[30px] text-ink-500">아직 모인 키워드가 없습니다.</span>
          ) : (
            analysis?.interestKeywords.map((k, i) => (
              <span
                key={k}
                data-fx={i === 0 ? '228:4482' : undefined}
                className="flex h-[38px] items-center rounded-[5px] border border-accent/30 bg-accent/[0.03] px-[18px] text-w-body font-semibold leading-[30px] text-accent"
              >
                #{k}
              </span>
            ))
          )}
        </div>

        <div data-fx="228:4493" className="absolute h-px w-[880px] bg-line" style={{ left: COL, top: 1037.85 }} />
        <Section fx="228:4467" top={1081.85}>
          감정 분석
        </Section>
        {split.turns === 0 ? (
          <p className="absolute text-w-body leading-[30px] text-ink-500" style={{ left: COL, top: 1160.85 }}>
            어르신 발화 기록이 없어 말투를 셀 수 없습니다.
          </p>
        ) : (
          <>
            {/* 표정 마크는 시안에 '밝음' 한 종류만 있다 */}
            {traits.topEmotion?.key === 'bright' ? (
              <img
                data-fx="228:4500"
                src={asset.anVerdictGood}
                alt=""
                className="absolute block"
                style={{ left: COL, top: 1159.69, width: 76, height: 76.05 }}
              />
            ) : null}
            <div
              data-fx="228:4494"
              className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-900"
              style={{ left: 183, top: 1160.85 }}
            >
              가장 많이 관찰된 말투는 ‘{traits.topEmotion?.label}’이에요
            </div>
            <div className="absolute flex items-center gap-[41px]" style={{ left: 183, top: 1198.85 }}>
              {bands.map((b) => (
                <span key={b.key} className="whitespace-nowrap text-w-body leading-[30px] text-ink-700">
                  {BAND_LABEL[b.key]} {split[b.key]}%
                </span>
              ))}
            </div>
            <div
              data-fx="228:4498"
              className="absolute flex h-[12px] overflow-hidden rounded-pill"
              style={{ left: COL, top: 1268.85, width: BAR_W }}
            >
              {bands.map((b) => (
                <span
                  key={b.key}
                  className="block h-full"
                  style={{ width: (BAR_W * split[b.key]) / 100, background: b.color }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 비의료 고지 — 분석 화면 상시 노출(apps/web/CLAUDE.md §4) */}
      <p
        className="absolute left-[322px] w-[1054px] text-w-label leading-[28px] text-ink-500"
        style={{ top: Y(1625), wordBreak: 'keep-all' }}
      >
        대화에서 직접 관찰된 지표입니다(효능·향상 판정이 아닙니다). AI가 만든 요약이며,
        의학적 판단이 아닙니다.
      </p>
    </>
  );
}
