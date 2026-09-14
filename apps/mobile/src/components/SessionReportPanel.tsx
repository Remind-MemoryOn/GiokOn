import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useGenerateSessionReport } from '@giokon/data';
import type { SessionReportRecord } from '@giokon/core';

export function SessionReportPanel({ sessionId, report }: { sessionId: string; report?: SessionReportRecord }) {
  const generate = useGenerateSessionReport();
  const attempted = useRef<string | null>(null);
  const { mutate } = generate;
  useEffect(() => {
    if (report || attempted.current === sessionId) return;
    attempted.current = sessionId;
    mutate(sessionId);
  }, [sessionId, report, mutate]);

  return (
    <View style={{ width: 336, marginBottom: 20 }}>
      <Text className="text-[14px] font-semibold text-black">
        {report ? 'AI 대화 분석' : generate.isPending ? 'AI가 대화 분석과 일지 초안을 정리하고 있어요' : 'AI 분석 확인'}
      </Text>
      <Text className="text-[13px] font-normal text-muted" style={{ marginTop: 6, lineHeight: 20 }}>
        {report ? '대화 발화를 근거로 생성한 내용입니다. 일지 초안은 웹에서 확인·수정할 수 있어요.' : generate.error?.message ?? '아래 수치는 저장된 대화에서 계산한 관찰 지표입니다.'}
      </Text>
      {!report && !generate.isPending ? (
        <Pressable accessibilityRole="button" onPress={() => mutate(sessionId)} style={{ paddingVertical: 12 }}>
          <Text className="text-[14px] font-semibold text-accent">AI 분석 다시 시도</Text>
        </Pressable>
      ) : null}
      {report?.result.topics.map((topic, i) => (
        <View key={`${topic.name}-${i}`} style={{ marginTop: 12 }}>
          <Text className="text-[14px] font-semibold text-black">{topic.name}</Text>
          <Text className="text-[13px] font-normal text-black" style={{ lineHeight: 20 }}>{topic.text}</Text>
          <Text className="text-[12px] font-normal text-muted" style={{ lineHeight: 18 }}>
            {topic.evidence.map(e => `“${e.quote}”`).join(' / ')}
          </Text>
        </View>
      ))}
    </View>
  );
}
