// 상세 화면 헤더 (Figma 공통 — 어르신 등록 `56:337` / 연대기 수정 `15:7` 등)
//
// Figma 실측(프레임 폭 393):
//   헤더 박스 0..114 (폭 399, x -3 → 화면을 넘겨 그림자만 보이게 한 것) · 배경 흰색
//   그림자 1px 1px 10px rgba(108,101,101,0.13)
//   뒤로 화살표 12.7×19.5 @ (29, 74)  — 색 #7b7c7c
//     (Figma 는 화면마다 28/29 가 섞여 있다 — 입력·카드 좌측 여백과 같은 29 로 통일)
//   제목 Medium 18/30 검정, 가로 중앙, 텍스트 박스 top 70
//
// ⚠️ 상태바는 **실기기 상태바**를 쓴다(사용자 확정). 그래서 Figma 의 y 좌표를 그대로
// 쓰려면 안전영역 인셋만큼 빼야 한다: 헤더를 SafeAreaView(top) 아래에 두고
//   높이 = 114 - inset,  자식 top = (Figma y) - inset
// 로 두면 화면 절대 좌표가 Figma 와 정확히 일치한다(인셋이 큰 iOS·작은 Android 공통).
import type { ReactNode } from 'react';
import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import iconBack from '../../assets/brand/icon-back.png';

/** Figma 헤더 높이(상태바 포함). 탭이 있으면 155. */
export const HEADER_H = 114;
export const HEADER_TABS_H = 155;
/** Figma 헤더 그림자 — Android elevation 은 과대해서 쓰지 않는다. */
export const HEADER_SHADOW = '1px 1px 10px rgba(108,101,101,0.13)';
/**
 * 헤더 아이콘 버튼의 터치 여유(패딩). 아이콘 자체는 12.7×19.5 로 작아서 그대로 두면
 * 누르기 어렵다. hitSlop 이 아니라 padding 으로 키워 **터치 영역 = 실제 뷰**가 되게 한다
 * (겹친 형제 뷰·부모 경계에 영향받지 않는다). 좌표는 padding 만큼 되빼서 보정한다.
 */
const TAP_PAD = 16;
/** 탭 라벨의 터치 여유(라벨 간격이 100px 이상이라 서로 겹치지 않는다). */
const TAB_PAD_X = 18;
const TAB_PAD_Y = 16;

/**
 * 아이콘이 `iconTop` 에 오도록 위/아래 여유를 준 터치 박스.
 * 안드로이드는 부모 밖으로 나간 부분의 터치를 버리므로, 헤더 위쪽으로는 넘지 않게 줄인다
 * (인셋이 큰 기기에서 iconTop 이 TAP_PAD 보다 작아질 수 있다).
 */
function tapBox(iconTop: number) {
  const padTop = Math.max(0, Math.min(TAP_PAD, iconTop));
  return {
    top: iconTop - padTop,
    paddingTop: padTop,
    paddingBottom: TAP_PAD,
    paddingHorizontal: TAP_PAD,
  } as const;
}

/**
 * 어르신 상세 탭 — Figma 실측 좌표(라벨 left / 활성 밑줄 left, 밑줄은 87×3).
 * 라벨 간격이 균일하지 않아(112/121) 계산이 아니라 실측값을 그대로 쓴다.
 */
export interface HeaderTab {
  key: string;
  label: string;
  /** 라벨 좌측 x (Figma). */
  x: number;
  /** 활성 밑줄 좌측 x (Figma). */
  indicatorX: number;
}

export const DETAIL_TABS: HeaderTab[] = [
  { key: 'profile', label: '프로필', x: 66, indicatorX: 40 },
  { key: 'sessions', label: '세션 기록', x: 169, indicatorX: 151 },
  { key: 'analysis', label: '종합 분석', x: 290, indicatorX: 273 },
];

