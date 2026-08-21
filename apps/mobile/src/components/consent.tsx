// 동의 확인 프리미티브 (Figma `동의 확인1` 주체 선택 / `동의 확인2` 필수 동의)
//
// Figma 실측(@4x 내보내기 픽셀 대조, 프레임 393×852):
//   공통  제목 SemiBold 19/30 @(29,144) · 부제 Regular 14/25 @(29,208)
//   주체  섹션 라벨 SemiBold 15 잉크 top 293
//         카드 335×181 r10 border #d9d9d9 @(29,323) — 3행 pitch 60, 구분선은 카드 폭 전체
//         체크박스 17 @(50, 행+22) · 라벨 SemiBold 13 검정 잉크 @(79.5, 행+25.5)
//   대리  라벨 SemiBold 13 + 필수 ✱ 8×8.25 · 필드 156/162 (gap 18) h41 r10 border #d9d9d9
//         안내문구 Regular 12 #7b7c7c @ 좌 18 · ∨ 14.14×9.54 @ 우 21.9
//         관계 목록 162 wide · 5행 × 37 · 텍스트 Medium 12 #7b7c7c @ 좌 21
//   고지  카드 335×97 r10 bg #fef8f4 border #e9822b — 제목 SemiBold 13/16 @(+33,+21)
//         본문 Regular 12/16 @(+32,+43)
//   동의  카드 335×97 r10 흰색 border #d9d9d9 @(29, 273/389/505, pitch 116)
//
// 체크박스는 두 종류다(사용자 확정): **주체 선택은 주황**(Vector3), **필수 동의는 검정**
// (Vector2). 미선택은 둘 다 회색 외곽선이라 같은 에셋을 쓴다.
import type { ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { GUARDIAN_RISK_NOTICE } from '@giokon/core';
import checkboxOff from '../../assets/brand/checkbox-off.png';
import checkboxOn from '../../assets/brand/checkbox-on.png';
import checkboxOnAccent from '../../assets/brand/checkbox-on-accent.png';
import iconRequired from '../../assets/brand/icon-required.png';
import iconChevronDown from '../../assets/brand/icon-chevron-down.png';

/** Figma 동의 화면 상수 — scripts/check-figma-spec.mjs 가 이 값을 검사한다. */
export const CONSENT_UI = {
  left: 29,
  cardW: 335,
  cardR: 10,
  border: '#d9d9d9',
  box: 17,
  /** 주체 카드 행 높이(3행 pitch). */
  subjectRowH: 60,
  /** 대리 동의자 입력 필드. */
  fieldH: 41,
  nameW: 156,
  relationW: 162,
  fieldGap: 18,
  labelGap: 6,
  muted: '#7b7c7c',
  /** 법적 한계 안내 카드. */
  noticeBg: '#fef8f4',
  accent: '#e9822b',
} as const;

/** 체크박스 17×17 — 필수 동의는 검정, 주체 선택은 주황(Figma 에셋 2종). */
export function CheckBox({
  checked,
  variant = 'dark',
}: {
  checked: boolean;
  variant?: 'dark' | 'accent';
}) {
  return (
    <Image
      source={checked ? (variant === 'accent' ? checkboxOnAccent : checkboxOn) : checkboxOff}
      style={{ width: CONSENT_UI.box, height: CONSENT_UI.box }}
      resizeMode="contain"
    />
  );
}

/** 필수 표시 ✱ — 폼과 같은 에셋·치수. */
function RequiredMark() {
  return (
    <Image
      source={iconRequired}
      style={{ width: 8, height: 8.25, marginLeft: 2, marginTop: 5 }}
      resizeMode="contain"
      accessibilityLabel="필수"
    />
  );
}

/** 입력 라벨 SemiBold 13 (+ 필수 ✱). */
export function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <View className="flex-row items-start">
      <Text className="text-[13px] font-semibold text-black" style={{ lineHeight: 17 }}>
        {label}
      </Text>
      {required ? <RequiredMark /> : null}
    </View>
  );
}

/** 흰 바탕 입력 박스(성함·관계 공용). */
export function FieldBox({
  width,
  children,
  onPress,
}: {
  width: number;
  children: ReactNode;
  onPress?: () => void;
}) {
  const style = {
    width,
    height: CONSENT_UI.fieldH,
    borderRadius: CONSENT_UI.cardR,
    borderWidth: 1,
    borderColor: CONSENT_UI.border,
    backgroundColor: '#ffffff',
    marginTop: CONSENT_UI.labelGap,
  } as const;
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-80" style={style}>
      {children}
    </Pressable>
  ) : (
    <View style={style}>{children}</View>
  );
}

/** 필드 안 안내문구(Regular 12) — 값이 비었을 때만. */
export function FieldPlaceholder({ text }: { text: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 17, top: 13 }}>
      <Text className="text-[12px] font-normal" style={{ lineHeight: 16, color: CONSENT_UI.muted }}>
        {text}
      </Text>
    </View>
  );
}

/** 필드 우측 ∨ — 폼과 같은 에셋·치수. */
export function FieldChevron() {
  return (
    <Image
      source={iconChevronDown}
      style={{ position: 'absolute', right: 20.9, top: 15.7, width: 14.14, height: 9.54 }}
      resizeMode="contain"
    />
  );
}

/**
 * 법적 한계 안내 카드(Figma `Frame 12`) — 보호자(성년후견 미개시) 선택 시에만 보인다.
 * 문구는 `@giokon/core` 가 단일 기준이다(같은 문구가 `consents.basis` 로도 기록된다).
 */
export function GuardianRiskNotice() {
  return (
    <View
      style={{
        width: CONSENT_UI.cardW,
        height: 97,
        borderRadius: CONSENT_UI.cardR,
        backgroundColor: CONSENT_UI.noticeBg,
        borderWidth: 1,
        borderColor: CONSENT_UI.accent,
      }}
    >
      <Text
        className="absolute text-[13px] font-semibold text-black"
        style={{ left: 32, top: 20, lineHeight: 16 }}
      >
        {GUARDIAN_RISK_NOTICE.title}
      </Text>
      <Text
        className="absolute text-[12px] font-normal text-black"
        style={{ left: 31, top: 42, width: 252, lineHeight: 16 }}
      >
        {GUARDIAN_RISK_NOTICE.body}
      </Text>
    </View>
  );
}
