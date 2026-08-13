// 어르신 등록 (Figma `56:337`) — 프로필 폼의 **빈 상태**.
// 화면 레이아웃은 연대기 수정과 동일해 ProfileForm 을 공유한다(같은 페이지의 두 상태).
import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { EMPTY_VALUES, ProfileForm, type ProfileSubmit } from '../src/components/ProfileForm';
import { useUpsertChronicle, useUpsertElder } from '../src/data/writes';
import { saveElderPhoto } from '../src/data/elder-photo';

const MEMORY_TOPIC = '주요 기억';

export default function Register() {
  const upsertElder = useUpsertElder();
  const upsertChronicle = useUpsertChronicle();
  const [saving, setSaving] = useState(false);

  const onSubmit = async (v: ProfileSubmit) => {
    if (saving) return;
    setSaving(true);
    try {
      const base = {
        name: v.name.trim(),
        birthYear: Number(v.birthYear),
        hometown: v.hometown.trim() || undefined,
        family: v.family.trim() || undefined,
        job: v.job.trim() || undefined,
        hobbies: v.hobbies.trim() || undefined,
      };
      let elder = await upsertElder(base);

      // 사진은 어르신 id 가 있어야 저장 경로가 정해지므로 등록 직후에 올린다.
      if (v.pickedPhotoUri) {
        const photoPath = await saveElderPhoto(elder.id, v.pickedPhotoUri);
        elder = await upsertElder({ ...base, id: elder.id, photoPath });
      }

      for (const m of v.memories) {
        const content = m.text.trim();
        if (content) {
          await upsertChronicle({ elderId: elder.id, topic: MEMORY_TOPIC, content, keywords: [] });
        }
      }
      router.replace(`/elder/${elder.id}`);
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileForm
      title="어르신 등록"
      sig="new"
      initial={EMPTY_VALUES}
      initialMemories={[]}
      photoUrl={null}
      saving={saving}
      onSubmit={onSubmit}
    />
  );
}
