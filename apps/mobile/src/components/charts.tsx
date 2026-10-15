// 관찰 지표 차트 (Figma 인지 효과 분석 `134:94` / 주제별 분석 `140:562`).
//
// Figma 실측:
//  [레이더] 5각형 링 5개 r 97.5/77/58/37.5/18.5, 중심 (196.5, 318.5) — 20/40/60/80/100%
//    (실측: 최외곽 오각형 y 221.0..397.4 · x 103.75..289.25 — 정오각형과 일치)
//    링 선 #e9e9e9 · 데이터 폴리곤 채움 #f8e3d2 + 선 #e9822b + 꼭지점 점 4
//    축 라벨 Medium 13 검정 (기억 회상력 위 → 시계방향), lineHeight 38 기준 잉크 offset 13
//    라벨 잉크 top 198.5(위) / 284.5(좌·우) / 410.5(하) → 블록 top 185.5
//  [꺾은선] 0% ↔ y 1317(=X축선), 100% ↔ 1169 → 플롯 높이 148, 블록 top 1169
//    X축선 290×1 #d9d9d9 @left 71 · 점 중심 x 89.5 / 217 / 344.5 · 점 지름 7 · 선 두께 2
//    Y 라벨 Regular 12 #7b7c7c (우측 정렬 ~63, 잉크 top 1164.25 부터 pitch 37)
//    월 라벨 Regular 12 검정 잉크 top 1330.5
//
// ⚠️ 값이 없는 지점(null)은 점·선을 그리지 않는다 — 없는 관찰을 이어 붙이지 않는다.
//
// 기기 폭 대응: 좌표는 Figma 336 폭 기준이다. 레이더는 콘텐츠 가운데로 옮기고(라벨도 함께),
// 꺾은선은 X축선·점 간격을 콘텐츠 폭 증감만큼 늘린다(393 폭에서는 Figma 그대로).
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline } from 'react-native-svg';
import { useContentWidth } from '../lib/layout';

// ── 레이더 ────────────────────────────────────────────────────
const RADAR_R = 97.5;
/** 링 반지름(Figma 실측) — 20/40/60/80/100% 위치. */
const RINGS = [18.5, 37.5, 58, 77, 97.5];
/** 컴포넌트 로컬 중심 (Figma (196.5,318.5) − 블록 원점 (29,185.5)). */
const RADAR_CX_BASE = 167.5;
const RADAR_CY = 133;
/** 블록 높이 — 다음 요소(지표 카드)가 Figma 457 에 오도록 185.5 + 253.5 + 18 = 457. */
const RADAR_H = 253.5;

function pentagonPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 5 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

export interface RadarAxis {
  label: string;
  /** 0~100. 측정 근거가 없으면 null(점을 찍지 않는다). */
  value: number | null;
}

/**
 * 축 라벨 위치(Figma 좌표 − 블록 원점 (29,185.5)). 시계방향: 위 → 우 → 우하 → 좌하 → 좌.
 * 정렬은 Figma 잉크 x 실측(162.75 / 302.25 / 248.5 / 102.25 / 29.5)에 맞춘 값이다.
 */
const AXIS_LABEL_POS = [
  { left: 124, top: 0, width: 78, align: 'center' as const },
  { left: 273, top: 86, width: 99, align: 'left' as const },
  { left: 199, top: 212, width: 99, align: 'center' as const },
  { left: 40, top: 212, width: 99, align: 'center' as const },
  { left: 0, top: 86, width: 99, align: 'left' as const },
];

export function RadarChart({ axes }: { axes: RadarAxis[] }) {
  const { contentW, extra } = useContentWidth();
  // 레이더를 콘텐츠 가운데로 — 336 폭에서 167.5(Figma).
  const shiftX = extra / 2;
  const RADAR_CX = RADAR_CX_BASE + shiftX;
  const measured = axes.filter((a) => a.value !== null);
  const dataPoints =
    measured.length === axes.length
      ? axes.map((a, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          const r = (Math.max(0, Math.min(100, a.value as number)) / 100) * RADAR_R;
          return { x: RADAR_CX + r * Math.cos(angle), y: RADAR_CY + r * Math.sin(angle) };
        })
      : [];

  return (
    <View style={{ width: contentW, height: RADAR_H }}>
      <Svg width={contentW} height={RADAR_H}>
        {RINGS.map((r) => (
          <Polygon
            key={r}
            points={pentagonPoints(RADAR_CX, RADAR_CY, r)}
            fill="none"
            stroke="#e9e9e9"
            strokeWidth={1}
          />
        ))}
        {/* 축선 */}
        {Array.from({ length: 5 }, (_, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          return (
            <Line
              key={i}
              x1={RADAR_CX}
              y1={RADAR_CY}
              x2={RADAR_CX + RADAR_R * Math.cos(angle)}
              y2={RADAR_CY + RADAR_R * Math.sin(angle)}
              stroke="#e9e9e9"
              strokeWidth={1}
            />
          );
        })}
        {dataPoints.length === 5 ? (
          <>
            <Polygon
              points={dataPoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
              fill="#f8e3d2"
              stroke="#e9822b"
              strokeWidth={1.5}
            />
            {dataPoints.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={2} fill="#e9822b" />
            ))}
          </>
        ) : null}
      </Svg>

      {axes.slice(0, 5).map((a, i) => {
        const pos = AXIS_LABEL_POS[i];
        return (
          <Text
            key={a.label}
            className="absolute text-[13px] font-medium text-black"
            style={{ left: pos.left + shiftX, top: pos.top, width: pos.width, lineHeight: 38, textAlign: pos.align }}
          >
            {a.label}
          </Text>
        );
      })}

      {dataPoints.length < 5 ? (
        <Text
          className="absolute text-[13px] font-normal text-muted text-center"
          style={{ left: 0, right: 0, top: RADAR_CY + 40 }}
        >
          아직 관찰된 기록이 없어요.
        </Text>
      ) : null}
    </View>
  );
}

