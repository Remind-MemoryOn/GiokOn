// 동의 확인 ② 필수 동의 (Figma `동의 확인2` = 기존 `463:62`, 프레임 393×852)
//
// ①(주체 선택)에서 넘어온 `subject`·`guardianName`·`guardianRelation` 을 그대로
// 들고 와 저장 시 `consents.subject_type`/`guardian_name`/`guardian_relation` 에 기록한다
// (의사능력 `capacity` 는 주체에서 파생 — @giokon/core `capacityForSubject`).
//
// Figma 실측(get_metadata + get_design_context, 2026-08-13 사용자 신규 디자인):
//   헤더 0..114 — 공용 ScreenHeader(뒤로 @(29,74) · "동의 확인" Medium 18/30)
//   제목   SemiBold 19/30 검정 @(29,144) 2줄
//   부제   Regular 14/25 #7b7c7c @(29,208) 2줄 — 동의서 버전 포함
//   동의 카드 335×97 r10 흰색 border #d9d9d9 — 법률 문서 기준 필수 4종, 세로 스크롤
//     체크박스 17 @(50, +23) · 제목 SemiBold 13/16 검정 @(79, +22)
//     설명 Regular 12/16 #7b7c7c @(79, +44) w252
//   비의료 고지 Regular 14/25 #7b7c7c @(39,617) w316 3줄
//   "동의하고 시작하기" 336×57 r10 #e9822b @(29,727) · 라벨 SemiBold 18/30 흰색 @top741
//
// 동의 항목·문구는 @giokon/core 카탈로그가 단일 기준(SoT)이다. Figma 는 필수 표시를
// 라벨 뒤 "(필수, 별도)" 대신 앞의 "[필수,별도]" 배지로 뒀을 뿐이라, 문자열을 새로
// 박지 않고 카탈로그 라벨에서 파생한다(법무 문구가 바뀌면 화면도 함께 바뀐다).
//
// 체크박스는 Figma 컴포넌트(`463:57`)를 사용자가 내보낸 에셋(`assets/figma/Vector2.png`
// → checkbox-off/on 17×17)으로 쓴다. 선택 상태는 **흰 바탕 + 검정 테두리 + 검정 체크**다
// (임시 구현은 검정 채움 + 흰 체크였다 — 실제 디자인과 달랐다).
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CONSENT_CATALOG,
  CONSENT_VERSION,
  capacityForSubject,
  consentBasis,
  requiredElderConsents,
  type ConsentDefinition,
  type ConsentSubjectType,
  type ConsentType,
} from '@giokon/core';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { NonMedicalFootnote } from '../../../src/components/banners';
import { CheckBox } from '../../../src/components/consent';
import { useElderView } from '../../../src/data/reads';
import { useGrantConsents } from '../../../src/data/writes';
import { WEB_ROUTES, webUrl } from '../../../src/lib/webUrl';

/** Figma 콘텐츠 열. 카드만 335(우측 끝 364), 버튼은 336(우측 끝 365) — 원본 그대로. */
const LEFT = 29;
const CARD_W = 335;
const CARD_H = 97;
const CARD_GAP = 116 - CARD_H; // Figma 카드 pitch 116

/**
 * 동의 카드 제목 — 카탈로그 라벨의 "(필수…)" 접미사를 Figma 의 앞 배지로 옮긴다.
 * 예) "민감정보(건강·음성) 처리 동의(필수, 별도)" → "[필수,별도] 민감정보(건강·음성) 처리 동의"
 */
function cardTitle(def: ConsentDefinition): string {
  const base = def.label.replace(/\s*\([^)]*\)\s*$/, '');
  const badge = def.required ? (def.sensitive ? '[필수,별도]' : '[필수]') : '[선택]';
  return `${badge} ${base}`;
}

