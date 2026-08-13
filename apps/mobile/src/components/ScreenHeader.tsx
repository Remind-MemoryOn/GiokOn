// 상세 화면 헤더 (Figma 공통 — 어르신 등록 `56:337` / 연대기 수정 `15:7` 등)
//
// Figma 실측(프레임 폭 393):
//   헤더 박스 0..114 (폭 399, x -3 → 화면을 넘겨 그림자만 보이게 한 것) · 배경 흰색
//   그림자 1px 1px 10px rgba(108,101,101,0.13)
//   뒤로 화살표 12.7×19.5 @ (28, 74)  — 색 #7b7c7c
//   제목 Medium 18/30 검정, 가로 중앙, 텍스트 박스 top 70
//
// ⚠️ 상태바는 **실기기 상태바**를 쓴다(사용자 확정). 그래서 Figma 의 y 좌표를 그대로
// 쓰려면 안전영역 인셋만큼 빼야 한다: 헤더를 SafeAreaView(top) 아래에 두고
//   높이 = 114 - inset,  자식 top = (Figma y) - inset
// 로 두면 화면 절대 좌표가 Figma 와 정확히 일치한다(인셋이 큰 iOS·작은 Android 공통).
import type { ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import iconBack from '../../assets/brand/icon-back.png';

/** Figma 헤더 높이(상태바 포함). */
export const HEADER_H = 114;
/** Figma 헤더 그림자 — Android elevation 은 과대해서 쓰지 않는다. */
export const HEADER_SHADOW = '1px 1px 10px rgba(108,101,101,0.13)';

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  /** 우측 액션(있는 화면에서만). Figma 좌표는 화면별로 다르므로 호출부가 배치한다. */
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // 인셋이 비정상적으로 큰 기기에서도 자식이 잘리지 않도록 상한을 둔다.
  const shift = Math.min(insets.top, 60);

  return (
    <View
      className="bg-white"
      style={{ height: HEADER_H - shift, boxShadow: HEADER_SHADOW, zIndex: 10 }}
    >
      <Pressable
        onPress={onBack ?? (() => router.back())}
        accessibilityRole="button"
        accessibilityLabel="뒤로"
        hitSlop={20}
        className="absolute active:opacity-60"
        style={{ left: 28, top: 74 - shift }}
      >
        <Image source={iconBack} style={{ width: 12.7, height: 19.5 }} resizeMode="contain" />
      </Pressable>

      <Text
        className="absolute text-[18px] font-medium text-black text-center"
        style={{ left: 0, right: 0, top: 70 - shift, lineHeight: 30 }}
      >
        {title}
      </Text>

      {right}
    </View>
  );
}
