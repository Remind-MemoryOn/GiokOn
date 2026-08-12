// 스플래쉬 (Figma `130:162`) — 하단 그라데이션 + 카피 + GIEOK-ON 워드마크.
//
// Figma 스펙: 흰 배경 위 전체 화면 그라데이션(상단 흰색 → 하단 #f4c398),
//   카피 "AI 맞춤형 회상 대화 플랫폼" Pretendard Bold 16px #e9822b (top 42.84%, w 172),
//   워드마크 208×31.8 (left 92, top 395) = 에셋.
// 원본에는 버튼이 없다(기존 구현의 "간편 계정 연결" 버튼은 Figma 미존재) → 스플래쉬는
// 잠시 노출 후 자동으로 로그인으로 넘어간다. 탭해도 즉시 이동한다.
// 상태바는 실기기 상태바를 사용한다(사용자 확정 — Figma 상태바 목업 미구현).
import { useEffect } from 'react';
import { View, Text, Pressable, Image, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '../src/auth/AuthProvider';
import wordmark from '../assets/brand/wordmark.png';

const FRAME_H = 852; // Figma 프레임 높이 기준 비율 계산용

export default function Splash() {
  const { isConfigured, authed, loading } = useAuth();
  const { height } = useWindowDimensions();

  // 라이브에서 이미 로그인된(영속) 세션이면 메인으로, 아니면 로그인으로.
  useEffect(() => {
    if (loading) return;
    const target = isConfigured && authed ? '/main' : '/login';
    const t = setTimeout(() => router.replace(target), 1600);
    return () => clearTimeout(t);
  }, [isConfigured, authed, loading]);

  const go = () => router.replace(isConfigured && authed ? '/main' : '/login');

  return (
    <Pressable onPress={go} accessibilityRole="button" accessibilityLabel="시작하기" className="flex-1 bg-white">
      {/* 전체 화면 그라데이션(상단 흰색 → 하단 살구빛) */}
      <LinearGradient
        colors={['#ffffff', '#ffffff', '#f4c398']}
        locations={[0, 0.58, 1]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />

      {/* 카피 + 워드마크 — Figma 세로 위치(카피 top 42.84%) */}
      <View className="absolute left-0 right-0 items-center" style={{ top: (365 / FRAME_H) * height }}>
        <Text className="text-[16px] font-bold text-accent text-center">AI 맞춤형 회상 대화 플랫폼</Text>
        <Image
          source={wordmark}
          style={{ width: 208, height: 32, marginTop: 14 }}
          resizeMode="contain"
          accessibilityLabel="기억온"
        />
      </View>
    </Pressable>
  );
}
