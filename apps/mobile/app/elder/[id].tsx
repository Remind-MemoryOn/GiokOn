// 어르신 상세 — Figma 3프레임을 탭으로 통합:
//   프로필   `56:214` (393×950)
//   세션 기록 `75:177` (393×852)
//   종합 분석 `130:388` (393×950)
// 헤더(0..155: 뒤로·제목·우측 액션·탭)는 세 프레임이 동일해 ScreenHeader(tabs) 로 공용.
//
// Figma 실측 배치(헤더 아래 155 부터):
//   [프로필] 사진 191 → 이름 331 → 메타 362 → 정보카드 412 → 주요 기억 684 → 칩 723/771
//            → 대화 시작하기 844 (프레임 하단 49)
//   [세션 기록] 카드 199 부터 pitch 138
//   [종합 분석] 제목 182 → 타일 226 → 구분선 370 → TOP5 제목 394 → 막대 433~ →
//            구분선 618 → AI 의견 640 → 인지 효과 분석 보기 844
//
// ⚠️ 표시값은 전부 실데이터다. 근거가 없으면 '—'/빈 상태로 두고 값을 만들지 않는다.
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  birthLabel,
  canStartElderSession,
  elderAge,
  initial,
  observationSummary,
} from '@giokon/core';
import { DETAIL_TABS, ScreenHeader } from '../../src/components/ScreenHeader';
import {
  AiOpinion,
  DETAIL,
  Divider,
  InfoCard,
  MemoryChip,
  SectionHeading,
  SessionCard,
  StatTile,
  TopicBar,
  topicBarLayout,
} from '../../src/components/detail';
import {
  useChronicles,
  useElder,
  useElderConsents,
  useElderLogs,
  useElderSessions,
  useElderView,
} from '../../src/data/reads';
import { useElderObservations } from '../../src/data/observations';
import { useElderPhotoUrl } from '../../src/data/elder-photo';
import { genderLabel, metric, NO_VALUE } from '../../src/lib/format';
import iconEdit from '../../assets/brand/icon-edit.png';
import iconShare from '../../assets/brand/icon-share.png';
import statTime from '../../assets/brand/stat-time.png';
import statCount from '../../assets/brand/stat-count.png';
import statRate from '../../assets/brand/stat-rate.png';

type Tab = 'profile' | 'sessions' | 'analysis';

/** 프레임 하단 여백(저장·시작 버튼 아래). */
const BOTTOM = 49;

export default function ElderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { elder, loading } = useElderView(id);
  const [tab, setTab] = useState<Tab>('profile');

  // 우측 액션: 프로필·세션 기록 = 연필(연대기 수정) / 종합 분석 = 공유(Figma 동일)
  const isAnalysis = tab === 'analysis';

  // 조회 중에는 "없음"이라고 단정하지 않는다 — 등록 직후 이동하면 상세 쿼리가 아직
  // 비어 있어서 방금 만든 어르신이 없는 것처럼 보였다(사용자 지적 2026-08-13).
  if (!elder || !id) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <ScreenHeader title="어르신 상세" />
        {loading ? (
          <ActivityIndicator color={DETAIL.accent} style={{ marginTop: 60 }} />
        ) : (
          <Text className="text-[18px] font-normal text-muted text-center" style={{ marginTop: 60 }}>
            어르신을 찾을 수 없어요.
          </Text>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader
        title="어르신 상세"
        rightIcon={isAnalysis ? iconShare : iconEdit}
        rightIconSize={isAnalysis ? { width: 18, height: 20 } : { width: 18, height: 18 }}
        rightIconTop={isAnalysis ? 74 : 75}
        rightLabel={isAnalysis ? '보호자 공유 안내' : '연대기 수정'}
        onRight={() =>
          isAnalysis
            ? Alert.alert('보호자 공유', '보호자에게 보이는 기록은 관리 웹에서 승인한 뒤 공개됩니다.')
            : router.push(`/chronicle/${id}`)
        }
        tabs={DETAIL_TABS}
        activeTab={tab}
        onTab={(k) => setTab(k as Tab)}
      />
      {tab === 'profile' ? <ProfileTab elderId={id} /> : null}
      {tab === 'sessions' ? <SessionsTab elderId={id} /> : null}
      {tab === 'analysis' ? <AnalysisTab elderId={id} /> : null}
    </SafeAreaView>
  );
}

