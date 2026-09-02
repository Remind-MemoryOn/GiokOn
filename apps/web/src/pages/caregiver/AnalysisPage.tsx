// 분석 — 전체 종합 (Figma 225:1669 — 1440×4164)
//   제목 @(322,186) · 부제 @(322,236.17) · 탭 @301(활성 밑줄 125×3 @341) · 기간 pill 127×30 @(1249,292)
//   카드1 1054×1885 @(322,343) — 전체 요약 4칸 201×167 · TOP5 · 관심 주제 변화 · 주제별 상세 · 주요 키워드
//   카드2 1054×1780 @(322,2294) — 5축 레이더 · 축별 카드 156×176 · 변화율 4칸 · 추이 · AI 종합 의견
//
// **수치는 전부 `@giokon/core` 관찰 순수함수**로 낸다(앱과 같은 값). 근거가 없으면
// 값을 만들지 않고 `—`/빈 상태로 둔다 — 0(관찰 0회)과 null(측정 불가)을 구분한다.
// ⚠️ Figma 의 52명·142회·+22% 같은 숫자와 AI 의견 문장은 **데모 값**이다.
// ⚠️ 카피는 **시안 그대로**다(사용자 확정 2026-09-01) — "인지 효과 지표"·"향상률·증가율"·
//    축 카드 "향상/하락". 모바일이 같은 문구로 나가 있어 맞춘 결정이며, 화면 하단에
//    관찰 지표 고지를 함께 붙인다(비의료 포지셔닝 보완).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  parseSessionAnalysis,
  toElderProfile,
  toSession,
  useOrgSessionAnalyses,
  useProfiles,
  useRecentSessions,
} from '@giokon/data';
import {
  OBSERVATION_AXES,
  computeAxisObservations,
  computeMonthlyAxisTrend,
  computeMonthlyTopicTrend,
  computeOverall,
  computeTopicDetail,
  type ObservationAxis,
} from '@giokon/core';
import { webPalette } from '@giokon/theme';
import { asset } from '../../assets/ui';
import { useAuth } from '../../auth/AuthProvider';
import { LineChart, RadarChart } from '../../components/charts';
import { cn } from '../../lib/utils';

const Y = (v: number) => v - 122;
/** 카드 좌상단을 원점으로 쓰는 좌표(카드 안 요소는 전부 이 기준). */
const C1 = 343;
const C2 = 2294;
const COL = 87; // 카드 안 콘텐츠 왼쪽(409 - 322)

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
/** 초 → `8분 45초`. 근거가 없으면 만들지 않는다. */
function secondsLabel(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r === 0 ? `${m}분` : `${m}분 ${r}초`;
}
/** 측정 불가는 값을 만들지 않는다. */
const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

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

/** 구분선 880×1. */
function Rule({ fx, top }: { fx?: string; top: number }) {
  return <div data-fx={fx} className="absolute h-px w-[880px] bg-line" style={{ left: COL, top }} />;
}

/** 주황 틴트 카드(요약·키워드·변화율 공통) — accent 3% + accent 30% 테두리 r5. */
const TINT = 'absolute rounded-[5px] border border-accent/30 bg-accent/[0.03]';

