// 분석 화면 그래프 — SVG 직접 구현(차트 라이브러리를 새로 들이지 않는다).
// 좌표·색은 Figma 분석 페이지(`225:1669`) 실측이며, **값은 항상 실데이터**다.
// 근거가 없으면 점을 찍지 않는다(선이 끊긴다) — 없는 값을 0 으로 그리지 않는다.
import { webPalette } from '@giokon/theme';

export interface Series {
  label: string;
  /** 월별 값(0~100). 관찰 근거가 없는 달은 null — 그 점은 찍지 않는다. */
  points: (number | null)[];
}

/** 꺾은선 — Figma 실측: 축선 803×2, 눈금 0/25/50/75/100, 점 지름 11. */
export function LineChart({
  series,
  months,
  width = 803,
  height = 217,
}: {
  series: Series[];
  /** X축 라벨(`4월` …). points 와 길이가 같아야 한다. */
  months: string[];
  width?: number;
  height?: number;
}) {
  const n = Math.max(months.length, 1);
  // 첫·마지막 점은 축선 안쪽으로 39.5 들어간다(Figma 488↔527.5 · 1291↔1252.5).
  const inset = 39.5;
  const span = width - inset * 2;
  const x = (i: number) => (n === 1 ? width / 2 : inset + (i * span) / (n - 1));
  const y = (v: number) => height - (v / 100) * height;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`월별 추이 — ${series.map((s) => s.label).join(', ')}`}
      className="block overflow-visible"
    >
      {series.map((s, si) => {
        const color = webPalette.series[si % webPalette.series.length];
        const pts = s.points
          .map((v, i) => (v == null ? null : ([x(i), y(v)] as const)))
          .filter((p): p is readonly [number, number] => p !== null);
        return (
          <g key={s.label}>
            {pts.length > 1 ? (
              <polyline
                points={pts.map(([px, py]) => `${px},${py}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={2}
              />
            ) : null}
            {pts.map(([px, py]) => (
              <circle key={`${px}-${py}`} cx={px} cy={py} r={5.5} fill={color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** 5축 레이더 — Figma 실측: 바깥 반지름 123, 눈금 5겹, 첫 꼭짓점 위쪽. */
export function RadarChart({
  values,
  size = 246,
}: {
  /** 축별 0~100. 근거가 없으면 null — 그 축은 중심으로 접지 않고 도형에서 뺀다. */
  values: (number | null)[];
  size?: number;
}) {
  const r = size / 2;
  const c = r;
  const axes = values.length;
  const point = (i: number, radius: number) => {
    const a = (Math.PI * 2 * i) / axes - Math.PI / 2;
    return [c + radius * Math.cos(a), c + radius * Math.sin(a)] as const;
  };
  const ring = (radius: number) =>
    Array.from({ length: axes }, (_, i) => point(i, radius).join(',')).join(' ');
  // Figma 눈금 반지름: 123 / 97.5 / 73.5 / 47 / 23
  const rings = [123, 97.5, 73.5, 47, 23].map((v) => (v / 123) * r);
  const measured = values.every((v) => v != null);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="관찰 지표 5축"
      className="block"
    >
      {rings.map((rr) => (
        <polygon key={rr} points={ring(rr)} fill="none" stroke={webPalette.line.DEFAULT} strokeWidth={1} />
      ))}
      {Array.from({ length: axes }, (_, i) => {
        const [px, py] = point(i, r);
        return <line key={i} x1={c} y1={c} x2={px} y2={py} stroke={webPalette.line.DEFAULT} strokeWidth={1} />;
      })}
      {measured ? (
        <>
          <polygon
            points={values.map((v, i) => point(i, ((v as number) / 100) * r).join(',')).join(' ')}
            fill={`${webPalette.accent.DEFAULT}33`}
            stroke={webPalette.accent.DEFAULT}
            strokeWidth={2}
          />
          {values.map((v, i) => {
            const [px, py] = point(i, ((v as number) / 100) * r);
            return <circle key={i} cx={px} cy={py} r={2.5} fill={webPalette.accent.DEFAULT} />;
          })}
        </>
      ) : null}
    </svg>
  );
}
