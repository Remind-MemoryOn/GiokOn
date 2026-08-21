// 연대기 수정 (Figma `15:7`) — 프로필 폼의 **입력 상태**(어르신 등록과 같은 화면).
// 첫 AI 질문·주제 추천이 이 연대기를 근거로 개인화된다(@giokon/core).
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { KEY_MEMORY_TOPIC, birthYearFromDate } from '@giokon/core';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ProfileForm, type ProfileSubmit } from '../../src/components/ProfileForm';
import { useChronicles, useElderView } from '../../src/data/reads';
import { useDeleteChronicle, useUpsertChronicle, useUpsertElder } from '../../src/data/writes';
import { removeElderPhoto, saveElderPhoto, useElderPhotoUrl } from '../../src/data/elder-photo';


export default function ChronicleEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { elder, loading } = useElderView(id);
  const chronicles = useChronicles(id);
  const photoUrl = useElderPhotoUrl(elder?.photoPath);
  const upsertElder = useUpsertElder();
  const upsertChronicle = useUpsertChronicle();
  const deleteChronicle = useDeleteChronicle();
  const [saving, setSaving] = useState(false);

  const initial = useMemo(
    () => ({
      name: elder?.name ?? '',
      birthDate: elder?.birthDate ?? '',
      gender: elder?.gender,
      hometown: elder?.hometown ?? '',
      family: elder?.family ?? '',
      job: elder?.job ?? '',
      hobbies: elder?.hobbies ?? '',
    }),
    [elder],
  );
  const memories = useMemo(
    () => chronicles.map((c) => ({ key: c.id, text: c.content })),
    [chronicles],
  );

  if (!elder || !id) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <ScreenHeader title="연대기 수정" />
        {loading ? (
          <ActivityIndicator color="#e9822b" style={{ marginTop: 60 }} />
        ) : (
          <Text className="text-[18px] font-normal text-muted text-center" style={{ marginTop: 60 }}>
            어르신을 찾을 수 없어요.
          </Text>
        )}
        <View />
      </SafeAreaView>
    );
  }

  const onSubmit = async (v: ProfileSubmit) => {
    if (saving) return;
    setSaving(true);
    try {
      const previousPhoto = elder.photoPath;
      const photoPath = v.pickedPhoto ? await saveElderPhoto(elder.id, v.pickedPhoto) : undefined;
      await upsertElder({
        id: elder.id,
        name: v.name.trim(),
        birthDate: v.birthDate,
        birthYear: birthYearFromDate(v.birthDate),
        hometown: v.hometown.trim() || undefined,
        family: v.family.trim() || undefined,
        job: v.job.trim() || undefined,
        hobbies: v.hobbies.trim() || undefined,
        gender: v.gender,
        photoPath,
      });

      // 사진을 바꿨으면 이전 파일을 지운다 — 프로필 저장이 끝난 뒤에 지워야
      // 저장이 실패했을 때 예전 사진이 사라지지 않는다. 정리 실패는 저장을 막지 않는다.
      if (photoPath && previousPhoto && previousPhoto !== photoPath) {
        try {
          await removeElderPhoto(previousPhoto);
        } catch (e) {
          console.warn('[giokon] 이전 사진을 지우지 못했습니다.', e);
        }
      }

      // 주요 기억 = 연대기 항목. 목록에서 사라진 항목은 삭제, 내용이 바뀐 항목은 수정,
      // 새 항목(new-*)은 추가한다.
      const keptIds = new Set(v.memories.map((m) => m.key));
      for (const c of chronicles) {
        if (!keptIds.has(c.id)) await deleteChronicle({ id: c.id, elderId: elder.id });
      }
      for (const m of v.memories) {
        const content = m.text.trim();
        const existing = chronicles.find((c) => c.id === m.key);
        if (existing) {
          if (content && content !== existing.content) {
            await upsertChronicle({ id: existing.id, elderId: elder.id, topic: existing.topic, content, keywords: existing.keywords });
          } else if (!content) {
            await deleteChronicle({ id: existing.id, elderId: elder.id });
          }
        } else if (content) {
          await upsertChronicle({ elderId: elder.id, topic: KEY_MEMORY_TOPIC, content, keywords: [] });
        }
      }
      router.back();
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileForm
      title="연대기 수정"
      sig={`${elder.id}:${elder.updatedAt}`}
      initial={initial}
      initialMemories={memories}
      photoUrl={photoUrl}
      saving={saving}
      onSubmit={onSubmit}
    />
  );
}
