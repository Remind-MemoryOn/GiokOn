// 대화 수정 — "AI가 이렇게 이해했어요"(STT 확인·수정). 저장 시 어르신 턴 반영 +
// 다음 AI 질문 생성(core). 오인식 수정으로 대화 정확도를 지킨다.
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Field } from '../../src/components/ui';
import { useApp } from '../../src/store/appStore';
import { C } from '../../src/theme';

export default function Correct() {
  const active = useApp((s) => s.active);
  const confirm = useApp((s) => s.confirmUtterance);
  const discard = useApp((s) => s.discardUtterance);
  const raw = active?.pendingStt ?? '';
  const [edited, setEdited] = useState(raw);

  if (!active || active.pendingStt === null) {
    return <SafeAreaView className="flex-1 bg-white" />;
  }

  const onCancel = () => {
    discard();
    router.replace('/session/talk');
  };
  const onSave = () => {
    confirm(edited.trim() || raw);
    router.replace('/session/loading');
  };

  return (
    <SafeAreaView className="flex-1 bg-white px-5" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between h-14">
        <Text className="text-[18px] font-semibold text-ink">AI가 이렇게 이해했어요.</Text>
        <Pressable onPress={onCancel} accessibilityLabel="닫기" className="w-10 h-10 items-center justify-center active:opacity-60">
          <Ionicons name="close" size={24} color={C.textPrimary} />
        </Pressable>
      </View>

      <Card className="mt-2">
        <Text className="text-[17px] text-ink leading-[26px] font-normal">{raw}</Text>
      </Card>

      <Text className="text-[16px] font-semibold text-ink mt-6 mb-2">수정하기</Text>
      <Field value={edited} onChangeText={setEdited} placeholder="어르신 말씀을 수정해 주세요" multiline maxLength={200} />
      <Text className="text-[14px] text-muted font-normal">내용이 맞다면 수정 없이 저장하세요.</Text>

      <View className="flex-1" />
      <View className="pb-6">
        <Button label="저장" onPress={onSave} />
        <View className="mt-3">
          <Button label="취소" variant="ghost" onPress={onCancel} />
        </View>
      </View>
    </SafeAreaView>
  );
}
