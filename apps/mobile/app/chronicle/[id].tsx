// 연대기(어르신 프로필 기록) 수정 — 프로필 필드 + 주요 기억.
// 첫 AI 질문·주제 추천이 이 연대기를 근거로 개인화된다(core).
import { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { DetailHeader } from '../../src/components/AppHeader';
import { Field, Button, Card, SectionTitle } from '../../src/components/ui';
import { useElder, useChronicles } from '../../src/data/reads';
import { useUpsertElder, useUpsertChronicle } from '../../src/data/writes';

export default function ChronicleEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const elder = useElder(id);
  const chronicles = useChronicles(id);
  const upsertElder = useUpsertElder();
  const upsertChronicle = useUpsertChronicle();
  const [saving, setSaving] = useState(false);

  const [hometown, setHometown] = useState(elder?.hometown ?? '');
  const [family, setFamily] = useState(elder?.family ?? '');
  const [job, setJob] = useState(elder?.job ?? '');
  const [hobbies, setHobbies] = useState(elder?.hobbies ?? '');
  const [memory, setMemory] = useState('');

  if (!elder || !id) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="px-5">
          <DetailHeader title="연대기 수정" />
        </View>
        <Text className="text-center text-muted mt-16">어르신을 찾을 수 없어요.</Text>
      </SafeAreaView>
    );
  }

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await upsertElder({
        id: elder.id,
        name: elder.name,
        birthYear: elder.birthYear,
        hometown: hometown.trim() || undefined,
        family: family.trim() || undefined,
        job: job.trim() || undefined,
        hobbies: hobbies.trim() || undefined,
      });
      if (memory.trim()) {
        await upsertChronicle({ elderId: elder.id, topic: '주요 기억', content: memory.trim(), keywords: [] });
        setMemory('');
      }
      router.back();
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title="연대기 수정" />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View className="mt-2" />
        <Field label="이름" value={elder.name} onChangeText={() => {}} placeholder="" />
        <Field label="출생연도" value={String(elder.birthYear)} onChangeText={() => {}} placeholder="" />
        <Field label="출신지" value={hometown} onChangeText={setHometown} placeholder="출신지를 입력해 주세요" />
        <Field label="가족 구성" value={family} onChangeText={setFamily} placeholder="가족 구성을 입력해 주세요" />
        <Field label="직업 이력" value={job} onChangeText={setJob} placeholder="직업 이력을 입력해 주세요" />
        <Field label="취미" value={hobbies} onChangeText={setHobbies} placeholder="취미를 입력해 주세요" />

        <SectionTitle>주요 기억</SectionTitle>
        {chronicles.map((c) => (
          <Card key={c.id} className="mb-2">
            <Text className="text-[13px] text-accent mb-1">{c.topic}</Text>
            <Text className="text-[15px] text-ink leading-[22px]">{c.content}</Text>
          </Card>
        ))}
        <Field
          value={memory}
          onChangeText={setMemory}
          placeholder="기억에 남는 이야기를 추가해 주세요"
          multiline
        />
        <View className="mt-2">
          <Button label="저장하기" onPress={onSave} disabled={saving} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