export function AnalysisPage() {
  const { isConfigured } = useAuth();
  const [months, setMonths] = useState<(typeof PERIODS)[number]>(3);
  const [topicPick, setTopicPick] = useState<string | null>(null);

  const profilesQuery = useProfiles();
  const sessionsQuery = useRecentSessions({ enabled: isConfigured, fetchAll: true });
  const analysesQuery = useOrgSessionAnalyses({ enabled: isConfigured, fetchAll: true });

  const elders = useMemo(() => (profilesQuery.data ?? []).map(toElderProfile), [profilesQuery.data]);
  const sessions = useMemo(() => (sessionsQuery.data ?? []).map(toSession), [sessionsQuery.data]);
  /** 분석 + 시각(월별 집계에 필요). 파싱 실패한 행은 버린다(값을 만들지 않는다). */
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

  const overall = useMemo(
    () => computeOverall(elders, sessions, analyses),
    [elders, sessions, analyses],
  );
  const topicTrend = useMemo(
    () => computeMonthlyTopicTrend(withAt, months),
    [withAt, months],
  );
  const axisTrend = useMemo(() => computeMonthlyAxisTrend(withAt, months), [withAt, months]);
  const axisObs = useMemo(() => computeAxisObservations(withAt, months), [withAt, months]);

  // 주제 선택은 상위 주제 첫 번째가 기본 — 목록이 바뀌면 따라간다.
  const topic = topicPick ?? overall.topTopics[0]?.label ?? '';
  const setTopic = (t: string) => setTopicPick(t);
  const secondsBySession = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) if (s.durationMinutes > 0) m.set(s.id, s.durationMinutes * 60);
    return m;
  }, [sessions]);
  const detail = useMemo(
    () =>
      computeTopicDetail(
        dated.map((d) => ({
          analysis: d.analysis,
          at: d.at,
          seconds: secondsBySession.get(d.sessionId) ?? null,
        })),
        topic,
        months,
      ),
    [dated, secondsBySession, topic, months],
  );

  const monthLabel = (key: string) => `${Number(key.slice(5, 7))}월`;

  return (
    // 좌표가 화면 절대값이라 본문 여백과 사이드바를 되빼 원점을 맞춘다.
    <div className="relative -ml-[323px] h-[4042px] w-[1440px]">
      <h1
        data-fx="225:1738"
        className="absolute left-[322px] whitespace-nowrap text-w-page font-bold leading-[40px] text-ink-900"
        style={{ top: Y(186) }}
      >
        분석
      </h1>
      <p
        data-fx="225:1739"
        className="absolute left-[322px] whitespace-nowrap text-w-body leading-[30px] text-ink-700"
        style={{ top: Y(236.17) }}
      >
        앱 대화가 끝나면 세선별 관찰 지표(참여·응답·주제 반응)가 실시간으로 도착합니다.
      </p>

      {/* 탭 — 전체 종합 / 개인별 */}
      <span
        data-fx="228:3050"
        className="absolute whitespace-nowrap text-w-nav font-semibold leading-[30px] text-accent"
        style={{ left: 426, top: Y(301) }}
      >
        전체 종합 분석
      </span>
      <div
        data-fx="228:3052"
        className="absolute h-[3px] w-[125px] bg-accent"
        style={{ left: 426, top: Y(341) }}
      />
      <Link
        to="/caregiver/analysis/elders"
        data-fx="228:3051"
        className="absolute whitespace-nowrap text-w-nav leading-[30px] text-ink-500"
        style={{ left: 598, top: Y(301) }}
      >
        개인별 분석
      </Link>

      {/* 기간 — 시안은 '최근 3개월' 하나지만 실제로는 고를 수 있어야 한다 */}
      <div
        data-fx="228:3053"
        className="absolute h-[30px] w-[127px] rounded-[5px] border border-ink-500/30 bg-ink-500/[0.03]"
        style={{ left: 1249, top: Y(292) }}
      >
        <span
          data-fx="228:3055"
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
        data-fx="228:2983"
        className="absolute left-[322px] h-[1885px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(C1) }}
      >
        <Section fx="228:2987" top={42}>
          전체 요약
        </Section>

        {[
          { fx: '228:2911', label: '총 어르신 수', value: `${overall.totalElders}`, unit: '명', icon: asset.anElders },
          { fx: '228:2945', label: '총 세션 수', value: `${overall.totalSessions}`, unit: '회', icon: asset.anSessions },
          { fx: '228:2959', label: '평균 대화 시간', value: overall.avgMinutes == null ? '—' : `${overall.avgMinutes}`, unit: overall.avgMinutes == null ? '' : '분', icon: asset.anMinutes },
          { fx: '228:2968', label: '평균 응답률', value: overall.avgResponseRate == null ? '—' : `${overall.avgResponseRate}`, unit: overall.avgResponseRate == null ? '' : '%', icon: asset.anResponse },
        ].map((s, i) => (
          <div key={s.label} data-fx={s.fx} className={cn(TINT, 'h-[167px] w-[201px]')} style={{ left: COL + i * 226.33, top: 117 }}>
            <div className="absolute inset-x-0 top-[43.36px] text-center text-w-body leading-[30px] text-ink-900">
              {s.label}
            </div>
            <div className="absolute inset-x-0 top-[90.4px] flex items-center justify-center gap-[12px]">
              <img src={s.icon} alt="" height={36} className="block" style={{ width: i === 0 ? 48 : 36, height: i === 0 ? 33 : 36 }} />
              <span className="text-w-section font-bold leading-[30px] text-ink-900">
                {s.value}
                <span className="text-w-body font-medium">{s.unit}</span>
              </span>
            </div>
          </div>
        ))}

        <Rule fx="228:3048" top={350} />
        <Section fx="228:3025" top={393}>
          가장 많이 이야기한 주제 TOP 5
        </Section>
        {overall.topTopics.length === 0 ? (
          <p className="absolute text-w-body leading-[30px] text-ink-500" style={{ left: COL, top: 470 }}>
            아직 관찰된 주제가 없습니다.
          </p>
        ) : (
          overall.topTopics.slice(0, 5).map((t, i) => (
            <div key={t.label}>
              <span
                data-fx={i === 0 ? '228:3026' : undefined}
                className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-900"
                style={{ left: COL, top: 464 + i * 58 }}
              >
                {t.label}
              </span>
              <div
                data-fx={i === 0 ? '228:3028' : undefined}
                className="absolute h-[12px] w-[707px] rounded-pill bg-accent-tint"
                style={{ left: 172, top: 473 + i * 58 }}
              />
              <div
                className="absolute h-[12px] rounded-pill"
                style={{
                  left: 172,
                  top: 473 + i * 58,
                  width: (707 * Math.min(100, t.percent)) / 100,
                  background: webPalette.topicRamp[i % webPalette.topicRamp.length],
                }}
              />
              <span
                data-fx={i === 0 ? '228:3027' : undefined}
                className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-900"
                style={{ left: 921, top: 464 + i * 58 }}
              >
                {t.percent}%
              </span>
            </div>
          ))
        )}

        <Rule fx="228:3244" top={787} />
        <Section fx="228:3246" top={830}>
          종합 관심 주제 변화
        </Section>
        {topicTrend.series.map((s, i) => (
          <div key={s.label}>
            <span
              className="absolute block h-[17px] w-[17px] rounded-pill"
              style={{ left: COL + i * 200, top: 906.5, background: webPalette.series[i % webPalette.series.length] }}
            />
            <span
              className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-900"
              style={{ left: COL + 24 + i * 200, top: 901 }}
            >
              {s.label}
            </span>
          </div>
        ))}
        {[100, 75, 50, 25, 0].map((v, i) => (
          <span
            key={v}
            className="absolute w-[56px] text-right text-[20px] leading-[45px] text-ink-500"
            style={{ left: 87, top: 965 + i * 56.25 }}
          >
            {v}%
          </span>
        ))}
        <div data-fx="228:3228" className="absolute h-[2px] w-[803px] bg-line" style={{ left: 166, top: 1205 }} />
        {topicTrend.months.map((k, i) => (
          <span
            key={k}
            className="absolute w-[30px] -translate-x-1/2 text-center text-w-body leading-[30px] text-ink-900"
            style={{
              left: 205.5 + (i * 725) / Math.max(1, topicTrend.months.length - 1),
              top: 1216,
            }}
          >
            {monthLabel(k)}
          </span>
        ))}
        <div className="absolute" style={{ left: 166, top: 988 }}>
          <LineChart series={topicTrend.series} months={topicTrend.months.map(monthLabel)} />
        </div>

        <Rule fx="228:3245" top={1305} />
        <Section fx="228:3267" top={1348}>
          주제별 상세 분석
        </Section>
        {overall.topTopics.length === 0 ? (
          <p className="absolute text-w-body leading-[30px] text-ink-500" style={{ left: COL, top: 1440 }}>
            아직 주제별로 견줄 만한 기록이 없습니다.
          </p>
        ) : (
          <>
            <div
              data-fx="228:3317"
              className="absolute h-[30px] w-[95px] rounded-[5px] border border-ink-500/30 bg-ink-500/[0.03]"
              style={{ left: 873, top: 1368 }}
            >
              <span className="pointer-events-none absolute left-[25px] top-0 whitespace-nowrap text-w-body leading-[30px] text-ink-900">
                {topic}
              </span>
              <img
                src={asset.iconChevronDownSm}
                alt=""
                width={12}
                height={7.81}
                className="pointer-events-none absolute left-[77px] top-[19.81px] block"
              />
              <select
                aria-label="상세를 볼 주제"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                {overall.topTopics.map((t) => (
                  <option key={t.label} value={t.label}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {[
              { fx: '228:3272', label: '언급 빈도', value: `${detail.mentions}`, unit: '회', delta: detail.delta.mentions, deltaUnit: '회' },
              { fx: '228:3273', label: '긍정 반응률', value: detail.positiveRate == null ? '—' : `${detail.positiveRate}`, unit: detail.positiveRate == null ? '' : '%', delta: detail.delta.positiveRate, deltaUnit: '%p' },
              { fx: '228:3274', label: '평균 대화 시간', value: secondsLabel(detail.avgSeconds), unit: '', delta: detail.delta.avgSeconds == null ? null : Math.round(detail.delta.avgSeconds / 60), deltaUnit: '분' },
            ].map((m, i) => (
              <div key={m.label} data-fx={m.fx} className={cn(TINT, 'h-[174px] w-[271px]')} style={{ left: COL + i * 304.5, top: 1423 }}>
                <div className="absolute inset-x-0 top-[31.29px] text-center text-w-section font-medium leading-[35px] text-ink-900">
                  {m.label}
                </div>
                <div className="absolute inset-x-0 top-[76.33px] text-center text-w-stat font-bold leading-[35px] text-ink-900">
                  {m.value}
                  <span className="text-w-body font-medium">{m.unit}</span>
                </div>
                <div className="absolute inset-x-0 top-[121.36px] text-center text-w-label leading-[35px] text-ink-500">
                  {m.delta == null ? (
                    '비교 근거 없음'
                  ) : (
                    <>
                      지난 기간 대비{' '}
                      <span className={m.delta >= 0 ? 'text-live' : 'text-alert'}>
                        {m.delta >= 0 ? '▲' : '▼'} {Math.abs(m.delta)}
                        {m.deltaUnit}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        <Rule fx="228:3410" top={1663} />
        <Section fx="228:3412" top={1706}>
          주요 키워드
        </Section>
        {(() => {
          const keywords = [...new Set(analyses.flatMap((a) => a.interestKeywords))].slice(0, 5);
          if (keywords.length === 0) {
            return (
              <p className="absolute text-w-body leading-[30px] text-ink-500" style={{ left: COL, top: 1781 }}>
                아직 모인 키워드가 없습니다.
              </p>
            );
          }
          let x = COL - 19;
          return keywords.map((k, i) => {
            const left = x;
            // 칩은 글자 + 좌우 18 — 다음 칩은 36 띄운다(Figma 실측 pitch).
            x += k.length * 15 + 36 + 36;
            return (
              <span
                key={k}
                data-fx={i === 0 ? '228:3398' : undefined}
                className={cn(TINT, 'flex h-[38px] items-center px-[18px] text-w-body leading-[30px] text-accent')}
                style={{ left, top: 1781 }}
              >
                #{k}
              </span>
            );
          });
        })()}
      </div>

      {/* ── 카드 2 ─────────────────────────────────────────────────────── */}
      <div
        data-fx="228:3059"
        className="absolute left-[322px] h-[1780px] w-[1054px] rounded-[10px] bg-white shadow-card"
        style={{ top: Y(C2) }}
      >
        <Section fx="228:3060" top={25}>
          인지 효과 지표
        </Section>

        <div className="absolute" style={{ left: 406, top: 145 }}>
          <RadarChart values={RADAR_ORDER.map((a) => axisObs.find((o) => o.axis === a)?.value ?? null)} />
        </div>
        {RADAR_ORDER.map((a, i) => {
          // Figma 실측 라벨 위치(레이더 중심 529,268 기준).
          const at = [
            { left: 470, top: 107 },
            { left: 666, top: 217 },
            { left: 553, top: 379 },
            { left: 380, top: 379 },
            { left: 294, top: 217 },
          ][i];
          return (
            <span
              key={a}
              className="absolute w-[108px] text-center text-w-sub leading-[38px] text-ink-700"
              style={at}
            >
              {AXIS_LABEL[a]}
            </span>
          );
        })}

        {OBSERVATION_AXES.map((a, i) => {
          const o = axisObs.find((x) => x.axis === a);
          return (
            <div
              key={a}
              data-fx={i === 0 ? '228:3129' : undefined}
              className={cn(TINT, 'h-[176px] w-[156px]')}
              style={{ left: 86 + i * 181, top: 460 }}
            >
              <div className="absolute inset-x-0 top-[30px] text-center text-w-section font-medium leading-[35px] text-ink-900">
                {AXIS_LABEL[a]}
              </div>
              <div className="absolute inset-x-0 top-[75px] text-center text-w-section font-bold leading-[35px] text-ink-900">
                {pct(o?.value ?? null)}
              </div>
              {/* 시안 그대로 방향 라벨만 둔다(숫자 없음). 견줄 이전 기록이 없으면
                  방향을 만들지 않고 비워 둔다 — 시안에는 없는 상태다. */}
              <div className="absolute inset-x-0 top-[121px] text-center text-w-body leading-[30px] text-ink-500">
                {o?.delta == null ? (
                  '—'
                ) : (
                  <span className={cn('font-semibold', o.delta >= 0 ? 'text-live' : 'text-alert')}>
                    {o.delta >= 0 ? '▲ 향상' : '▼ 하락'}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <Rule fx="228:3061" top={702} />
        <Section fx="228:3168" top={745}>
          종합 인지 활동 효과 분석
        </Section>
        {/* 라벨·단위 모두 시안 그대로(향상률·증가율 · `%`). 값이 백분율의 차이라 엄밀히는
            %p 지만 표기는 시안을 따른다(사용자 확정 2026-09-01). */}
        {(
          [
            { axis: 'recall', label: '기억 회상 향상률', icon: asset.anTrendRecall, w: 36, h: 19.4 },
            { axis: 'emotion', label: '감정 표현 증가율', icon: asset.anTrendEmotion, w: 36, h: 36 },
            { axis: 'participation', label: '대화 참여도 향상률', icon: asset.anTrendPart, w: 34.5, h: 33.4 },
            { axis: 'expression', label: '응답 지속 시간 증가율', icon: asset.anTrendResp, w: 36, h: 36 },
          ] as const
        ).map((m, i) => {
          const o = axisObs.find((x) => x.axis === m.axis);
          return (
            <div
              key={m.axis}
              data-fx={i === 0 ? '228:3063' : undefined}
              className={cn(TINT, 'h-[141px] w-[201px]')}
              style={{ left: 86 + i * 226.33, top: 820 }}
            >
              <div className="absolute inset-x-0 top-[30.27px] text-center text-w-body leading-[30px] text-ink-900">
                {m.label}
              </div>
              <div className="absolute inset-x-0 top-[73.3px] flex items-center justify-center gap-[11px]">
                <img src={m.icon} alt="" className="block" style={{ width: m.w, height: m.h }} />
                <span className="text-w-stat font-bold leading-[35px] text-accent">
                  {o?.delta == null ? '—' : `${o.delta >= 0 ? '+' : ''}${o.delta}`}
                  {o?.delta == null ? '' : <span className="text-w-body font-medium">%</span>}
                </span>
              </div>
            </div>
          );
        })}

        <Rule fx="228:3159" top={1027} />
        <Section fx="228:3169" top={1070}>
          지표별 변화 추이
        </Section>
        {axisTrend.series.map((s, i) => (
          <div key={s.axis}>
            <span
              className="absolute block h-[17px] w-[17px] rounded-pill"
              style={{ left: 86 + i * 200, top: 1146.5, background: webPalette.series[i % webPalette.series.length] }}
            />
            <span
              className="absolute whitespace-nowrap text-w-body leading-[30px] text-ink-900"
              style={{ left: 110 + i * 200, top: 1141 }}
            >
              {AXIS_LABEL[s.axis]}
            </span>
          </div>
        ))}
        {[100, 75, 50, 25, 0].map((v, i) => (
          <span
            key={v}
            className="absolute w-[56px] text-right text-[20px] leading-[45px] text-ink-500"
            style={{ left: 86, top: 1205 + i * 56.25 }}
          >
            {v}%
          </span>
        ))}
        <div data-fx="228:3092" className="absolute h-[2px] w-[803px] bg-line" style={{ left: 165, top: 1445 }} />
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

        <Rule fx="228:3160" top={1545} />
        <Section fx="228:3190" top={1588}>
          AI 종합 의견
        </Section>
        <p
          data-fx="228:3206"
          className="absolute w-[880px] text-w-body leading-[28px] text-ink-700"
          style={{ left: 86, top: 1660.85, wordBreak: 'keep-all' }}
        >
          {/* AI 요약은 근거가 있을 때만 — 시안 문장은 데모 값이라 옮기지 않는다 */}
          {analyses.length === 0
            ? '아직 분석할 대화가 없습니다. 앱에서 세션이 끝나면 관찰 지표가 모입니다.'
            : `최근 ${months}개월 동안 ${analyses.length}건의 대화가 분석됐습니다. 세부 근거는 개인별 분석에서 확인해 주세요.`}
        </p>
      </div>

      {/* 비의료 고지 — 분석 화면 상시 노출(apps/web/CLAUDE.md §4) */}
      <p
        className="absolute left-[322px] w-[1054px] text-w-label leading-[28px] text-ink-500"
        style={{ top: Y(4090), wordBreak: 'keep-all' }}
      >
        대화에서 직접 관찰된 지표입니다(효능·향상 판정이 아닙니다). AI가 만든 요약이며,
        의학적 판단이 아닙니다.
      </p>
    </div>
  );
}
