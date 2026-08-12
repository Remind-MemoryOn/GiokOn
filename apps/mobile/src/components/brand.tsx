// 브랜드·대화 시각 요소.
//
// ⚠️ 원칙: 로고·아이콘·일러스트는 **Figma 에서 내보낸 에셋**으로 렌더한다. 코드로 직접
// 그리면(도형 조립·글자 대체) 원본과 확연히 달라진다. 아래 남아 있는 코드 드로잉
// (RobotMascot·Waveform·MicButton·ToneBar)은 대화 화면 재적용 시 에셋으로 교체 예정.
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import wordmarkAsset from '../../assets/brand/wordmark.png';

// ── 워드마크 GIEOK-ON (Figma 에셋) ─────────────────────────────
// 원본 비율 208×31.8 ≈ 6.54:1 — height 를 기준으로 폭을 맞춘다.
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

// ── AI 로봇 마스코트(대화 상대 표식) ──────────────────────────
export function RobotMascot({ size = 92 }: { size?: number }) {
  const eyeW = Math.round(size * 0.11);
  const eyeH = Math.round(size * 0.22);
  return (
    <View style={{ width: size, height: size * 0.86, alignItems: 'center', justifyContent: 'center' }}>
      {/* 안테나 */}
      <View style={{ position: 'absolute', top: -size * 0.16, alignItems: 'center' }}>
        <View style={{ width: size * 0.07, height: size * 0.07, borderRadius: 999, backgroundColor: C.accent }} />
        <View style={{ width: 2, height: size * 0.1, backgroundColor: C.accent }} />
      </View>
      {/* 머리 */}
      <View
        style={{
          width: size,
          height: size * 0.86,
          borderRadius: size * 0.28,
          backgroundColor: C.accent,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: size * 0.14,
        }}
      >
        <View style={{ width: eyeW, height: eyeH, borderRadius: 999, backgroundColor: '#fff' }} />
        <View style={{ width: eyeW, height: eyeH, borderRadius: 999, backgroundColor: '#fff' }} />
      </View>
    </View>
  );
}

// ── 오디오 파형(듣는 중 표시) ─────────────────────────────────
const BAR_HEIGHTS = [14, 26, 40, 30, 52, 36, 22, 44, 58, 34, 20, 46, 30, 54, 38, 24, 42, 28, 50, 32, 18, 36, 26, 16];

export function Waveform({ active = true }: { active?: boolean }) {
  const [anim] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    if (!active) {
      anim.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 620, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, anim]);

  return (
    <View className="flex-row items-center justify-center gap-1 h-16">
      {BAR_HEIGHTS.map((h, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 2,
            backgroundColor: C.accent,
            opacity: active ? (i % 2 === 0 ? anim : 0.6) : 0.5,
            transform: [{ scaleY: active && i % 3 === 0 ? anim : 1 }],
          }}
        />
      ))}
    </View>
  );
}

// ── 대형 마이크 버튼(어르신 접근성: 큰 터치 타깃) ───────────────
export function MicButton({ onPress, listening = false }: { onPress: () => void; listening?: boolean }) {
  const [ring] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!listening) return;
    const loop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, ring]);

  return (
    <View className="items-center justify-center" style={{ width: 200, height: 200 }}>
      {listening ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 160,
            height: 160,
            borderRadius: 999,
            backgroundColor: C.accent,
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
          }}
        />
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="말하기"
        className="items-center justify-center active:opacity-90"
        style={{
          width: 160,
          height: 160,
          borderRadius: 999,
          backgroundColor: C.accent,
          shadowColor: '#dc5032',
          shadowOpacity: 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }}
      >
        <Ionicons name="mic" size={72} color="#fff" />
      </Pressable>
    </View>
  );
}

// ── 감정/관찰 톤 막대(긍정·보통·낮음) ─────────────────────────
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