export function ScreenHeader({
  title,
  onBack,
  right,
  rightIcon,
  rightIconSize,
  rightIconTop = 75,
  rightLabel,
  onRight,
  tabs,
  activeTab,
  onTab,
}: {
  title: string;
  onBack?: () => void;
  /** 임의 우측 콘텐츠(좌표를 직접 잡아야 하는 예외 화면용). */
  right?: ReactNode;
  /** 우측 아이콘 액션 — Figma 는 (347, 74~75) 고정이라 인셋 보정을 헤더가 처리한다. */
  rightIcon?: ImageSourcePropType;
  rightIconSize?: { width: number; height: number };
  rightIconTop?: number;
  rightLabel?: string;
  onRight?: () => void;
  /** 탭 바(어르신 상세). 있으면 헤더 높이가 155 가 된다. */
  tabs?: HeaderTab[];
  activeTab?: string;
  onTab?: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();
  // 인셋이 비정상적으로 큰 기기에서도 자식이 잘리지 않도록 상한을 둔다.
  const shift = Math.min(insets.top, 60);
  const height = (tabs ? HEADER_TABS_H : HEADER_H) - shift;

  return (
    <View className="bg-white" style={{ height, boxShadow: HEADER_SHADOW, zIndex: 10 }}>
      {/*
       * ⚠️ 제목은 left:0/right:0 로 헤더 전체 폭을 덮는다 → 뒤로·우측 버튼 위에 겹친다.
       * 안드로이드는 터치를 **나중에 선언된(위에 그려진) 뷰**에 먼저 준다. 그래서
       *   (1) 제목을 버튼보다 **먼저** 선언하고,
       *   (2) 제목을 pointerEvents="none" **View 로 감싼다**
       * 두 가지를 같이 건다. Text 에 직접 준 pointerEvents 는 안드로이드에서 무시되는 경우가
       * 있어(사용자 재현: 아이콘보다 위를 눌러야 동작 — 제목 줄 바깥만 눌렸던 것) View 로 감싼다.
       */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: 70 - shift, pointerEvents: 'none' }}
      >
        <Text className="text-[18px] font-medium text-black text-center" style={{ lineHeight: 30 }}>
          {title}
        </Text>
      </View>

      {/*
       * 뒤로 — 아이콘 12.7×19.5 를 Figma (29,74) 에 두고, 터치 박스는 그 주위 TAP_PAD 만큼
       * 넓힌다. hitSlop 대신 실제 padding 을 쓰는 이유: hitSlop 은 부모 경계에서 잘릴 수 있고
       * 겹친 형제 뷰보다 우선하지도 않는다. padding 이면 터치 영역이 곧 뷰라 확실하다.
       */}
      <Pressable
        onPress={onBack ?? (() => router.back())}
        accessibilityRole="button"
        accessibilityLabel="뒤로"
        className="absolute active:opacity-60"
        style={{ left: 29 - TAP_PAD, ...tapBox(74 - shift) }}
      >
        <Image source={iconBack} style={{ width: 12.7, height: 19.5 }} resizeMode="contain" />
      </Pressable>

      {/* 우측 아이콘 액션 — Figma (347, 74~75) */}
      {rightIcon ? (
        <Pressable
          onPress={onRight}
          accessibilityRole="button"
          accessibilityLabel={rightLabel}
          className="absolute active:opacity-60"
          style={{ left: 347 - TAP_PAD, ...tapBox(rightIconTop - shift) }}
        >
          <Image source={rightIcon} style={rightIconSize ?? { width: 18, height: 18 }} resizeMode="contain" />
        </Pressable>
      ) : null}

      {/* 탭 — 라벨 Figma x 에 좌측 정렬(활성 SemiBold 주황 / 비활성 Regular 회색) */}
      {tabs?.map((t) => {
        const active = t.key === activeTab;
        return (
          <View key={t.key}>
            <Pressable
              onPress={() => onTab?.(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className="absolute active:opacity-60"
              // Figma 텍스트 박스 top 125 · lineHeight 18 기준 잉크 위치를 맞춘 값에
              // 터치 여유(padding)를 더하고 좌표에서 되뺀다(뒤로 버튼과 같은 규칙).
              style={{
                left: t.x - TAB_PAD_X,
                top: 123.75 - shift - TAB_PAD_Y,
                paddingHorizontal: TAB_PAD_X,
                paddingVertical: TAB_PAD_Y,
              }}
            >
              <Text
                className={`text-[14px] ${active ? 'font-semibold text-accent' : 'font-normal text-muted'}`}
                style={{ lineHeight: 18 }}
              >
                {t.label}
              </Text>
            </Pressable>
            {active ? (
              <View
                className="absolute"
                style={{
                  left: t.indicatorX,
                  top: 152 - shift,
                  width: 87,
                  height: 3,
                  backgroundColor: '#e9822b',
                }}
              />
            ) : null}
          </View>
        );
      })}

      {right}
    </View>
  );
}
