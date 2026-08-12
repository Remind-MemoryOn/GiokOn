// 어르신 카드 (Figma 메인화면 `48:19` 계열) — 사진 + 이름/나이·성별/최근 대화 + 주황 화살표.
//
// Figma 실측: 카드 336×146, bg rgba(233,130,43,0.07), r10,
//   shadow 1px 1px 8px rgba(106,106,106,0.25) · 사진 101 원형(카드 좌 18.5)
//   이름 SemiBold 19/30 검정 · 메타 Medium 16/30 #7b7c7c · 화살표 34 (카드 우 24.5)
//
// ⚠️ 값은 모두 실데이터 바인딩(실서비스 원칙):
//   - "최근 대화"는 실제 최근 세션 시각에서 계산(예시 날짜 금지, 없으면 '없음').
//   - 성별은 v1 DB 스키마에 없다 → 값이 없으면 표기를 생략한다(임의 표시 금지).
//   - 사진도 스키마에 없다 → 이름 이니셜 아바타로 대체(Figma 예시 인물사진은 자리표시자).
import { Image, Pressable, Text, View } from 'react-native';
import { initial, type ElderProfile } from '@giokon/core';
import { ageOf, ELDER_GENDER } from '../lib/mockData';
import { lastTalkLabel } from '../lib/format';
import chevron from '../../assets/brand/btn-chevron.png';

export function PatientCard({
  elder,
  lastTalkAt,
  onPress,
}: {
  elder: ElderProfile;
  /** 실제 최근 세션 시각(ISO). 없으면 '없음'으로 표시된다. */
  lastTalkAt?: string;
  onPress: () => void;
}) {
  const gender = ELDER_GENDER[elder.id]; // 목업 데모에만 존재 — 라이브에선 undefined
  const meta = gender ? `${ageOf(elder.birthYear)}세   l   ${gender}` : `${ageOf(elder.birthYear)}세`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${elder.name} 어르신`}
      className="flex-row items-center active:opacity-90"
      style={{
        height: 146,
        borderRadius: 10,
        backgroundColor: 'rgba(233,130,43,0.07)',
        marginBottom: 26,
        paddingLeft: 18.5,
        paddingRight: 24.5,
        shadowColor: 'rgba(106,106,106,1)',
        shadowOpacity: 0.25,
        shadowRadius: 8,
        shadowOffset: { width: 1, height: 1 },
        elevation: 3,
      }}
    >
      {/* 사진 자리 — 스키마에 사진이 없어 이니셜 아바타로 표시 */}
      <View
        style={{
          width: 101,
          height: 101,
          borderRadius: 63,
          backgroundColor: elder.avatarColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text className="text-[30px] font-bold text-white">{initial(elder.name)}</Text>
      </View>

      <View className="flex-1" style={{ marginLeft: 15 }}>
        <Text className="text-[19px] font-semibold text-black" style={{ lineHeight: 30 }}>
          {elder.name} 어르신
        </Text>
        <Text className="text-[16px] font-medium text-muted" style={{ lineHeight: 30 }}>
          {meta}
        </Text>
        <Text className="text-[16px] font-medium text-muted" style={{ lineHeight: 30 }}>
          최근 대화   {lastTalkLabel(lastTalkAt)}
        </Text>
      </View>

      <Image source={chevron} style={{ width: 34, height: 34 }} resizeMode="contain" />
    </Pressable>
  );
}