// ── 꺾은선 ────────────────────────────────────────────────────
/** Figma: 0% ↔ X축선, 100% ↔ 축선 − 148. */
const PLOT_H = 148;
/** Y 라벨 4칸(0/25/50/75/100%) 간격. */
const Y_STEPS = [100, 75, 50, 25, 0];
const AXIS_LEFT = 42; // Figma 71 − 29
const AXIS_W_BASE = 290;
const DOT_FIRST = 60.5; // Figma 첫 점 중심 89.5 − 29
const DOT_LAST_BASE = 315.5; // Figma 마지막 점 중심 344.5 − 29 (336 폭 기준)
/** 블록 높이 — 다음 구분선이 Figma 1372 에 오도록 1169 + 179 + 24 = 1372. */
const TREND_H = 179;

export interface TrendSeries {
  label: string;
  /** 0~100, 기록 없는 지점은 null. */
  points: (number | null)[];
  color: string;
}

export function TrendChart({
  labels,
  series,
}: {
  /** X축 라벨(월 등). */
  labels: string[];
  series: TrendSeries[];
}) {
  const { contentW, extra } = useContentWidth();
  // X축선·마지막 점을 콘텐츠 폭 증감만큼 늘린다(336 폭에서 Figma 그대로).
  const AXIS_W = AXIS_W_BASE + extra;
  const DOT_LAST = DOT_LAST_BASE + extra;
  const n = labels.length;
  const xOf = (i: number) => (n <= 1 ? DOT_FIRST : DOT_FIRST + (i * (DOT_LAST - DOT_FIRST)) / (n - 1));
  const yOf = (v: number) => PLOT_H - (Math.max(0, Math.min(100, v)) / 100) * PLOT_H;
  const hasData = series.some((s) => s.points.some((p) => p !== null));

  return (
    <View style={{ width: contentW, height: TREND_H }}>
      <Svg width={contentW} height={PLOT_H + 1}>
        <Line x1={AXIS_LEFT} y1={PLOT_H} x2={AXIS_LEFT + AXIS_W} y2={PLOT_H} stroke="#d9d9d9" strokeWidth={1} />
        {hasData
          ? series.map((s) => {
              // null 구간은 선을 끊는다(없는 관찰을 잇지 않는다).
              const segments: { x: number; y: number }[][] = [];
              let cur: { x: number; y: number }[] = [];
              s.points.forEach((p, i) => {
                if (p === null) {
                  if (cur.length) segments.push(cur);
                  cur = [];
                } else {
                  cur.push({ x: xOf(i), y: yOf(p) });
                }
              });
              if (cur.length) segments.push(cur);
              return (
                <React.Fragment key={s.label}>
                  {segments.map((seg, si) =>
                    seg.length > 1 ? (
                      <Polyline
                        key={si}
                        points={seg.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={2}
                      />
                    ) : null,
                  )}
                  {segments.flat().map((p, pi) => (
                    <Circle key={pi} cx={p.x} cy={p.y} r={3.5} fill={s.color} />
                  ))}
                </React.Fragment>
              );
            })
          : null}
      </Svg>

      {/* Y 라벨 — 0% 는 축선, 100% 는 축선 −148 (잉크 top 을 Figma 에 맞춘 −10.5) */}
      {Y_STEPS.map((v) => (
        <Text
          key={v}
          className="absolute text-[12px] font-normal text-muted"
          style={{ left: 0, width: 35, top: yOf(v) - 10.5, lineHeight: 20, textAlign: 'right' }}
        >
          {v}%
        </Text>
      ))}

      {/* X 라벨 — Figma 잉크 top 1330.5 (블록 top 1169 기준 rel 161.5) */}
      {labels.map((l, i) => (
        <Text
          key={l}
          className="absolute text-[12px] font-normal text-black text-center"
          style={{ left: xOf(i) - 20, width: 40, top: PLOT_H + 8.75, lineHeight: 20 }}
        >
          {l}
        </Text>
      ))}

      {!hasData ? (
        <Text
          className="absolute text-[13px] font-normal text-muted text-center"
          style={{ left: 0, right: 0, top: PLOT_H / 2 - 10 }}
        >
          기록이 쌓이면 추이를 보여드려요.
        </Text>
      ) : null}
    </View>
  );
}
