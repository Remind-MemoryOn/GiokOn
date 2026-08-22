// 분석 — 개인별 종합 (Figma 228:4091 — 1440×3624)
//   제목 @(322,186) · 부제 @(322,236.13) · 목록으로 @(1285,187.1) ·
//   탭 @301(활성=종합 분석, 밑줄 81×3 @341) · 기간 pill 127×30 @(1249,292)
//   카드1 1054×1143 @(322,343) — 종합 대화 참여도 3칸 271×174 · TOP5 · AI 종합 의견
//   카드2 1054×1983 @(322,1552) — 5축 레이더 · 축 카드 156×176 · 변화 4칸 · 추이 · 종합 평가
//
// 전체 종합(225:1669)과 같은 부품을 쓰되 **대상이 어르신 한 명**이다. 수치는 전부
// `@giokon/core` 관찰 순수함수 — 근거가 없으면 값을 만들지 않고 `—`/빈 상태로 둔다.
// ⚠️ Figma 의 38회·11분 18초·+17% 와 AI 의견 문장은 **데모 값**이다.
// ⚠️ 카피: 축 카드의 "향상/하락", 종합 평가의 "매우 긍정적 … 향상되고 있으며" 는 방향을
//    단정하는 말이라 쓰지 않는다(apps/web/CLAUDE.md §4). 자리·치수는 시안 그대로 두고
//    **부호 있는 변화량**과 **관찰된 비교 결과**로 바꾼다.
// ⚠️ 종합 평가의 표정 마크는 시안에 **긍정 상태 1종만** 그려져 있다 → 전체 평균 이상일
//    때만 그린다(나머지 상태 에셋은 디자인 추가 필요).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  parseSessionAnalysis,
  toElderProfile,
  toSession,
  useOrgSessionAnalyses,
  useProfile,
  useSessionAnalyses,
  useSessions,
} from '@giokon/data';
import {
  OBSERVATION_AXES,
  axisAverage,
  computeAxisObservations,
  computeMonthlyAxisTrend,
  computeParticipationDetail,
  computeTopicShares,
  observationSummary,
  type ObservationAxis,
} from '@giokon/core';
import { webPalette } from '@giokon/theme';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { LineChart, RadarChart } from '../../components/charts';
import { cn } from '../../lib/utils';

const Y = (v: number) => v - 122;
/** 카드 좌상단을 원점으로 쓰는 좌표. */
const C1 = 343;
const C2 = 1552;
const COL1 = 87; // 카드1 콘텐츠 왼쪽(409 - 322)
const COL2 = 86; // 카드2 콘텐츠 왼쪽(408 - 322) — Figma 가 카드마다 1px 다르다

const PERIODS = [3, 6, 12] as const;
const AXIS_LABEL: Record<ObservationAxis, string> = {
  recall: '기억 회상력',
  emotion: '정서 안정감',
  participation: '대화 참여도',
  focus: '집중력',
  expression: '언어 표현력',
};
/** 레이더 꼭짓점 순서(Figma: 위에서 시계방향). */
const RADAR_ORDER: ObservationAxis[] = ['recall', 'emotion', 'participation', 'focus', 'expression'];
/** 주황 틴트 카드 — accent 3% + accent 30% 테두리 r5(전체 종합과 같은 부품). */
const TINT = 'absolute rounded-[5px] border border-accent/30 bg-accent/[0.03]';
/** 전체 평균과 "비슷하다"고 볼 폭(%p) — 표본 잡음을 방향으로 읽지 않기 위한 완충. */
const SIMILAR_BAND = 5;

/** 섹션 제목(Bold 25/70). */
function Section({ fx, left, top, children }: { fx?: string; left: number; top: number; children: React.ReactNode }) {
  return (
    <h2
      data-fx={fx}
      className="absolute whitespace-nowrap text-w-section font-bold leading-[70px] text-ink-900"
      style={{ left, top }}
    >
      {children}
    </h2>
  );
}

/** 구분선 880×1. */
function Rule({ fx, left, top }: { fx?: string; left: number; top: number }) {
  return <div data-fx={fx} className="absolute h-px w-[880px] bg-line" style={{ left, top }} />;
}

/** `11분 18초` — 숫자는 SemiBold 35, 단위는 Regular 22(시안 실측). */
function StatValue({ parts }: { parts: { n: string; unit: string }[] }) {
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

/** 초 → `11분 18초` 조각. 근거가 없으면 null. */
function secondsParts(sec: number | null): { n: string; unit: string }[] | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r === 0 ? [{ n: `${m}`, unit: '분' }] : [{ n: `${m}`, unit: '분 ' }, { n: `${r}`, unit: '초' }];
}

