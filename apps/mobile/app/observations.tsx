// 관찰 지표 — Figma "인지 효과 분석 · 23% 향상"을 비의료로 순화한 화면.
// 효능/향상 주장 대신 대화에서 직접 관찰된 값(참여·응답·발화량·주제 반응·활동량)만 보여준다.
// (내부 목적은 인지활동 보조지만, 산출물은 판정이 아니라 관찰 기록이다.)
import { View, Text } from 'react-native';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DetailHeader } from '../src/components/AppHeader';
import { Card, SectionTitle, TopicBar } from '../src/components/ui';
import { NonMedicalFootnote } from '../src/components/banners';
import { observationSummary } from '@giokon/core';
import { useElder } from '../src/data/reads';
import { useElderObservations, useOverallObservations } from '../src/data/observations';

function Indicator({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View className="w-1/2 p-1.5">
      <Card>
        <Text className="text-[13px] text-muted">{label}</Text>
        <Text className="text-[22px] font-bold text-ink mt-1">{value}</Text>
        <Text className="text-[12px] text-muted mt-1">{note}</Text>
      </Card>
    </View>
  );
}

export default function Observations() {
  const { scope, id } = useLocalSearchParams<{ scope?: string; id?: string }>();
  const isElder = scope === 'elder' && !!id;

  const elder = useElder(id);
  const elderObs = useElderObservations(isElder ? id : undefined);
  const overall = useOverallObservations();
  const title = isElder ? '관찰 지표' : '전체 관찰 지표';

  // 실서비스 원칙: 근거 없는 값은 표시하지 않는다(null → '—', 빈 목록 → 빈 상태 안내).
  const DASH = '—';
  let responsePct: number | null;
  let uttChars: number | null;
  let sessionCount: number;
  let topics: { label: string; percent: number }[];
  let summary: string | null;

  if (isElder && elder) {
    const p = elderObs.participation;
    responsePct = p.avgResponseRate;
    uttChars = p.avgUtteranceChars;
    topics = elderObs.topics;
    sessionCount = p.totalSessions;
    summary = observationSummary(elder.name, elderObs.topics);
  } else {
    const o = overall;
    responsePct = o.avgResponseRate;
    uttChars = null; // 전체 평균 발화량은 별도 근거가 없으면 표시하지 않는다
    topics = o.topTopics;
    sessionCount = o.totalSessions;
    summary =
      o.topTopics.length > 0
        ? `담당 어르신들의 대화 참여가 이어지고 있어요. 관심 주제는 ${o.topTopics
            .slice(0, 2)
            .map((t) => t.label)
            .join('·')} 순으로 관찰됩니다.`
        : null;
  }

  const pctText = responsePct === null ? DASH : `${responsePct}%`;
  const uttLabel = uttChars === null ? DASH : uttChars >= 30 ? '많음' : uttChars >= 15 ? '보통' : '짧음';

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <View className="px-5">
        <DetailHeader title={title} />
      </View>
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-[13px] text-muted mt-1 mb-4">
          최근 3개월 · 대화에서 관찰된 값입니다. (효능·향상 지표가 아닙니다)
        </Text>

        {/* 관찰 지표 그리드 */}
        <View className="flex-row flex-wrap -m-1.5 mb-4">
          <Indicator label="대화 참여도" value={pctText} note="응답한 비율(관찰)" />
          <Indicator label="응답률" value={pctText} note="질문 대비 응답(관찰)" />
          <Indicator label="발화량" value={uttLabel} note="평균 발화 길이(관찰)" />
          <Indicator
            label="관심 주제 수"
            value={topics.length > 0 ? `${topics.length}개` : DASH}
            note="반응한 주제(관찰)"
          />
        </View>

        {/* 주제별 반응 */}
        <SectionTitle>주제별 반응(관찰)</SectionTitle>
        <View className="mb-6">
          {topics.length === 0 ? (
            <Text className="text-[14px] text-muted">아직 관찰된 주제 반응이 없어요.</Text>
          ) : (
            topics.map((t) => <TopicBar key={t.label} label={t.label} percent={t.percent} />)
          )}
        </View>

        {/* 활동량 */}
        <SectionTitle>대화 활동량</SectionTitle>
        <Card className="mb-6">
          <Text className="text-[15px] text-ink">
            최근 3개월간 총 <Text className="font-bold text-accent">{sessionCount}회</Text>의 대화가
            관찰되었습니다.
          </Text>
        </Card>

        {/* 관찰 의견 — 근거가 없으면 서술하지 않는다(실 AI 연동 시 이 자리에 LLM 요약) */}
        <Card>
          <Text className="text-[15px] font-semibold text-ink mb-2">AI 종합 의견</Text>
          <Text className="text-[15px] text-ink leading-[23px]">
            {summary ?? '대화 기록이 쌓이면 관찰된 내용을 정리해 드려요.'}
          </Text>
        </Card>

        <NonMedicalFootnote />
      </ScrollView>
    </SafeAreaView>
  );
}
