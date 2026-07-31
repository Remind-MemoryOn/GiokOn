// 어르신 등록 — 이름·출생연도(필수) + 출신지·가족·직업·취미·주요 기억.
import { useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { DetailHeader } from '../src/components/AppHeader';
import { Field, Button } from '../src/components/ui';
import { useUpsertElder, useUpsertChronicle } from '../src/data/writes';

export default function Register() {
  const upsertElder = useUpsertElder();
  const upsertChronicle = useUpsertChronicle();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [hometown, setHometown] = useState('');
  const [family, setFamily] = useState('');
  const [job, setJob] = useState('');
  const [hobbies, setHobbies] = useState('');
  const [memory, setMemory] = useState('');

  const canSave = name.trim().length > 0 && /^\d{4}$/.test(birth.trim());

  const onSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const elder = await upsertElder({
        name: name.trim(),
        birthYear: Number(birth),
        hometown: hometown.trim() || undefined,
        family: family.trim() || undefined,
        job: job.trim() || undefined,
        hobbies: hobbies.trim() || undefined,
      });
      if (memory.trim()) {
        await upsertChronicle({
          elderId: elder.id,
          topic: '주요 기억',
          content: memory.trim(),
          keywords: [],
        });
      }
      router.replace(`/elder/${elder.id}`);
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title="어르신 등록" />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View className="mt-2" />
        <Field label="이름" required value={name} onChangeText={setName} placeholder="이름을 입력해 주세요" />
        <Field
          label="출생연도"
          required
          value={birth}
          onChangeText={setBirth}
          placeholder="예) 1945"
          keyboardType="number-pad"
          maxLength={4}
        />
        <Field label="출신지" value={hometown} onChangeText={setHometown} placeholder="출신지를 입력해 주세요" />
        <Field label="가족 구성" value={family} onChangeText={setFamily} placeholder="가족 구성을 입력해 주세요" />
        <Field label="직업 이력" value={job} onChangeText={setJob} placeholder="직업 이력을 입력해 주세요" />
        <Field label="취미" value={hobbies} onChangeText={setHobbies} placeholder="취미를 입력해 주세요" />
        <Field
          label="주요 기억"
          value={memory}
          onChangeText={setMemory}
          placeholder="주요 기억을 입력해 주세요"
          multiline
        />
        <View className="mt-2">
          <Button label="저장하기" onPress={onSave} disabled={!canSave || saving} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
