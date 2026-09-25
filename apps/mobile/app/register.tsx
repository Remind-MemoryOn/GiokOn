// 어르신 등록 (Figma `56:337`) — 프로필 폼의 **빈 상태**.
// 화면 레이아웃은 연대기 수정과 동일해 ProfileForm 을 공유한다(같은 페이지의 두 상태).
import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { EMPTY_VALUES, ProfileForm, type ProfileSubmit } from '../src/components/ProfileForm';
import { useUpsertChronicle, useUpsertElder } from '../src/data/writes';
import { saveElderPhoto } from '../src/data/elder-photo';
import { applyChronicleSync, elderFieldsFromForm, planChronicleSync } from '../src/features/profile/profileSubmit';


export default function Register() {
  const upsertElder = useUpsertElder();
  const upsertChronicle = useUpsertChronicle();
  const [saving, setSaving] = useState(false);

  const onSubmit = async (v: ProfileSubmit) => {
    if (saving) return;
    setSaving(true);
    try {
      const base = elderFieldsFromForm(v);
      let elder = await upsertElder(base);

      // 사진은 어르신 id 가 있어야 저장 경로가 정해지므로 등록 직후에 올린다.
      // 사진 업로드가 실패해도 등록 자체는 이미 끝났으므로 안내만 하고 진행한다.
      if (v.pickedPhoto) {
        try {
          const photoPath = await saveElderPhoto(elder.id, v.pickedPhoto);
          elder = await upsertElder({ ...base, id: elder.id, photoPath });
        } catch (e) {
          Alert.alert('사진 저장 실패', e instanceof Error ? e.message : '사진만 저장하지 못했어요.');
        }
      }

      // 새 어르신이라 기존 연대기가 없다 → 비어 있지 않은 주요 기억만 추가된다.
      await applyChronicleSync(elder.id, planChronicleSync([], v.memories), {
        upsert: upsertChronicle,
        remove: async () => {},
      });
      // 등록 흐름의 다음 단계는 동의 주체 확인과 필수 동의 4종이다.
      // 동의를 완료하기 전에는 세션 시작으로 진행할 수 없다.
      router.replace(`/consent/${elder.id}`);
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
