// 연대기 수정 (Figma `15:7`) — 프로필 폼의 **입력 상태**(어르신 등록과 같은 화면).
// 첫 AI 질문·주제 추천이 이 연대기를 근거로 개인화된다(@giokon/core).
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ProfileForm, type ProfileSubmit } from '../../src/components/ProfileForm';
import { useChronicles, useElder } from '../../src/data/reads';
import { useDeleteChronicle, useUpsertChronicle, useUpsertElder } from '../../src/data/writes';
import { saveElderPhoto, useElderPhotoUrl } from '../../src/data/elder-photo';

const MEMORY_TOPIC = '주요 기억';

export default function ChronicleEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const elder = useElder(id);
  const chronicles = useChronicles(id);
  const photoUrl = useElderPhotoUrl(elder?.photoPath);
  const upsertElder = useUpsertElder();
  const upsertChronicle = useUpsertChronicle();
  const deleteChronicle = useDeleteChronicle();
  const [saving, setSaving] = useState(false);

  const initial = useMemo(
    () => ({
      name: elder?.name ?? '',
      birthYear: elder ? String(elder.birthYear) : '',
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
        <Text className="text-[18px] font-normal text-muted text-center" style={{ marginTop: 60 }}>
          어르신을 찾을 수 없어요.
        </Text>
        <View />
      </SafeAreaView>
    );
  }

  const onSubmit = async (v: ProfileSubmit) => {
    if (saving) return;
    setSaving(true);
    try {
      const photoPath = v.pickedPhotoUri ? await saveElderPhoto(elder.id, v.pickedPhotoUri) : undefined;
      await upsertElder({
        id: elder.id,
        name: v.name.trim(),
        birthYear: Number(v.birthYear),
        hometown: v.hometown.trim() || undefined,
        family: v.family.trim() || undefined,
        job: v.job.trim() || undefined,
        hobbies: v.hobbies.trim() || undefined,
        gender: elder.gender,
        photoPath,
      });

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
          await upsertChronicle({ elderId: elder.id, topic: MEMORY_TOPIC, content, keywords: [] });
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