// ── 프로필 탭 (Figma 56:214) ──────────────────────────────────
function ProfileTab({ elderId }: { elderId: string }) {
  const elder = useElder(elderId);
  const chronicles = useChronicles(elderId);
  const consents = useElderConsents(elderId);
  const photoUrl = useElderPhotoUrl(elder?.photoPath);
  if (!elder) return null;

  const gender = genderLabel(elder.gender);
  const meta = gender ? `${elderAge(elder)}세   l   ${gender}` : `${elderAge(elder)}세`;
  // 값이 없는 항목은 '—'(미입력) — 임의값을 만들지 않는다.
  const rows = [
    { label: '생년월일', value: birthLabel(elder) },
    { label: '출신지', value: elder.hometown ?? NO_VALUE },
    { label: '가족 구성', value: elder.family ?? NO_VALUE },
    { label: '직업 이력', value: elder.job ?? NO_VALUE },
    { label: '취미', value: elder.hobbies ?? NO_VALUE },
  ];

  const startTalk = () => {
    if (canStartElderSession(consents)) router.push(`/session/start?id=${elder.id}`);
    else router.push(`/consent/${elder.id}`);
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingLeft: DETAIL.left, paddingTop: 36, paddingBottom: BOTTOM }}
    >
      {/* 사진 124 원형 — 없으면 이니셜 아바타(임의 사진 금지) */}
      <View style={{ width: DETAIL.width, alignItems: 'center' }}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: 124, height: 124, borderRadius: 62 }}
            resizeMode="cover"
            accessibilityLabel={`${elder.name} 어르신 사진`}
          />
        ) : (
          <View
            style={{
              width: 124,
              height: 124,
              borderRadius: 62,
              backgroundColor: elder.avatarColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text className="text-[36px] font-bold text-white">{initial(elder.name)}</Text>
          </View>
        )}
        <Text
          className="text-[22px] font-semibold text-black text-center"
          style={{ lineHeight: 30, marginTop: 16 }}
        >
          {elder.name} 어르신
        </Text>
        <Text
          className="text-[18px] font-medium text-muted text-center"
          style={{ lineHeight: 30, marginTop: 0.75 }}
        >
          {meta}
        </Text>
      </View>

      <View style={{ marginTop: 20.25 }}>
        <InfoCard rows={rows} />
      </View>

      <Text className="text-[15px] font-semibold text-black" style={{ lineHeight: 30, marginTop: 23 }}>
        주요 기억 ({chronicles.length})
      </Text>

      {chronicles.length === 0 ? (
        <Text className="text-[15px] font-normal text-muted" style={{ lineHeight: 30, marginTop: 9 }}>
          아직 기록된 기억이 없어요.
        </Text>
      ) : (
        <View
          className="flex-row flex-wrap"
          style={{ width: DETAIL.width, marginTop: 9, columnGap: 21, rowGap: 13 }}
        >
          {chronicles.map((c) => (
            <MemoryChip key={c.id} text={c.content} />
          ))}
        </View>
      )}

      <Pressable
        onPress={startTalk}
        accessibilityRole="button"
        className="items-center justify-center active:opacity-90"
        style={{
          width: DETAIL.width,
          height: 57,
          borderRadius: 10,
          backgroundColor: DETAIL.accent,
          marginTop: 38,
        }}
      >
        <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
          대화 시작하기
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ── 세션 기록 탭 (Figma 75:177) ───────────────────────────────
function SessionsTab({ elderId }: { elderId: string }) {
  const sessions = useElderSessions(elderId);
  const logs = useElderLogs(elderId);

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingLeft: DETAIL.left, paddingTop: 44, paddingBottom: 44 }}
    >
      {sessions.length === 0 ? (
        <Text className="text-[16px] font-normal text-muted" style={{ lineHeight: 30 }}>
          아직 세션 기록이 없어요.
        </Text>
      ) : (
        sessions.map((s, i) => {
          const log = logs.find((l) => l.sessionId === s.id) ?? logs.find((l) => l.id === s.id);
          return (
            <View key={s.id} style={{ marginBottom: i === sessions.length - 1 ? 0 : 30 }}>
              <SessionCard
                title={s.title}
                dateLabel={s.createdAt.slice(0, 10).replace(/-/g, '. ')}
                durationLabel={metric(s.durationMinutes || null, '분')}
                onPress={log ? () => router.push(`/log/${log.id}`) : undefined}
              />
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

// ── 종합 분석 탭 (Figma 130:388) ──────────────────────────────
function AnalysisTab({ elderId }: { elderId: string }) {
  const elder = useElder(elderId);
  // 관찰지표는 @giokon/core 순수 집계(어댑터가 live/mock 데이터 주입).
  const obs = useElderObservations(elderId);
  if (!elder) return null;
  const part = obs.participation;
  const top5 = obs.topics.slice(0, 5);
  // 라벨이 잘리지 않도록 실제 주제명 길이에 맞춰 라벨 칸/트랙을 조정한다.
  const barLayout = topicBarLayout(
    top5.map((t) => t.label),
    { labelInset: 3, labelWidth: 41, percentGap: 19 },
  );
  const summary = observationSummary(elder.name, obs.topics);

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingLeft: DETAIL.left, paddingTop: 27, paddingBottom: BOTTOM }}
    >
      <SectionHeading>종합 대화 참여도</SectionHeading>

      {/* 타일 좌우 끝을 29/365 에 고정(간격 13.5) — Figma 는 145/146 이 섞여 있다 */}
      <View className="flex-row justify-between" style={{ width: DETAIL.width, marginTop: 14 }}>
        <StatTile
          icon={statTime}
          iconSize={{ width: 24, height: 24 }}
          label="평균 대화 시간"
          value={metric(part.avgMinutes, '분')}
        />
        <StatTile
          icon={statCount}
          iconSize={{ width: 26, height: 25.25 }}
          label="총 대화 횟수"
          value={`${part.totalSessions}회`}
        />
        <StatTile
          icon={statRate}
          iconSize={{ width: 24, height: 24 }}
          label="평균 응답률"
          value={metric(part.avgResponseRate, '%')}
        />
      </View>

      <View style={{ marginTop: 29 }}>
        <Divider />
      </View>

      <View style={{ marginTop: 23 }}>
        <SectionHeading>종합 관심 주제 TOP 5</SectionHeading>
      </View>

      <View style={{ marginTop: 9 }}>
        {top5.length === 0 ? (
          <Text className="text-[13px] font-normal text-muted" style={{ lineHeight: 30 }}>
            아직 관찰된 주제가 없어요.
          </Text>
        ) : (
          top5.map((t, i) => (
            <TopicBar key={t.label} label={t.label} percent={t.percent} rank={i} {...barLayout} />
          ))
        )}
      </View>

      <View style={{ marginTop: 23.75 }}>
        <Divider />
      </View>

      {/* 근거가 없으면 서술하지 않는다(실 AI 연동 시 이 자리에 LLM 요약이 들어온다) */}
      <View style={{ marginTop: 21 }}>
        <AiOpinion
          paragraphs={summary ? [summary] : ['대화 기록이 쌓이면 관찰된 내용을 정리해 드려요.']}
        />
      </View>

      <Pressable
        onPress={() => router.push(`/observations?scope=elder&id=${elderId}`)}
        accessibilityRole="button"
        className="items-center justify-center active:opacity-90"
        style={{
          width: DETAIL.width,
          height: 57,
          borderRadius: 10,
          backgroundColor: DETAIL.accent,
          marginTop: 27,
        }}
      >
        {/* Figma 카피 그대로. 비의료 카피 정책과의 충돌은 사용자가 "보류" 결정(2026-08-12) */}
        <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
          인지 효과 분석 보기
        </Text>
      </Pressable>
    </ScrollView>
  );
}
