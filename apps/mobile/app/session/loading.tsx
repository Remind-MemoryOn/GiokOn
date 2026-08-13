// 질문 로딩 (Figma `28:37`) — X닫기 + 원형 도트 스피너 + 안내 문구.
//
// Figma 실측(393×852):
//   X 닫기 17×17 @ (347.7, 76)
//   스피너 52×52 @ (166, 354)  ← **로봇이 아니다**(이전 구현이 임의로 로봇을 넣었다)
//     중앙(170.5)이 아니라 실측 x 166 을 쓴다(픽셀 대조로 확인).
//   문구 "곧 다음 질문을 들려드릴게요." Medium 23/40 #7b7c7c 중앙 @ top 425
//
// 스피너 에셋은 원형 도트라 회전만 입힌다(형태는 원본 그대로 — 새로 그리지 않는다).
// 다음 질문은 이미 생성돼 있으므로 잠시 후 대화 화면으로 돌아간다.
import { useEffect, useMemo } from 'react';
import { Animated, Easing, Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import iconClose from '../../assets/brand/icon-close.png';
import spinner from '../../assets/brand/loading-indicator.png';

const FRAME_H = 852;

export default function QuestionLoading() {
  const { height } = useWindowDimensions();
  const spin = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  useEffect(() => {
    const t = setTimeout(() => router.replace('/session/talk'), 1200);
    return () => clearTimeout(t);
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="absolute right-[28px]" style={{ top: (76 / FRAME_H) * height }}>
        <Pressable
          onPress={() => router.replace('/session/talk')}
          accessibilityRole="button"
          accessibilityLabel="닫기"
          hitSlop={16}
        >
          <Image source={iconClose} style={{ width: 17, height: 17 }} resizeMode="contain" />
        </Pressable>
      </View>

      <Animated.Image
        source={spinner}
        style={{
          position: 'absolute',
          left: 166,
          top: (354 / FRAME_H) * height,
          width: 52,
          height: 52,
          transform: [{ rotate }],
        }}
        resizeMode="contain"
      />

      <View className="absolute left-0 right-0 items-center" style={{ top: (425 / FRAME_H) * height }}>
        <Text
          className="text-[23px] font-medium text-muted text-center"
          style={{ lineHeight: 40, width: 289 }}
        >
          곧 다음 질문을 들려드릴게요.
        </Text>
      </View>
    </SafeAreaView>
  );
}
