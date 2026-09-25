// 설정 화면 프리미티브 (Figma `584:470` 환경설정 / `584:559` 환경설정_담당 어르신 관리)
//
// Figma 실측(@4x 내보내기 픽셀 대조, 프레임 393):
//   섹션 라벨      SemiBold 14 / lh17(정보·담당) · lh18(프로필) 검정 @ x34(프로필·담당) / x29(정보)
//   흰 카드        336 r10 배경 흰색 border #e3e3e3 @ x29 (그림자 없음)
//   구분선         283×1 #d9d9d9 @ x55
//   어르신 카드     336×113 r10 배경 #fdf6f0 그림자 1 1 8 rgba(106,106,106,0.25) @ x29
//     사진 73 원형 @(+27,+20) · 이름 SemiBold 18/30 검정 @(+124,+16)
//     생년 Medium 14/25 #7b7c7c @(+124,+46) · 성별 l 기관 Medium 14/25 #7b7c7c @(+124,+71)
//     휴지통 21 잉크(노드 19) #7b7c7c @(+269,+46)
//   행 chevron     8.75×13.25 #404040 · "전체보기" chevron 6×7 #404040
//
// 휴지통·로그아웃 글리프는 사용자가 내보낸 Figma 에셋을 쓴다
// (`assets/figma/Group2.png` → icon-trash 21 · `Group 160.png` 좌측 13열 → icon-logout 13).
// chevron 두 종은 대응 에셋이 없어 계속 react-native-svg 로 실측 치수대로 그린다.
import { Image, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import iconTrash from '../../assets/brand/icon-trash.png';
import iconLogout from '../../assets/brand/icon-logout.png';
import { elderAge, initial, type ElderProfile } from '@giokon/core';
import { genderLabel } from '../lib/format';
import { useElderPhotoUrl } from '../data/elder-photo';

/** Figma 설정 화면 상수 — scripts/check-figma-spec.mjs 가 이 값을 검사한다. */
export const SETTINGS = {
  left: 29,
  cardW: 336,
  cardR: 10,
  cardBorder: '#e3e3e3',
  divider: '#d9d9d9',
  dividerW: 283,
  dividerLeft: 55,
  elderCardH: 113,
  elderCardBg: '#fdf6f0',
  elderCardShadow: '1px 1px 8px rgba(106,106,106,0.25)',
  elderGap: 21, // pitch 134 - 113
  muted: '#7b7c7c',
  strong: '#404040',
} as const;

/** 섹션 라벨 — SemiBold 14 검정. */
export function SectionLabel({
  label,
  left = 34,
  lineHeight = 17,
  style,
}: {
  label: string;
  left?: number;
  lineHeight?: number;
  style?: object;
}) {
  return (
    <Text
      className="text-[14px] font-semibold text-black"
      style={{ marginLeft: left - SETTINGS.left, lineHeight, ...style }}
    >
      {label}
    </Text>
  );
}

/** 목록 구분선 — 283×1 #d9d9d9. */
export function Divider({ top }: { top: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: SETTINGS.dividerLeft - SETTINGS.left - 1,
        top,
        width: SETTINGS.dividerW,
        height: 1,
        backgroundColor: SETTINGS.divider,
      }}
    />
  );
}

/** 행 chevron `>` — 8.75×13.25 #404040 (정보 카드). */
export function RowChevron() {
  return (
    <Svg width={8.75} height={13.25} viewBox="0 0 8.75 13.25">
      <Path
        d="M1.3 1.3 L7.45 6.6 L1.3 11.95"
        stroke={SETTINGS.strong}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** 작은 chevron `>` — 6×7 #404040 ("전체보기"). */
export function SmallChevron() {
  return (
    <Svg width={6} height={7} viewBox="0 0 6 7">
      <Path
        d="M1 1 L4.7 3.5 L1 6"
        stroke={SETTINGS.strong}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** 로그아웃 글리프 — 13×13 (Figma `Group 160` 좌측 아이콘). */
export function LogoutGlyph() {
  return <Image source={iconLogout} style={{ width: 13, height: 13 }} resizeMode="contain" />;
}

/** 휴지통 글리프 — 잉크 21×21(노드 19×19), Figma `Group2`. */
function TrashGlyph() {
  return <Image source={iconTrash} style={{ width: 21, height: 21 }} resizeMode="contain" />;
}

/**
 * 담당 어르신 카드(설정·담당 어르신 관리 공용) — 336×113.
 *
 * ⚠️ 값은 전부 실데이터다. Figma 의 "1938년생 (88세) / 여성 l 햇살 요양원" 은 자리표시자이므로
 * 성별이 없으면 표기를 생략하고, 기관을 모르면 성별만 쓴다(임의값을 만들지 않는다).
 */
export function ManagedElderCard({
  elder,
  orgName,
  onPress,
  onDelete,
}: {
  elder: ElderProfile;
  orgName: string | null;
  onPress?: () => void;
  onDelete: () => void;
}) {
  const photoUrl = useElderPhotoUrl(elder.photoPath);
  const gender = genderLabel(elder.gender);
  // Figma 는 "여성 l 햇살 요양원" — 구분자 좌우 여백은 어르신 카드(PatientCard)와 같은 3칸.
  const meta = gender && orgName ? `${gender}   l   ${orgName}` : (gender ?? orgName ?? '');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${elder.name} 어르신`}
      className={onPress ? 'active:opacity-90' : undefined}
      style={{
        width: SETTINGS.cardW,
        height: SETTINGS.elderCardH,
        borderRadius: SETTINGS.cardR,
        backgroundColor: SETTINGS.elderCardBg,
        boxShadow: SETTINGS.elderCardShadow,
      }}
    >
      {/* 사진 73 원형 — 없으면 이니셜 아바타 */}
      <View
        style={{
          position: 'absolute',
          left: 27,
          top: 20,
          width: 73,
          height: 73,
          borderRadius: 36.5,
          backgroundColor: elder.avatarColor,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={{ width: 73, height: 73 }} resizeMode="cover" />
        ) : (
          <Text className="text-[28px] font-semibold text-white">{initial(elder.name)}</Text>
        )}
      </View>

      <Text
        className="absolute text-[18px] font-semibold text-black"
        style={{ left: 124, top: 16, lineHeight: 30 }}
        numberOfLines={1}
      >
        {elder.name} 어르신
      </Text>
      <Text
        className="absolute text-[14px] font-medium"
        style={{ left: 124, top: 46, lineHeight: 25, color: SETTINGS.muted }}
      >
        {elder.birthYear}년생 ({elderAge(elder)}세)
      </Text>
      {meta.length > 0 ? (
        <Text
          className="absolute text-[14px] font-medium"
          style={{ left: 124, top: 71, lineHeight: 25, color: SETTINGS.muted }}
          numberOfLines={1}
        >
          {meta}
        </Text>
      ) : null}

      {/* 삭제 — 되돌릴 수 없으므로 확인은 호출부(화면)가 띄운다 */}
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`${elder.name} 어르신 삭제`}
        className="absolute active:opacity-60"
        style={{ left: 269 - 12, top: 46 - 12, padding: 12 }}
      >
        <TrashGlyph />
      </Pressable>
    </Pressable>
  );
}