export function AnalysisElderPage() {
  const { elderId } = useParams<{ elderId: string }>();
  const { isConfigured } = useAuth();
  const [months, setMonths] = useState<(typeof PERIODS)[number]>(3);

  const profileQuery = useProfile(elderId);
  const sessionsQuery = useSessions(elderId);
  const analysesQuery = useSessionAnalyses(elderId);
  // "전체 평균 대비" 는 기관 전체 분석이 있어야 낼 수 있다.
  const orgAnalysesQuery = useOrgSessionAnalyses({ enabled: isConfigured, fetchAll: true });

  const elder = useMemo(
    () => (profileQuery.data ? toElderProfile(profileQuery.data) : null),
    [profileQuery.data],
  );
  const sessions = useMemo(
    () => (sessionsQuery.data ?? []).map(toSession),
    [sessionsQuery.data],
  );
  /** 분석 + 시각 + 세션 id. 파싱 실패한 행은 버린다(값을 만들지 않는다). */
  const dated = useMemo(() => {
    const out: {
      at: string;
      sessionId: string;
      analysis: NonNullable<ReturnType<typeof parseSessionAnalysis>>;
    }[] = [];
    for (const row of analysesQuery.data ?? []) {
      const a = parseSessionAnalysis(row);
      if (a) out.push({ at: row.created_at, sessionId: row.session_id, analysis: a });
    }
    return out;
  }, [analysesQuery.data]);
  const analyses = useMemo(() => dated.map((d) => d.analysis), [dated]);
  const withAt = useMemo(() => dated.map((d) => ({ ...d.analysis, at: d.at })), [dated]);

  /** 끝난 세션 한 건 = 대화 한 번. 분석이 아직 없는 세션도 횟수에는 든다. */
  const rows = useMemo(() => {
    const byId = new Map(dated.map((d) => [d.sessionId, d.analysis]));
    return (sessionsQuery.data ?? [])
      .filter((s) => s.status === 'ended')
      .map((s) => {
        const meta = sessions.find((x) => x.id === s.id);
        return {
          analysis: byId.get(s.id) ?? null,
          at: s.ended_at ?? s.started_at,
          seconds:
            s.duration_seconds ??
            (meta && meta.durationMinutes > 0 ? meta.durationMinutes * 60 : null),
        };
      });
  }, [dated, sessionsQuery.data, sessions]);

  const part = useMemo(() => computeParticipationDetail(rows, months), [rows, months]);
  const shares = useMemo(() => computeTopicShares([], analyses), [analyses]);
  const axisObs = useMemo(() => computeAxisObservations(withAt, months), [withAt, months]);
  const axisTrend = useMemo(() => computeMonthlyAxisTrend(withAt, months), [withAt, months]);

  /** 기관 전체 5축 평균 — 이 어르신과 같은 잣대로 견준다. */
  const orgAvg = useMemo(() => {
    const list: { at: string }[] & Record<number, unknown> = [];
    const acc: (NonNullable<ReturnType<typeof parseSessionAnalysis>> & { at: string })[] = [];
    for (const row of orgAnalysesQuery.data ?? []) {
      const a = parseSessionAnalysis(row);
      if (a) acc.push({ ...a, at: row.created_at });
    }
    void list;
    return axisAverage(computeAxisObservations(acc, months));
  }, [orgAnalysesQuery.data, months]);
  const myAvg = useMemo(() => axisAverage(axisObs), [axisObs]);
  /** 전체 평균 대비 차이(%p). 양쪽 근거가 다 있어야 낸다. */
  const vsOrg = myAvg == null || orgAvg == null ? null : myAvg - orgAvg;
  const verdict =
    vsOrg == null
      ? null
      : vsOrg > SIMILAR_BAND
        ? '전체 평균보다 높게 관찰됨'
        : vsOrg < -SIMILAR_BAND
          ? '전체 평균보다 낮게 관찰됨'
          : '전체 평균과 비슷하게 관찰됨';

  const monthLabel = (key: string) => `${Number(key.slice(5, 7))}월`;
  const summary = elder ? observationSummary(elder.name, shares) : null;

  /** 종합 대화 참여도 3칸(시안 순서: 평균 대화 시간 · 총 대화 횟수 · 평균 응답률). */
  const statCards = [
    {
      fx: '228:4094',
      icon: asset.anBadgeMinutes,
      label: '평균 대화 시간',
      parts: secondsParts(part.avgSeconds),
      delta: part.delta.avgSeconds == null ? null : Math.round(part.delta.avgSeconds / 60),
      deltaUnit: '분',
    },
    {
      fx: '228:4095',
      icon: asset.anBadgeSessions,
      label: '총 대화 횟수',
      parts: [{ n: `${part.totalSessions}`, unit: '회' }],
      delta: part.delta.totalSessions,
      deltaUnit: '회',
    },
    {
      fx: '228:4096',
      icon: asset.anBadgeRate,
      label: '평균 응답률',
      parts: part.avgResponseRate == null ? null : [{ n: `${part.avgResponseRate}`, unit: '%' }],
      delta: part.delta.avgResponseRate,
      deltaUnit: '%p',
    },
  ];

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
          className="pointer-events-none absolute left-[19px] top-[3px] whitespace-nowrap text-[16px] leading-[23px] text-ink-500"
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

      {/* ── 카드 1 ─────────────────────────────────────────────────────── */}
      <div
        data-fx="228:4093"
        className="absolute left-[322px] h-[1143px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(C1) }}
      >
        <Section fx="228:4097" left={COL1} top={42}>
          종합 대화 참여도
        </Section>

        {statCards.map((s, i) => (
          <div key={s.label} data-fx={s.fx} className={cn(TINT, 'h-[174px] w-[271px]')} style={{ left: COL1 + i * 304.5, top: 117 }}>
            <img src={s.icon} alt="" className="absolute left-[22px] top-[26px] block" style={{ width: 50, height: 50 }} />
            <div className="absolute left-[85px] top-[30.27px] whitespace-nowrap text-w-section font-medium leading-[35px] text-ink-900">
              {s.label}
            </div>
            <div className="absolute left-[87px] top-[75.3px] whitespace-nowrap">
              {s.parts ? <StatValue parts={s.parts} /> : <span className="text-w-stat font-semibold leading-[35px] text-ink-500">—</span>}
            </div>
            <div className="absolute left-[85px] top-[117.32px] flex items-center gap-[6px] whitespace-nowrap text-w-label leading-[35px] text-ink-500">
              {s.delta == null ? (
                '비교 근거 없음'
              ) : (
                <>
                  지난 기간 대비
                  <span className={cn('font-semibold', s.delta >= 0 ? 'text-live' : 'text-alert')}>
                    {s.delta >= 0 ? '▲' : '▼'} {Math.abs(s.delta)}
                    {s.deltaUnit}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}

        <Rule fx="228:4158" left={COL1} top={357} />
        <Section fx="228:4135" left={COL1} top={402}>
          종합 관심 주제 TOP 5
        </Section>
        {shares.length === 0 ? (
          <p className="absolute text-w-body leading-[30px] text-ink-500" style={{ left: COL1, top: 479 }}>
            아직 관찰된 주제가 없습니다.
          </p>
        ) : (
          shares.slice(0, 5).map((t, i) => (
            <div key={t.label}>
              <span
                data-fx={i === 0 ? '228:4136' : undefined}
                className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-900"
                style={{ left: COL1, top: 473 + i * 58 }}
              >
                {t.label}
              </span>
              <div
                data-fx={i === 0 ? '228:4138' : undefined}
                className="absolute h-[12px] w-[707px] rounded-pill bg-accent-tint"
                style={{ left: 172, top: 482 + i * 58 }}
              />
              <div
                className="absolute h-[12px] rounded-pill"
                style={{
                  left: 172,
                  top: 482 + i * 58,
                  width: (707 * Math.min(100, t.percent)) / 100,
                  background: webPalette.topicRamp[i % webPalette.topicRamp.length],
                }}
              />
              <span
                data-fx={i === 0 ? '228:4137' : undefined}
                className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-900"
                style={{ left: 921, top: 473 + i * 58 }}
              >
                {t.percent}%
              </span>
            </div>
          ))
        )}

        <Rule fx="228:4159" left={COL1} top={796} />
        <Section fx="228:4156" left={COL1} top={839}>
          AI 종합 의견
        </Section>
        <p
          data-fx="228:4157"
          className="absolute w-[880px] text-w-body leading-[28px] text-ink-700"
          style={{ left: COL1, top: 909.69, wordBreak: 'keep-all' }}
        >
          {/* 관찰 근거가 없으면 서술하지 않는다 — 시안 문장은 데모 값이라 옮기지 않는다 */}
          {summary ?? '아직 종합할 관찰 기록이 없습니다. 앱에서 세션이 끝나면 관찰 지표가 모입니다.'}
        </p>
      </div>

      {/* ── 카드 2 ─────────────────────────────────────────────────────── */}
      <div
        data-fx="228:4178"
        className="absolute left-[322px] h-[1983px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(C2) }}
      >
        <Section fx="228:4179" left={COL2} top={25}>
          인지 효과 지표
        </Section>

        <div className="absolute" style={{ left: 406, top: 145 }}>
          <RadarChart values={RADAR_ORDER.map((a) => axisObs.find((o) => o.axis === a)?.value ?? null)} />
        </div>
        {RADAR_ORDER.map((a, i) => {
          // Figma 실측 라벨 위치(레이더 중심 카드-상대 529,268 기준).
          const at = [
            { left: 470, top: 107, width: 119 },
            { left: 666, top: 217, width: 108 },
            { left: 553, top: 379, width: 108 },
            { left: 380, top: 379, width: 108 },
            { left: 294, top: 217, width: 108 },
          ][i];
          return (
            <span key={a} className="absolute text-center text-w-sub leading-[38px] text-ink-700" style={at}>
              {AXIS_LABEL[a]}
            </span>
          );
        })}

        {OBSERVATION_AXES.map((a, i) => {
          const o = axisObs.find((x) => x.axis === a);
          return (
            <div
              key={a}
              data-fx={i === 0 ? '228:4248' : undefined}
              className={cn(TINT, 'h-[176px] w-[156px]')}
              style={{ left: COL2 + i * 181, top: 460 }}
            >
              <div className="absolute inset-x-0 top-[29.13px] text-center text-w-section font-medium leading-[35px] text-ink-900">
                {AXIS_LABEL[a]}
              </div>
              <div className="absolute inset-x-0 top-[74.15px] text-center text-w-section font-bold leading-[35px] text-ink-900">
                {o?.value == null ? '—' : `${o.value}%`}
              </div>
              {/* 시안은 "향상/하락" 이라는 방향 단정이다 → 부호 있는 변화량으로 바꾼다 */}
              <div className="absolute inset-x-0 top-[121px] flex items-center justify-center gap-[4px] text-w-label leading-[30px] text-ink-500">
                {o?.delta == null ? (
                  '변화 근거 없음'
                ) : (
                  <span className={cn('font-semibold', o.delta >= 0 ? 'text-live' : 'text-alert')}>
                    {o.delta >= 0 ? '▲' : '▼'} {Math.abs(o.delta)}%p
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <Rule fx="228:4180" left={COL2} top={702} />
        <Section fx="228:4287" left={COL2} top={745}>
          종합 인지 활동 효과 분석
        </Section>
        {/* ⚠️ 시안 라벨은 "향상률·증가율"이지만 방향을 단정하는 말이라 **"변화"** 로 둔다 */}
        {(
          [
            { axis: 'recall', label: '기억 회상 변화', icon: asset.anTrendRecall, w: 36, h: 19.4 },
            { axis: 'emotion', label: '감정 표현 변화', icon: asset.anTrendEmotion, w: 36, h: 36 },
            { axis: 'participation', label: '대화 참여도 변화', icon: asset.anTrendPart, w: 34.5, h: 33.4 },
            { axis: 'expression', label: '응답 지속 시간 변화', icon: asset.anTrendResp, w: 36, h: 36 },
          ] as const
        ).map((m, i) => {
          const o = axisObs.find((x) => x.axis === m.axis);
          return (
            <div
              key={m.axis}
              data-fx={i === 0 ? '228:4182' : undefined}
              className={cn(TINT, 'h-[141px] w-[201px]')}
              style={{ left: COL2 + i * 226.33, top: 820 }}
            >
              <div className="absolute inset-x-0 top-[29.33px] text-center text-w-body leading-[30px] text-ink-900">
                {m.label}
              </div>
              <div className="absolute inset-x-0 top-[72.35px] flex items-center justify-center gap-[11px]">
                <img src={m.icon} alt="" className="block" style={{ width: m.w, height: m.h }} />
                <span className="text-w-stat font-bold leading-[35px] text-accent">
                  {o?.delta == null ? '—' : `${o.delta >= 0 ? '+' : ''}${o.delta}`}
                  {o?.delta == null ? '' : <span className="text-w-body font-medium">%p</span>}
                </span>
              </div>
            </div>
          );
        })}

        <Rule fx="228:4278" left={COL2} top={1027} />
        <Section fx="228:4288" left={COL2} top={1070}>
          지표별 변화 추이
        </Section>
        {/* 범례는 라벨 길이가 달라 폭이 제각각이다 — 시안 실측 간격 75 로 흘린다 */}
        <div className="absolute flex items-center gap-[75px]" style={{ left: COL2, top: 1141 }}>
          {axisTrend.series.map((s, i) => (
            <span key={s.axis} className="flex items-center gap-[7px] whitespace-nowrap">
              <span
                className="block h-[17px] w-[17px] shrink-0 rounded-pill"
                style={{ background: webPalette.series[i % webPalette.series.length] }}
              />
              <span className="text-w-body leading-[30px] text-ink-900">{AXIS_LABEL[s.axis]}</span>
            </span>
          ))}
        </div>
        {[100, 75, 50, 25, 0].map((v, i) => (
          <span
            key={v}
            className="absolute w-[56px] text-right text-[20px] leading-[45px] text-ink-500"
            style={{ left: COL2, top: 1205 + i * 56.25 }}
          >
            {v}%
          </span>
        ))}
        <div data-fx="228:4211" className="absolute h-[2px] w-[803px] bg-line" style={{ left: 165, top: 1445 }} />
        {axisTrend.months.map((k, i) => (
          <span
            key={k}
            className="absolute w-[30px] -translate-x-1/2 text-center text-w-body leading-[30px] text-ink-900"
            style={{
              left: 204.5 + (i * 725) / Math.max(1, axisTrend.months.length - 1),
              top: 1456,
            }}
          >
            {monthLabel(k)}
          </span>
        ))}
        <div className="absolute" style={{ left: 165, top: 1228 }}>
          <LineChart
            series={axisTrend.series.map((s) => ({ label: AXIS_LABEL[s.axis], points: s.points }))}
            months={axisTrend.months.map(monthLabel)}
          />
        </div>

        <Rule fx="228:4279" left={COL2} top={1545} />
        <Section fx="228:4309" left={COL2} top={1588}>
          인지 효과 종합 평가
        </Section>
        {verdict == null ? (
          <p className="absolute text-w-body leading-[30px] text-ink-500" style={{ left: COL2, top: 1664 }}>
            전체 평균과 견줄 관찰 기록이 아직 없습니다.
          </p>
        ) : (
          <>
            {/* 표정 마크는 시안에 긍정 1종만 있다 — 전체 평균 이상일 때만 그린다 */}
            {vsOrg != null && vsOrg >= -SIMILAR_BAND ? (
              <img
                data-fx="228:4313"
                src={asset.anVerdictGood}
                alt=""
                className="absolute block"
                style={{ left: 488, top: 1664.78, width: 76, height: 76 }}
              />
            ) : null}
            <div
              data-fx="228:4311"
              className="absolute -translate-x-1/2 whitespace-nowrap text-w-section font-semibold leading-[30px] text-accent"
              style={{ left: 526, top: 1759 }}
            >
              {verdict}
            </div>
            <div
              className="absolute w-[342px] -translate-x-1/2 text-center text-w-body leading-[28px] text-ink-900"
              style={{ left: 526, top: 1805, wordBreak: 'keep-all' }}
            >
              최근 {months}개월 관찰 5축 평균이 {myAvg}%로, 기관 전체 평균 {orgAvg}%와 견준 결과입니다.
            </div>
            <div
              data-fx="228:4314"
              className="absolute h-[32px] w-[225px] rounded-pill bg-accent-tint"
              style={{ left: 414, top: 1885 }}
            />
            <div
              className="absolute -translate-x-1/2 whitespace-nowrap text-w-sub leading-[25px] text-ink-900"
              style={{ left: 526, top: 1888 }}
            >
              전체 평균 대비 {vsOrg != null && vsOrg >= 0 ? '+' : ''}
              {vsOrg}%p
            </div>
          </>
        )}
      </div>

      {/* 비의료 고지 — 분석 화면 상시 노출(apps/web/CLAUDE.md §4) */}
      <p
        className="absolute left-[322px] w-[1054px] text-w-label leading-[28px] text-ink-500"
        style={{ top: Y(3551), wordBreak: 'keep-all' }}
      >
        대화에서 직접 관찰된 지표입니다(효능·향상 판정이 아닙니다). AI가 만든 요약이며,
        의학적 판단이 아닙니다.
      </p>
    </div>
  );
}
