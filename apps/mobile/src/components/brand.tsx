// 브랜드·대화 시각 요소 — **모두 Figma 에셋으로 렌더**한다.
//
// ⚠️ 원칙(사용자 지적 2026-08-12): 로고·아이콘·일러스트를 코드로 그리면(도형 조립·글자·
// 이모지 대체) 원본과 확연히 달라진다. 이전 구현은 로봇(안테나+점 눈)·파형·마이크를
// 코드로 그려 Figma 디자인과 완전히 달랐다. 지금은 @4x 스크린샷에서 크롭한 실제 에셋을
// 쓴다(assets/brand/*). 에셋 원본 비율을 유지해 왜곡을 막는다.
//
// 예외: ToneBar 는 아이콘이 아니라 **데이터에 따라 폭이 바뀌는 시각화**라 코드로 그린다.

import { Image, Text, View } from 'react-native';
import wordmarkAsset from '../../assets/brand/wordmark.png';
import robotAsset from '../../assets/brand/robot-mascot.png';
import robotInlineAsset from '../../assets/brand/robot-inline.png';
import waveformAsset from '../../assets/brand/waveform.png';
import micWait from '../../assets/brand/btn-mic-wait.png';
import micReady from '../../assets/brand/btn-mic-ready.png';

// ── 워드마크 GIEOK-ON ─────────────────────────────────────────
// 원본 208×31.8 → 6.54:1. height 기준으로 폭을 맞춘다.
const WORDMARK_RATIO = 208 / 31.8;

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <Image
      source={wordmarkAsset}
      style={{ height: size, width: size * WORDMARK_RATIO }}
      resizeMode="contain"
      accessibilityLabel="기억온"
    />
  );
}

// ── AI 로봇 마스코트 ──────────────────────────────────────────
// Figma 원본 197×126(1.563:1) — 주황 채움 얼굴 + 양쪽 귀 + 아치 눈 + 말풍선 꼬리.
const ROBOT_RATIO = 197 / 126;

export function RobotMascot({ size = 197 }: { size?: number }) {
  return (
    <Image
      source={robotAsset}
      style={{ width: size, height: size / ROBOT_RATIO }}
      resizeMode="contain"
      accessibilityLabel="AI 도우미"
    />
  );
}

/** 질문 카드 안에 들어가는 소형 로봇(원본 48×22). */
// Figma 대화 카드 안 로봇 실측 46.5×29.5(에셋 재크롭 — 이전 48×22 는 안테나·꼬리가 잘려 있었다).
const ROBOT_INLINE_RATIO = 46.5 / 29.5;

export function RobotInline({ size = 46.5 }: { size?: number }) {
  return (
    <Image
      source={robotInlineAsset}
      style={{ width: size, height: size / ROBOT_INLINE_RATIO }}
      resizeMode="contain"
    />
  );
}

// ── 오디오 파형 ───────────────────────────────────────────────
// Figma 원본 228×77(2.96:1) 주황 파형. 정적 에셋을 쓰고, 비활성 시 흐리게만 처리한다
// (코드 애니메이션으로 형태를 바꾸면 원본과 달라진다).
const WAVEFORM_RATIO = 228 / 77;

export function Waveform({ active = true, width = 228 }: { active?: boolean; width?: number }) {
  return (
    <Image
      source={waveformAsset}
      style={{ width, height: width / WAVEFORM_RATIO, opacity: active ? 1 : 0.35 }}
      resizeMode="contain"
    />
  );
}

// ── 마이크 버튼 ───────────────────────────────────────────────
// Figma 원본 125×114 **회색** 원형 버튼(주황이 아니다).

/**
 * 마이크 상태 **표시**(누를 수 없음) — 어르신 표시 모드용(계획 M2).
 * 중계 자동 대화에서는 어르신이 기기를 조작하지 않는다. Figma 마이크 2상태 에셋을 그대로 쓰되
 * 버튼이 아니라 그림으로 둔다(누를 수 있는 것처럼 읽히지 않게 스크린리더에서도 숨긴다 —
 * 상태는 옆 라벨이 말한다). 주황 = 말씀하실 차례, 회색 = 그 외.
 */
export function MicIndicator({ yourTurn, size = 123 }: { yourTurn: boolean; size?: number }) {
  return (
    <Image
      source={yourTurn ? micReady : micWait}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessible={false}
    />
  );
}

// ── 관찰 반응 분포 바(데이터 시각화 — 값에 따라 폭이 바뀌므로 코드로 그린다) ──
export function ToneBar({
  segments,
}: {
  segments: { label: string; percent: number; color: string }[];
}) {
  return (
    <View>
      <View className="flex-row h-4 rounded-full overflow-hidden">
        {segments.map((s, i) => (
          <View key={i} style={{ width: `${s.percent}%`, backgroundColor: s.color }} />
        ))}
      </View>
      <View className="flex-row flex-wrap mt-2 gap-x-4 gap-y-1">
        {segments.map((s, i) => (
          <View key={i} className="flex-row items-center">
            <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: s.color }} />
            <Text className="text-[13px] text-muted ml-1.5 font-normal">
              {s.label} {s.percent}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
