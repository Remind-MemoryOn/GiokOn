// 동의 확인 ① 동의 주체 (Figma `동의 확인1`, 프레임 393×852)
//
// 대화 전 필수 동의를 받기 **전에** 누가 동의하는지부터 확인한다. DB `consents` 는
// `subject_type`(본인/법정대리인/보호자)과 `capacity`(의사능력)를 함께 요구하는데,
// 예전 앱은 이 화면이 없어 항상 DB 기본값(self/unknown)으로 굳어 있었다(감사 지적).
//
// Figma 실측(@4x 픽셀 대조):
//   헤더 0..114 공용 ScreenHeader · 제목 "동의 확인"
//   제목 SemiBold 19/30 @(29,144) 2줄 · 부제 Regular 14/25 @(29,208) 2줄
//   섹션 라벨 "동의하는 분을 선택해 주세요." SemiBold 15 잉크 top 293
//   주체 카드 335×181 r10 border #d9d9d9 @(29,323) — 3행 pitch 60(구분선 383·443)
//     체크박스 17 @(50, 행+22) 주황 · 라벨 SemiBold 13 검정 잉크 @(79.5, 행+25.5)
//   "다음" 336×57 r10 #e9822b @(29,727) · 라벨 SemiBold 18 흰색
//
// 조건부(사용자 확정): **법정 대리인**을 고르면 대리 동의자 성함·관계 입력(`Frame 13`),
// **보호자**를 고르면 법적 한계 안내(`Frame 12`)가 카드 아래에 나타난다.
// ⚠️ 보호자도 성함·관계를 함께 받는다 — DB 제약 `consents_guardian_check` 가
//   본인이 아닌 동의에 대해 `guardian_name` 을 요구하므로, 없으면 저장이 실패한다.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CONSENT_SUBJECT_OPTIONS,
  CONSENT_VERSION,
  GUARDIAN_RELATION_OPTIONS,
  type ConsentSubjectType,
} from '@giokon/core';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import {
  CheckBox,
  CONSENT_UI,
  FieldBox,
  FieldChevron,
  FieldLabel,
  FieldPlaceholder,
  GuardianRiskNotice,
} from '../../../src/components/consent';
import { useElderView } from '../../../src/data/reads';
import { subjectSelection } from '../../../src/features/consent/subject';

/** 대리 동의자 성함 상한 — DB `consents_guardian_check`(50자)와 같다. */
const NAME_MAX = 50;
/** 주체 카드 아래 조건부 블록까지의 간격(Figma 에 없어 동의 카드 pitch 여백과 맞춘다). */
const BLOCK_GAP = 19;
/** 카드 하단 504 → CTA 727. 조건부 블록이 생기면 이만큼을 최소로 두고 아래로 밀린다. */
const CTA_SPACER = 223;

