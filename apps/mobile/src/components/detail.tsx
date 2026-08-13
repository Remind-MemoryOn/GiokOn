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
//    주제 막대 트랙 241×12 r6 #fdf3ea + 채움 #e9822b(순위별 불투명도) ·
//    라벨/퍼센트 Regular 13/30 · AI 배지 37 + 제목 SemiBold 17 + 본문 Regular 13/25 w271
//
// ⚠️ 수치·문장은 전부 실데이터 바인딩이다(디자인의 82%·10분·92%·AI 문장은 자리표시자).
import { Image, Pressable, Text, View } from 'react-native';
import iconClock from '../../assets/brand/icon-clock.png';
import chevronGray from '../../assets/brand/btn-chevron-gray.png';
import avatarAi from '../../assets/brand/avatar-ai.png';

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
      <Text className="text-[12px] font-semibold text-black" style={{ lineHeight: 30, marginTop: 9.75 }}>
        {label}
      </Text>
      {/* 아이콘 높이가 종류마다 달라(24 / 25.25) 24 고정 칸 안에 중앙 배치 → 값 위치 불변 */}
      <View style={{ height: 24, marginTop: 3, justifyContent: 'center' }}>
        <Image source={icon} style={iconSize} resizeMode="contain" />
      </View>
      <Text className="text-[16px] font-semibold text-black" style={{ lineHeight: 30, marginTop: 7.75 }}>
        {value}
      </Text>
    </View>
  );
}

/** 순위별 채움 불투명도 — Figma 실측(1위 100% → 5위 35%). 값이 아니라 서식이다. */
const RANK_OPACITY = [1, 0.87, 0.73, 0.55, 0.35];

// ── 종합 분석: 관심 주제 막대 ─────────────────────────────────
export function TopicBar({
  label,
  percent,
  rank,
}: {
  label: string;
  percent: number;
  /** 0-based 순위(색 농도용). */
  rank: number;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <View className="flex-row items-center" style={{ height: 30, marginBottom: 2.25 }}>
      <Text className="text-[13px] font-normal text-black" style={{ lineHeight: 30, marginLeft: 3, width: 42 }}>
        {label}
      </Text>
      <View style={{ width: 241, height: 12, borderRadius: 6, backgroundColor: DETAIL.chipBg }}>
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
      <Text className="text-[13px] font-normal text-black" style={{ lineHeight: 30, marginLeft: 19 }}>
        {pct}%
      </Text>
    </View>
  );
}

// ── 종합 분석: AI 종합 의견 ───────────────────────────────────
export function AiOpinion({ paragraphs }: { paragraphs: string[] }) {
  return (
    <View>
      <Image
        source={avatarAi}
        style={{ position: 'absolute', left: -2, top: 0, width: 37, height: 37 }}
        resizeMode="contain"
      />
      <View style={{ marginLeft: 51 }}>
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
