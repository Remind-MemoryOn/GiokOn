// 연대기 수정 (Figma `15:7`) — 프로필 폼의 **입력 상태**(어르신 등록과 같은 화면).
// 첫 AI 질문·주제 추천이 이 연대기를 근거로 개인화된다(@giokon/core).
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ProfileForm, type ProfileSubmit } from '../../src/components/ProfileForm';
import { useChronicles, useElderView } from '../../src/data/reads';
import { useDeleteChronicle, useUpsertChronicle, useUpsertElder } from '../../src/data/writes';
import { removeElderPhoto, saveElderPhoto, useElderPhotoUrl } from '../../src/data/elder-photo';
import { applyChronicleSync, elderFieldsFromForm, planChronicleSync } from '../../src/features/profile/profileSubmit';

/**
 * 사진을 바꿨으면 이전 파일을 지운다 — 프로필 저장이 끝난 뒤에 지워야
 * 저장이 실패했을 때 예전 사진이 사라지지 않는다. 정리 실패는 저장을 막지 않는다.
 */
async function removeReplacedPhoto(previousPhoto: string | undefined, photoPath: string | undefined) {
  if (!photoPath || !previousPhoto || previousPhoto === photoPath) return;
  try {
    await removeElderPhoto(previousPhoto);
  } catch (e) {
    console.warn('[giokon] 이전 사진을 지우지 못했습니다.', e);
  }
}

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
      await upsertElder({ id: elder.id, ...elderFieldsFromForm(v), photoPath });
      await removeReplacedPhoto(previousPhoto, photoPath);
      await applyChronicleSync(elder.id, planChronicleSync(chronicles, v.memories), {
        upsert: upsertChronicle,
        remove: deleteChronicle,
      });
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