export default function ConsentGate() {
  const { id, subject, guardianName, guardianRelation } = useLocalSearchParams<{
    id: string;
    subject?: ConsentSubjectType;
    guardianName?: string;
    guardianRelation?: string;
  }>();
  const { elder, loading } = useElderView(id);
  const grant = useGrantConsents();
  const [saving, setSaving] = useState(false);
  const required = requiredElderConsents();
  const [checked, setChecked] = useState<Record<ConsentType, boolean>>(
    () => Object.fromEntries(required.map((t) => [t, false])) as Record<ConsentType, boolean>,
  );

  const allChecked = required.every((t) => checked[t]);
  const detailRoute: Record<ConsentType, string> = {
    terms_required: WEB_ROUTES.terms,
    privacy_required: WEB_ROUTES.memberPrivacyConsent,
    elder_privacy_required: WEB_ROUTES.elderPrivacyConsent,
    sensitive_health_voice: WEB_ROUTES.elderSensitiveConsent,
    cross_border_transfer: WEB_ROUTES.elderCrossBorderConsent,
    ai_processing: WEB_ROUTES.elderAiConsent,
    marketing_optional: WEB_ROUTES.privacy,
  };

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

  const toggle = (t: ConsentType) => setChecked((c) => ({ ...c, [t]: !c[t] }));
  const onAgree = async () => {
    if (!allChecked || saving) return;
    setSaving(true);
    try {
      // 주체가 없으면(직접 URL 진입 등) 앞 단계로 돌려보낸다 — 본인동의로 굳는 것을 막는다.
      if (!subject) {
        router.replace({ pathname: '/consent/[id]', params: { id } });
        return;
      }
      await grant(id, required, {
        subjectType: subject,
        capacity: capacityForSubject(subject),
        guardianName: guardianName?.trim() || null,
        guardianRelation: guardianRelation?.trim() || null,
        basis: consentBasis(subject),
      });
      router.replace(`/session/start?id=${id}`);
    } catch (e) {
      Alert.alert('동의 저장 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader title="동의 확인" />

      <ScrollView
        className="flex-1"
        // 제목 박스 top 144 = 헤더 114 + 30 · CTA 하단 784 → 프레임 하단 68
        contentContainerStyle={{ paddingLeft: LEFT, paddingTop: 30, paddingBottom: 68 }}
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

        {required.map((t, i) => {
          const def = CONSENT_CATALOG[t];
          const on = checked[t];
          return (
            <Pressable
              key={t}
              onPress={() => toggle(t)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={cardTitle(def)}
              className="active:opacity-80"
              style={{
                width: CARD_W,
                height: CARD_H,
                borderRadius: 10,
                backgroundColor: '#ffffff',
                borderWidth: 1,
                borderColor: '#d9d9d9',
                // 첫 카드 top 273 = 부제 하단 258 + 15
                marginTop: i === 0 ? 15 : CARD_GAP,
              }}
            >
              {/*
               * Figma 절대 좌표 — 체크박스 (50,296) · 제목 (79,295) · 설명 (79,317).
               * RN 은 absolute 자식을 **테두리 안쪽(padding box)** 기준으로 놓으므로
               * 카드 원점(29,273) + 테두리 1 을 빼서 상대 좌표로 바꾼다.
               */}
              <View className="absolute" style={{ left: 20, top: 22 }}>
                <CheckBox checked={on} />
              </View>
              <Text
                className="absolute text-[13px] font-semibold text-black"
                style={{ left: 49, top: 21, lineHeight: 16 }}
                numberOfLines={1}
              >
                {cardTitle(def)}
              </Text>
              <Text
                className="absolute text-[12px] font-normal text-muted"
                style={{ left: 49, top: 43, width: 252, lineHeight: 16 }}
              >
                {def.summary}
              </Text>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  const href = webUrl(detailRoute[t]);
                  if (!href) return Alert.alert('웹 주소가 필요해요', 'EXPO_PUBLIC_WEB_URL을 설정한 뒤 상세 내용을 확인해 주세요.');
                  void Linking.openURL(href);
                }}
                accessibilityRole="link"
                accessibilityLabel={`${def.label} 상세보기`}
                style={{ position: 'absolute', right: 13, bottom: 8 }}
              >
                <Text className="text-[11px] font-semibold" style={{ color: '#e9822b', textDecorationLine: 'underline' }}>상세보기</Text>
              </Pressable>
            </Pressable>
          );
        })}

        {/* 비의료 고지 — 문구는 banners.tsx 한 곳에서 관리(카피 린트 대상) */}
        <NonMedicalFootnote
          className="text-[14px] font-normal text-muted"
          // 카드 하단 602 → 617 (마지막 카드 아래 15), Figma 는 콘텐츠 열보다 10 안쪽
          style={{ lineHeight: 25, width: 316, marginLeft: 10, marginTop: 15 }}
        />

        <Pressable
          onPress={onAgree}
          disabled={!allChecked || saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: !allChecked || saving }}
          className="items-center justify-center active:opacity-90"
          style={{
            width: 336,
            height: 57,
            borderRadius: 10,
            backgroundColor: '#e9822b',
            // 고지 하단 692 → 727
            marginTop: 35,
            // 필수 동의 전에는 흐리게(디자인은 활성 상태만 그려져 있다)
            opacity: allChecked && !saving ? 1 : 0.45,
          }}
        >
          <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
            동의하고 시작하기
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
