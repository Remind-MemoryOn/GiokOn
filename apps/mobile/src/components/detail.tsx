// 어르신 상세 전용 컴포넌트 (Figma `56:214` 프로필 / `75:177` 세션 기록 / `130:388` 종합 분석).
//
// Figma 실측(프레임 393):
//  [프로필] 사진 124 원형 @(135,191) · 이름 SemiBold 22/30 중앙 @top331 ·
//    메타 Medium 18 #7b7c7c 중앙 @top362 (Figma 박스 h23 이지만 lineHeight 30 이
//      Figma 잉크 위치와 일치 — Figma 는 lineHeight<자동일 때 중앙정렬이 아니다)
//    정보카드 336×249 r10 흰색 border #e3e3e3 @(29,412)
//      라벨 SemiBold 15/30 @카드 left27 · 값 Regular 15/30 @left116 · 행 pitch 49
//      구분선 283×1 #d9d9d9 @left26 (행 아래 9)
//    주요 기억 (n) SemiBold 15/30 @(29,684) · 칩 h35 r10 #fdf3ea border #e9822b,
//      좌우 padding 21, 텍스트 Regular 15/30, gap 21/13
//    대화 시작하기 336×57 r10 #e9822b @top844 (프레임 하단 49)
//  [세션 기록] 카드 336×108 r10 흰색 + 그림자 1 1 8 rgba(106,106,106,.25) @top199 pitch 138
//    제목 SemiBold 19/30 @(60,+26) · 날짜 Regular 16 @(60,+58.5) ·
//    시계 15 @(166,+65) · 시간 Regular 16 @(187,+57.5) · 회색 원형 화살표 34 @(296,+37)
//  [종합 분석] 섹션 제목 SemiBold 17/30 · 타일 103×115 r5 #fefbf8 border #f8d7bb
//    (라벨 SemiBold 12 · 아이콘 24 · 값 SemiBold 16) · 구분선 336×1 #d9d9d9
//    주제 막대 트랙 242×12 r6 #fdf3ea + 채움 #e9822b(순위별 불투명도) ·
//    라벨/퍼센트 Regular 13/30 · AI 배지 37 + 제목 SemiBold 17 + 본문 Regular 13/25 w271
//  [공통] 기간 pill 99×25 r5 bg #fbfbfb border #d5d5d5 — 라벨 Regular 12 잉크 @+7 / left+16.5,
//    ∨ 8.4×5.45 @(우측 13.5, 위 10)  (전체분석·인지효과분석 3화면 공용)
//
// ⚠️ 수치·문장은 전부 실데이터 바인딩이다(디자인의 82%·10분·92%·AI 문장은 자리표시자).
import { Image, Pressable, Text, View } from 'react-native';
import iconClock from '../../assets/brand/icon-clock.png';
import chevronGray from '../../assets/brand/btn-chevron-gray.png';
import avatarAi from '../../assets/brand/avatar-ai.png';
import iconChevronDown from '../../assets/brand/icon-chevron-down.png';

export const DETAIL = {
  left: 29,
  width: 336,
  cardRadius: 10,
  cardBorder: '#e3e3e3',
  divider: '#d9d9d9',
  chipBg: '#fdf3ea',
  tileBg: '#fefbf8',
  tileBorder: '#f8d7bb',
  accent: '#e9822b',
} as const;