export default function ConsentSubject() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { elder, loading } = useElderView(id);
  const [subject, setSubject] = useState<ConsentSubjectType | null>(null);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [relationOpen, setRelationOpen] = useState(false);

  if (!elder || !id) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <ScreenHeader title="동의 확인" />
        {!loading ? (
          <Text className="text-[18px] font-normal text-muted text-center" style={{ marginTop: 60 }}>
            어르신을 찾을 수 없어요.
          </Text>
        ) : null}
      </SafeAreaView>
    );
  }

  const { isProxy, canProceed, guardianName, guardianRelation } = subjectSelection(subject, name, relation);

  const goNext = () => {
    if (!canProceed || subject === null) return;
    router.push({
      pathname: '/consent/[id]/terms',
      params: { id, subject, guardianName, guardianRelation },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader title="동의 확인" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingLeft: CONSENT_UI.left,
          paddingTop: 30,
          paddingBottom: 68,
        }}
      >
        <Text className="text-[19px] font-semibold text-black" style={{ lineHeight: 30 }}>
          {elder.name} 어르신과의{'\n'}대화를 위해 아래 동의가 필요해요.
        </Text>
        <Text
          className="text-[14px] font-normal text-muted"
          style={{ lineHeight: 25, width: 337, marginTop: 4 }}
        >
          어르신(정보주체) 또는 보호자·대리인의 동의를 확인해 주세요. (동의서 {CONSENT_VERSION})
        </Text>

        {/* 섹션 라벨 — 부제 하단 258 → 잉크 293 */}
        <Text
          className="text-[15px] font-semibold text-black"
          style={{ lineHeight: 22, marginTop: 31 }}
        >
          동의하는 분을 선택해 주세요.
        </Text>

        {/* 주체 카드 — 라벨 하단 311 → 323 */}
        <View
          style={{
            width: CONSENT_UI.cardW,
            marginTop: 12,
            borderRadius: CONSENT_UI.cardR,
            borderWidth: 1,
            borderColor: CONSENT_UI.border,
            backgroundColor: '#ffffff',
          }}
        >
          {CONSENT_SUBJECT_OPTIONS.map((opt, i) => (
            <Pressable
              key={opt.value}
              onPress={() => setSubject(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: subject === opt.value }}
              accessibilityLabel={opt.label}
              className="active:opacity-80"
              style={{
                height: CONSENT_UI.subjectRowH,
                // 구분선은 카드 폭 전체를 가로지른다(안쪽 여백 없음).
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: CONSENT_UI.border,
              }}
            >
              <View className="absolute" style={{ left: 20, top: 21 }}>
                <CheckBox checked={subject === opt.value} variant="accent" />
              </View>
              <Text
                className="absolute text-[13px] font-semibold text-black"
                style={{ left: 49, top: 21, lineHeight: 17 }}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* 조건부 — 대리 동의자 정보(법정 대리인·보호자 공통, DB 가 성함을 요구한다) */}
        {isProxy ? (
          <View className="flex-row" style={{ marginTop: BLOCK_GAP }}>
            <View>
              <FieldLabel label="대리 동의자 성함" required />
              <FieldBox width={CONSENT_UI.nameW}>
                <TextInput
                  value={name}
                  onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
                  maxLength={NAME_MAX}
                  accessibilityLabel="대리 동의자 성함"
                  className="absolute text-[13px] font-normal text-black"
                  style={{ left: 17, right: 12, top: 12, height: 18, padding: 0, lineHeight: 16 }}
                />
                {name.length === 0 ? <FieldPlaceholder text="예)홍길동" /> : null}
              </FieldBox>
            </View>

            <View style={{ marginLeft: CONSENT_UI.fieldGap }}>
              <FieldLabel label="어르신과의 관계" required />
              <FieldBox width={CONSENT_UI.relationW} onPress={() => setRelationOpen(true)}>
                {relation.length === 0 ? (
                  <FieldPlaceholder text="선택해주세요" />
                ) : (
                  <Text
                    className="absolute text-[13px] font-normal text-black"
                    style={{ left: 17, top: 12, lineHeight: 16 }}
                  >
                    {relation}
                  </Text>
                )}
                <FieldChevron />
              </FieldBox>
            </View>
          </View>
        ) : null}

        {/* 조건부 — 성년후견 미개시 보호자 법적 한계 고지 */}
        {subject === 'guardian' ? (
          <View style={{ marginTop: BLOCK_GAP }}>
            <GuardianRiskNotice />
          </View>
        ) : null}

        {/* 카드 하단 504 → CTA 727. 조건부 블록이 생기면 밀려 내려가고 화면은 스크롤된다. */}
        <View style={{ flex: 1, minHeight: CTA_SPACER }} />

        <Pressable
          onPress={goNext}
          disabled={!canProceed}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canProceed }}
          className="items-center justify-center active:opacity-90"
          style={{
            width: 336,
            height: 57,
            borderRadius: CONSENT_UI.cardR,
            backgroundColor: CONSENT_UI.accent,
            // 고를 때까지 흐리게(디자인은 활성 상태만 그려져 있다)
            opacity: canProceed ? 1 : 0.45,
          }}
        >
          <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
            다음
          </Text>
        </Pressable>
      </ScrollView>

      {/* 관계 선택 목록(Figma `Frame 14`) — 162 wide · 5행 × 37 */}
      <Modal
        visible={relationOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRelationOpen(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
          onPress={() => setRelationOpen(false)}
        >
          <View
            className="bg-white"
            style={{
              width: CONSENT_UI.relationW,
              borderRadius: CONSENT_UI.cardR,
              borderWidth: 1,
              borderColor: CONSENT_UI.border,
              overflow: 'hidden',
            }}
          >
            {GUARDIAN_RELATION_OPTIONS.map((r, i) => (
              <Pressable
                key={r}
                onPress={() => {
                  setRelation(r);
                  setRelationOpen(false);
                }}
                accessibilityRole="button"
                className="active:opacity-70"
                style={{
                  height: 37,
                  justifyContent: 'center',
                  paddingLeft: 20,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: CONSENT_UI.border,
                }}
              >
                <Text
                  className="text-[12px] font-medium"
                  style={{ lineHeight: 17, color: r === relation ? CONSENT_UI.accent : CONSENT_UI.muted }}
                >
                  {r}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
