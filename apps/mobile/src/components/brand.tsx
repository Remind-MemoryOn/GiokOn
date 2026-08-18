// 브랜드·대화 시각 요소 — **모두 Figma 에셋으로 렌더**한다.
//
// ⚠️ 원칙(사용자 지적 2026-08-12): 로고·아이콘·일러스트를 코드로 그리면(도형 조립·글자·
// 이모지 대체) 원본과 확연히 달라진다. 이전 구현은 로봇(안테나+점 눈)·파형·마이크를
// 코드로 그려 Figma 디자인과 완전히 달랐다. 지금은 @4x 스크린샷에서 크롭한 실제 에셋을
// 쓴다(assets/brand/*). 에셋 원본 비율을 유지해 왜곡을 막는다.
//
// 예외: ToneBar 는 아이콘이 아니라 **데이터에 따라 폭이 바뀌는 시각화**라 코드로 그린다.

import { Image, Pressable, Text, View } from 'react-native';
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
 * 마이크 상태 — 사용자 지적("TTS 끝나거나 응답할 때 마이크가 그대로다")을 반영해
 * 눌림 가능 여부를 시각적으로 구분한다. 형태는 Figma 에셋 그대로 두고 **투명도와
 * 얇은 링만** 더해 디자인을 해치지 않는다.
 *   speaking  : AI 발화 중 — 누를 수 없음(흐리게)
 *   ready     : 누를 수 있음 — 원본 그대로
 *   listening : 듣는 중 — 주황 링
 *   processing: 인식 처리 중 — 흐리게
 */
export type MicState = 'speaking' | 'ready' | 'listening' | 'processing';

export function MicButton({
  onPress,
  state = 'ready',
  size = 125,
}: {
  onPress: () => void;
  state?: MicState;
  size?: number;
}) {
  // 어르신은 기기를 만지지 않는 것이 기본이므로(사용자 확정) 상태는 **말할 차례인지**로
  // 나뉜다: AI 음성(TTS)이 나오는 동안은 회색, 끝나면 주황으로 바뀌어 말씀을 청한다.
  // 인식 결과를 정리하는 동안도 누를 수 없으므로 회색이다.
  const disabled = state === 'speaking' || state === 'processing';
  const label =
    state === 'speaking'
      ? '안내 음성 재생 중'
      : state === 'processing'
        ? '인식 중'
        : '말씀 입력';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{ borderRadius: 999 }}
    >
      <Image
        source={disabled ? micWait : micReady}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </Pressable>
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