// ── 프로필: 정보 카드 ─────────────────────────────────────────
export function InfoCard({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <View
      style={{
        width: DETAIL.width,
        borderRadius: DETAIL.cardRadius,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: DETAIL.cardBorder,
        paddingTop: 10,
        paddingBottom: 13,
      }}
    >
      {rows.map((r, i) => (
        <View key={r.label}>
          <View className="flex-row" style={{ height: 30 }}>
            <Text
              className="text-[15px] font-semibold text-black"
              style={{ lineHeight: 30, marginLeft: 27, width: 89 }}
            >
              {r.label}
            </Text>
            <Text className="flex-1 text-[15px] font-normal text-black" style={{ lineHeight: 30 }}>
              {r.value}
            </Text>
          </View>
          {i < rows.length - 1 ? (
            <View
              style={{
                width: 283,
                height: 1,
                backgroundColor: DETAIL.divider,
                marginLeft: 26,
                marginTop: 9,
                marginBottom: 9,
              }}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ── 프로필: 주요 기억 칩 ──────────────────────────────────────
export function MemoryChip({ text }: { text: string }) {
  return (
    <View
      style={{
        height: 35,
        borderRadius: 10,
        backgroundColor: DETAIL.chipBg,
        borderWidth: 1,
        borderColor: DETAIL.accent,
        paddingHorizontal: 21,
        justifyContent: 'center',
      }}
    >
      <Text className="text-[15px] font-normal text-black" style={{ lineHeight: 30 }}>
        {text}
      </Text>
    </View>
  );
}

// ── 세션 기록: 카드 ───────────────────────────────────────────
export function SessionCard({
  title,
  dateLabel,
  durationLabel,
  onPress,
}: {
  title: string;
  dateLabel: string;
  /** 이미 포맷된 대화 시간(미측정이면 '—'). */
  durationLabel: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} 기록 보기`}
      className="active:opacity-90"
      style={{
        width: DETAIL.width,
        height: 108,
        borderRadius: DETAIL.cardRadius,
        backgroundColor: '#ffffff',
        // Figma: 1px 1px 8px rgba(106,106,106,0.25) — 픽셀 대조로 확인(Android elevation 미사용).
        boxShadow: '1px 1px 8px rgba(106,106,106,0.25)',
      }}
    >
      <Text
        className="absolute text-[19px] font-semibold text-black"
        style={{ left: 31, top: 26, lineHeight: 30, right: 100 }}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text
        className="absolute text-[16px] font-normal text-muted"
        style={{ left: 31, top: 58.5, lineHeight: 30 }}
      >
        {dateLabel}
      </Text>
      <Image
        source={iconClock}
        style={{ position: 'absolute', left: 137, top: 65, width: 15, height: 15 }}
        resizeMode="contain"
      />
      <Text
        className="absolute text-[16px] font-normal text-muted"
        style={{ left: 158, top: 57.5, lineHeight: 30 }}
      >
        {durationLabel}
      </Text>
      <Image
        source={chevronGray}
        style={{ position: 'absolute', left: 267, top: 37, width: 34, height: 34 }}
        resizeMode="contain"
      />
    </Pressable>
  );
}

// ── 종합 분석: 섹션 제목 ──────────────────────────────────────
export function SectionHeading({ children }: { children: string }) {
  return (
    <Text className="text-[17px] font-semibold text-black" style={{ lineHeight: 30 }}>
      {children}
    </Text>
  );
}

export function Divider() {
  return <View style={{ width: DETAIL.width, height: 1, backgroundColor: DETAIL.divider }} />;
}

// ── 공통: 기간/주제 선택 pill ─────────────────────────────────
/**
 * 집계 기간·주제 표시 pill(선택 UI 는 후속 — 현재는 고정 표시).
 * Figma 는 99폭(기간)과 73폭(주제)에서 라벨 들여쓰기가 다르다(15 / 17) → 인자로 둔다.
 */
export function PeriodPill({
  label,
  width = 99,
  labelInset = 15,
}: {
  label: string;
  width?: number;
  labelInset?: number;
}) {
  return (
    <View
      className="flex-row items-center"
      style={{
        width,
        height: 25,
        borderRadius: 5,
        backgroundColor: '#fbfbfb',
        borderWidth: 1,
        borderColor: '#d5d5d5',
        paddingLeft: labelInset,
      }}
    >
      <Text className="text-[12px] font-normal text-muted" style={{ lineHeight: 25 }}>
        {label}
      </Text>
      <Image
        source={iconChevronDown}
        style={{ position: 'absolute', right: 13.5, top: 10, width: 8.4, height: 5.45 }}
        resizeMode="contain"
      />
    </View>
  );
}

// ── 종합 분석: 참여도 타일 ────────────────────────────────────
export function StatTile({
  icon,
  iconSize,
  label,
  value,
}: {
  icon: number;
  iconSize: { width: number; height: number };
  label: string;
  /** 이미 포맷된 값(미측정이면 '—'). */
  value: string;
}) {
  return (
    <View
      style={{
        width: 103,
        height: 115,
        borderRadius: 5,
        backgroundColor: DETAIL.tileBg,
        borderWidth: 1,
        borderColor: DETAIL.tileBorder,
        alignItems: 'center',
      }}
    >
      {/*
       * 세로 위치는 @4x 픽셀 대조로 확정. Figma 는 같은 타일을 화면마다 2px 다르게 배치했다
       * (라벨 잉크 rel 17.25=단일분석 / 19.25=종합분석, 값 rel 80.25 / 82.50).
       * 아이콘만 두 화면이 rel 43 로 일치하므로 아이콘을 기준으로 잡고 라벨·값은 중간값을 쓴다
       * → 두 화면 모두 편차 ≤1.15px.
       */}
      <Text className="text-[12px] font-semibold text-black" style={{ lineHeight: 30, marginTop: 7.5 }}>
        {label}
      </Text>
      {/* 아이콘 높이가 종류마다 달라(24 / 25.25) 24 고정 칸 안에 중앙 배치 → 값 위치 불변 */}
      <View style={{ height: 24, marginTop: 4.5, justifyContent: 'center' }}>
        <Image source={icon} style={iconSize} resizeMode="contain" />
      </View>
      <Text className="text-[16px] font-semibold text-black" style={{ lineHeight: 30, marginTop: 6.4 }}>
        {value}
      </Text>
    </View>
  );
}

/** 순위별 채움 불투명도 — Figma 실측(1위 100% → 5위 35%). 값이 아니라 서식이다. */
const RANK_OPACITY = [1, 0.87, 0.73, 0.55, 0.35];

// ── 종합 분석: 관심 주제 막대 ─────────────────────────────────
/** 트랙 폭 — 두 화면 모두 242 로 실측(@4x 픽셀 대조). */
const TRACK_W = 242;

/**
 * 주제 막대 배치값 — Figma 실측 기준값에 **실제 라벨 길이**를 반영해 돌려준다.
 *
 * Figma 자리표시자는 "가족"·"고향" 처럼 2글자뿐이라 라벨 칸이 41/45 로 좁다. 실데이터에는
 * "주요 기억"·"학창 시절" 같은 4~5글자 주제가 들어와 글자가 잘렸다(사용자 지적
 * 2026-08-13 "'주요 기'로 잘려 보임"). RN 은 동기 텍스트 측정이 없으므로 글자폭을 어림해
 * **필요한 만큼만** 칸을 넓히고 트랙을 같은 만큼 줄인다 → 퍼센트 x(행 오른쪽 끝)는 고정,
 * 모든 행의 트랙 시작·길이도 서로 같게 유지된다.
 */
export function topicBarLayout(
  labels: string[],
  base: { labelInset: number; labelWidth: number; percentGap: number },
): { labelInset: number; labelWidth: number; trackWidth: number; percentGap: number } {
  const ink = (s: string) =>
    [...s].reduce((n, ch) => n + (ch === ' ' ? 3.7 : /[\x20-\x7e]/.test(ch) ? 7.3 : 13), 0);
  const needed = labels.length ? Math.max(...labels.map((l) => Math.ceil(ink(l)) + 1)) : 0;
  const labelWidth = Math.max(base.labelWidth, needed);
  return {
    labelInset: base.labelInset,
    labelWidth,
    trackWidth: TRACK_W - (labelWidth - base.labelWidth),
    percentGap: base.percentGap,
  };
}

export function TopicBar({
  label,
  percent,
  rank,
  labelInset = 3,
  labelWidth = 41,
  trackWidth = TRACK_W,
  percentGap = 19,
}: {
  label: string;
  percent: number;
  /** 0-based 순위(색 농도용). */
  rank: number;
  /**
   * 라벨 좌측 여백·폭 — 트랙 시작 x 를 Figma 에 맞춘다.
   * 어르신 종합분석은 라벨 박스 32 / 트랙 73, 전체분석은 라벨 30 / 트랙 75 다.
   * 실제 라벨이 길면 `topicBarLayout()` 이 계산한 값을 넘긴다.
   */
  labelInset?: number;
  labelWidth?: number;
  trackWidth?: number;
  /** 트랙 → 퍼센트 간격 (종합분석 19 / 전체분석 20). */
  percentGap?: number;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <View className="flex-row items-center" style={{ height: 30, marginBottom: 2.25 }}>
      <Text
        className="text-[13px] font-normal text-black"
        numberOfLines={1}
        style={{ lineHeight: 30, marginLeft: labelInset, width: labelWidth }}
      >
        {label}
      </Text>
      <View
        style={{ width: trackWidth, height: 12, borderRadius: 6, backgroundColor: DETAIL.chipBg }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: 12,
            borderRadius: 6,
            backgroundColor: DETAIL.accent,
            opacity: RANK_OPACITY[Math.min(rank, RANK_OPACITY.length - 1)],
          }}
        />
      </View>
      <Text
        className="text-[13px] font-normal text-black"
        style={{ lineHeight: 30, marginLeft: percentGap }}
      >
        {pct}%
      </Text>
    </View>
  );
}

// ── 종합 분석: AI 종합 의견 ───────────────────────────────────
export function AiOpinion({ paragraphs }: { paragraphs: string[] }) {
  return (
    <View>
      {/* Figma 는 이 블록을 화면마다 2px 다르게 뒀다(아바타 27=종합분석 / 29=전체 인지효과분석,
          본문 열 80.25 / 82.25) → 중간값으로 두어 두 화면 편차 ≤1px. */}
      <Image
        source={avatarAi}
        style={{ position: 'absolute', left: -1, top: 0, width: 37, height: 37 }}
        resizeMode="contain"
      />
      <View style={{ marginLeft: 51.75 }}>
        <Text className="text-[17px] font-semibold text-black" style={{ lineHeight: 30, marginTop: 2 }}>
          AI 종합 의견
        </Text>
        {paragraphs.map((p, i) => (
          <Text
            key={p}
            className="text-[13px] font-normal text-black"
            style={{ lineHeight: 25, width: 271, marginTop: i === 0 ? 9 : 11 }}
          >
            {p}
          </Text>
        ))}
      </View>
    </View>
  );
}
