// 동의 수집·게이팅 (Figma 미포함 · 필수) — 어르신 세션 시작 전 필수 동의.
// @giokon/core 동의 카탈로그를 단일 기준으로 사용한다(민감정보·국외이전·AI 고지).
// 대리동의(보호자/성년후견)·의사능력은 웹에서 상세 처리하며, 앱은 세션 게이팅을 담당한다.
import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CONSENT_CATALOG,
  CONSENT_VERSION,
  requiredElderConsents,
  type ConsentType,
} from '@giokon/core';
import { DetailHeader } from '../../src/components/AppHeader';
import { Button } from '../../src/components/ui';
import { NonMedicalFootnote } from '../../src/components/banners';
import { useElder } from '../../src/data/reads';
import { useGrantConsents } from '../../src/data/writes';
import { C } from '../../src/theme';

export default function ConsentGate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const elder = useElder(id);
  const grant = useGrantConsents();
  const [saving, setSaving] = useState(false);
  const required = requiredElderConsents();
  const [checked, setChecked] = useState<Record<ConsentType, boolean>>(
    () => Object.fromEntries(required.map((t) => [t, false])) as Record<ConsentType, boolean>,
  );

  const allChecked = required.every((t) => checked[t]);

  if (!elder || !id) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="px-5">
          <DetailHeader title="동의 확인" />
        </View>
      </SafeAreaView>
    );
  }

  const toggle = (t: ConsentType) => setChecked((c) => ({ ...c, [t]: !c[t] }));
  const onAgree = async () => {
    if (!allChecked || saving) return;
    setSaving(true);
    try {
      await grant(id, required);
      router.replace(`/session/start?id=${id}`);
    } catch (e) {
      Alert.alert('동의 저장 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title="동의 확인" />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-[20px] font-semibold text-ink mt-2 leading-[30px]">
          {elder.name} 어르신과의 대화를 위해{'\n'}아래 동의가 필요해요.
        </Text>
        <Text className="text-[14px] text-muted mt-2 mb-5">
          어르신(정보주체) 또는 보호자·대리인의 동의를 확인해 주세요. (동의서 {CONSENT_VERSION})
        </Text>

        {required.map((t) => {
          const def = CONSENT_CATALOG[t];
          const on = checked[t];
          return (
            <Pressable
              key={t}
              onPress={() => toggle(t)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              className={`flex-row items-start rounded-card border p-4 mb-3 ${on ? 'border-accent bg-accent/5' : 'border-line bg-white'}`}
            >
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={24}
                color={on ? C.accent : C.textSecondary}
              />
              <View className="flex-1 ml-3">
                <View className="flex-row flex-wrap items-center">
                  <Text className="text-[16px] font-semibold text-ink">{def.label}</Text>
                  {def.sensitive ? (
                    <Text className="text-[12px] text-danger ml-2">민감정보</Text>
                  ) : null}
                  {def.crossBorder ? (
                    <Text className="text-[12px] text-accent ml-2">국외이전</Text>
                  ) : null}
                </View>
                <Text className="text-[14px] text-muted mt-1 leading-[20px]">{def.summary}</Text>
              </View>
            </Pressable>
          );
        })}

        <NonMedicalFootnote />

        <View className="mt-6">
          <Button label="동의하고 시작하기" onPress={onAgree} disabled={!allChecked || saving} />
          <View className="mt-3">
            <Button label="취소" variant="ghost" onPress={() => router.back()} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
