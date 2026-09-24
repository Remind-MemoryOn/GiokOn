// 설정 (Figma `584:470` 환경설정, 프레임 393×1072 — 스크롤)
//
// Figma 실측(@4x 픽셀 대조):
//   헤더 0..114 공용 ScreenHeader · 제목 "설정"
//   "프로필" SemiBold 14/18 @(34,148) + 연필 14 @(79,149)
//   로그아웃 SemiBold? Medium 12/21 #7b7c7c @(323,146) + 글리프 13 @(307,154)
//   프로필 카드 336×260 r10 흰색 border #e3e3e3 @(29,181)
//     아바타 79 원 @(56,204) · 이름 SemiBold 20/24 @(153,215) · 기관 Medium 16/21 #404040 @(153,250)
//     구분선 @(55,302) · "아이디" SemiBold 14/30 @(56,319) · 값 Regular 15/30 @(150,319)
//     구분선 @(55,365) · "간편 로그인" SemiBold 14/30 @(56,387) · 소셜 41.4 @(161·217.2·273, 380)
//   "담당 어르신 관리" SemiBold 14/17 @(34,474) · "전체보기" Medium 12/30 #404040 @(312,468) + chevron 6×7 @(359,480)
//   어르신 카드 336×113 @(29,509) pitch 134 (설정 화면은 최대 2장)
//   "정보" SemiBold 14/17 @(29,789) · 정보 카드 336×204 @(29,819)
//     개인정보처리방침 @(55,843) · 이용약관 @(56,905) · 앱 버전 정보 @(56,970) · v @(291,975)
//     구분선 @(55,889)·@(55,952) · chevron 8.75×13.25 @(319/321, 851/914)  ← Figma 가 2px 어긋나 320 으로 통일
//
// ⚠️ 값은 전부 실데이터다. Figma 의 "이지은 요양보호사 / gieokon / v.1.0.0" 은 자리표시자다.
//   - 아이디 = 로그인 이메일, 기관 = organizations.name, 버전 = app.json version
//   - 간편 로그인 = **실제로 연결된 provider 만** 진하게(연결 안 된 것은 흐리게) — 소셜 3종을
//     전부 컬러로 보여 주면 연결되지 않은 계정도 연결된 것처럼 보인다.
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useOrganization } from '@giokon/data';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import {
  Divider,
  LogoutGlyph,
  ManagedElderCard,
  RowChevron,
  SectionLabel,
  SETTINGS,
  SmallChevron,
} from '../../src/components/settings';
import { useAuth } from '../../src/auth/AuthProvider';
import { webUrl, WEB_ROUTES } from '../../src/lib/webUrl';
import { useElders } from '../../src/data/reads';
import { useDeleteElder } from '../../src/data/writes';
import { NO_VALUE } from '../../src/lib/format';
import { hasCaregiverPin } from '../../src/features/session/caregiverPin';
import { CaregiverPinModal } from '../../src/features/session/CaregiverPinModal';
import iconEdit from '../../assets/brand/icon-edit.png';
import socialNaver from '../../assets/brand/social-naver.png';
import socialKakao from '../../assets/brand/social-kakao.png';
import socialGoogle from '../../assets/brand/social-google.png';

/** 헤더 아이콘과 같은 터치 여유(작은 글리프를 누르기 쉽게). */
const TAP = 12;

/** 설정 화면에 미리 보여 주는 어르신 수(Figma 프레임에 2장). */
const PREVIEW_ELDERS = 2;

// 법적 문서는 웹이 담당한다 — 앱에는 화면이 없다. 주소·경로는 src/lib/webUrl 이 SoT.

const ROLE_LABEL: Record<string, string> = {
  caregiver: '요양보호사',
  org_admin: '관리자',
  guardian: '보호자',
};

/** Figma 소셜 아이콘 — 네이버·카카오는 41.4 정사각, 구글은 41×42. */
const SOCIALS = [
  { key: 'naver', src: socialNaver, label: '네이버', left: 161, w: 41.4, h: 41.4 },
  { key: 'kakao', src: socialKakao, label: '카카오', left: 217.2, w: 41.4, h: 41.4 },
  { key: 'google', src: socialGoogle, label: '구글', left: 273, w: 41, h: 42 },
] as const;

export default function Settings() {
  const { userRow, user, authed, signOut } = useAuth();
  // 어르신 화면 복귀 PIN(기기 보안 저장소, 요양보호사별) — null = 확인 중/확인 실패.
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [pinEditing, setPinEditing] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    hasCaregiverPin(user.id).then((v) => { if (alive) setPinSet(v); }, () => { if (alive) setPinSet(null); });
    return () => { alive = false; };
  }, [user?.id, pinEditing]);
  // 목업 모드·로그인 전에는 조회하지 않는다(초기화 전 호출 방지).
  const org = useOrganization({ enabled: authed });
  const elders = useElders();
  const deleteElder = useDeleteElder();

  /** 실제로 연결된 소셜 provider(Supabase identities). 이메일 로그인만이면 빈 집합. */
  const linked = useMemo(() => {
    const ids = (user?.identities ?? []).map((i) => i.provider);
    return new Set(ids);
  }, [user]);

  const roleLabel = ROLE_LABEL[userRow?.role ?? ''] ?? '요양보호사';
  const displayName = userRow?.name ? `${userRow.name} ${roleLabel}` : roleLabel;
  const orgName = org.data?.name ?? null;
  const loginId = userRow?.email ?? user?.email ?? NO_VALUE;
  const version = Constants.expoConfig?.version ?? NO_VALUE;

  const openWeb = (path: string, what: string) => {
    const href = webUrl(path);
    if (!href) {
      Alert.alert(what, `${what}은(는) 웹에서 확인할 수 있어요.`);
      return;
    }
    void Linking.openURL(href);
  };

  const confirmDelete = (id: string, name: string) => {
    Alert.alert(
      `${name} 어르신을 삭제할까요?`,
      '연대기·대화 기록·분석·사진까지 모두 지워지고 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteElder(id);
            } catch (e) {
              Alert.alert('삭제 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader title="설정" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingLeft: SETTINGS.left, paddingTop: 34, paddingBottom: 49 }}
      >
        {/* ── 프로필 ─────────────────────────────────────────── */}
        <View style={{ width: SETTINGS.cardW }}>
          <SectionLabel label="프로필" lineHeight={18} />
          {/*
           * 터치 여유는 padding 이 아니라 **박스를 키우고 자식을 절대 배치**해서 준다 —
           * RN 은 absolute 자식을 테두리 안쪽 기준으로 놓아 padding 이 좌표를 밀지 않고,
           * 자식이 전부 absolute 면 padding 만으로는 크기도 생기지 않는다.
           */}
          <Pressable
            onPress={() =>
              Alert.alert('프로필 수정', '프로필 정보 수정은 웹에서 진행해 주세요.')
            }
            accessibilityRole="button"
            accessibilityLabel="프로필 수정"
            className="absolute active:opacity-60"
            style={{ left: 79 - SETTINGS.left - TAP, top: 149 - 148 - TAP, width: 14 + TAP * 2, height: 14 + TAP * 2 }}
          >
            <Image
              source={iconEdit}
              style={{ position: 'absolute', left: TAP, top: TAP, width: 14, height: 14 }}
              resizeMode="contain"
            />
          </Pressable>

          {/* 로그아웃 — 글리프 13 @(307,154) · 라벨 Medium 12/21 @(323,146) */}
          <Pressable
            onPress={() => {
              const pending = signOut();
              router.replace('/');
              void pending.catch(() => {});
            }}
            accessibilityRole="button"
            accessibilityLabel="로그아웃"
            className="absolute active:opacity-60"
            style={{ left: 307 - SETTINGS.left - TAP, top: 146 - 148 - TAP, width: 58 + TAP * 2, height: 21 + TAP * 2 }}
          >
            <View style={{ position: 'absolute', left: TAP, top: TAP + 8 }}>
              <LogoutGlyph />
            </View>
            {/*
             * Figma 텍스트 박스는 146(h21)인데 실제 잉크는 155.25 에 있다 — 박스 높이가
             * lineHeight 와 다르다. 잉크를 맞추려고 박스를 4 내려 둔다(@4x 대조 Δ0).
             */}
            <Text
              className="absolute text-[12px] font-medium"
              style={{ left: TAP + 16, top: TAP + 4, lineHeight: 21, color: SETTINGS.muted }}
            >
              로그아웃
            </Text>
          </Pressable>
        </View>

        {/* 프로필 카드 — 라벨(148..166) 아래 15 */}
        <View
          style={{
            width: SETTINGS.cardW,
            height: 260,
            marginTop: 15,
            borderRadius: SETTINGS.cardR,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: SETTINGS.cardBorder,
          }}
        >
          {/* 아바타 79 원 — users 에 사진 컬럼이 없으므로 이니셜로 표시한다 */}
          <View
            className="absolute items-center justify-center"
            style={{
              left: 26,
              top: 22,
              width: 79,
              height: 79,
              borderRadius: 39.5,
              backgroundColor: '#f0efee',
            }}
          >
            <Text className="text-[30px] font-semibold" style={{ color: SETTINGS.muted }}>
              {(userRow?.name ?? '').trim().slice(0, 1) || '?'}
            </Text>
          </View>

          <Text
            className="absolute text-[20px] font-semibold text-black"
            style={{ left: 123, top: 33, lineHeight: 24, width: 200 }}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <Text
            className="absolute text-[16px] font-medium"
            style={{ left: 123, top: 68, lineHeight: 21, color: SETTINGS.strong, width: 200 }}
            numberOfLines={1}
          >
            {orgName ?? NO_VALUE}
          </Text>

          <Divider top={120} />
          <Text
            className="absolute text-[14px] font-semibold text-black"
            style={{ left: 26, top: 137, lineHeight: 30 }}
          >
            아이디
          </Text>
          <Text
            className="absolute text-[15px] font-normal text-black"
            style={{ left: 120, top: 137, lineHeight: 30, width: 190 }}
            numberOfLines={1}
          >
            {loginId}
          </Text>

          <Divider top={183} />
          <Text
            className="absolute text-[14px] font-semibold text-black"
            style={{ left: 26, top: 205, lineHeight: 30 }}
          >
            간편 로그인
          </Text>
          {SOCIALS.map((s) => {
            const on = linked.has(s.key);
            return (
              <Image
                key={s.key}
                source={s.src}
                style={{
                  position: 'absolute',
                  left: s.left - SETTINGS.left - 1,
                  top: 198,
                  width: s.w,
                  height: s.h,
                  // 연결되지 않은 provider 를 컬러로 두면 연결된 것처럼 보인다 → 흐리게.
                  opacity: on ? 1 : 0.25,
                }}
                resizeMode="contain"
                accessibilityLabel={`${s.label} 간편 로그인 ${on ? '연결됨' : '연결 안 됨'}`}
              />
            );
          })}
        </View>

        {/* ── 담당 어르신 관리 ────────────────────────────────── */}
        <View style={{ width: SETTINGS.cardW, marginTop: 33 }}>
          <SectionLabel label="담당 어르신 관리" />
          {/* 전체보기 — 라벨 Medium 12/30 @(312,468) · chevron 6×7 @(359,480) */}
          <Pressable
            onPress={() => router.push('/settings/elders')}
            accessibilityRole="button"
            accessibilityLabel="담당 어르신 전체보기"
            className="absolute active:opacity-60"
            style={{ left: 312 - SETTINGS.left - TAP, top: 468 - 474 - TAP, width: 53 + TAP * 2, height: 30 + TAP * 2 }}
          >
            <Text
              className="absolute text-[12px] font-medium"
              style={{ left: TAP, top: TAP, lineHeight: 30, color: SETTINGS.strong }}
            >
              전체보기
            </Text>
            <View style={{ position: 'absolute', left: TAP + 47, top: TAP + 12 }}>
              <SmallChevron />
            </View>
          </Pressable>
        </View>

        {/* 라벨(474..491) 아래 18 */}
        {elders.length === 0 ? (
          <Text
            className="text-[14px] font-normal"
            style={{ marginTop: 18, lineHeight: 25, color: SETTINGS.muted }}
          >
            아직 담당 어르신이 없어요.
          </Text>
        ) : (
          elders.slice(0, PREVIEW_ELDERS).map((e, i) => (
            <View key={e.id} style={{ marginTop: i === 0 ? 18 : SETTINGS.elderGap }}>
              <ManagedElderCard
                elder={e}
                orgName={orgName}
                onPress={() => router.push(`/elder/${e.id}`)}
                onDelete={() => confirmDelete(e.id, e.name)}
              />
            </View>
          ))
        )}

        {/* ── 정보 ───────────────────────────────────────────── */}
        <SectionLabel label="정보" left={29} style={{ marginTop: 33 }} />

        {/* 라벨(789..806) 아래 13 */}
        <View
          style={{
            width: SETTINGS.cardW,
            height: 204,
            marginTop: 13,
            borderRadius: SETTINGS.cardR,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: SETTINGS.cardBorder,
          }}
        >
          <Pressable
            onPress={() => openWeb(WEB_ROUTES.privacy, '개인정보처리방침')}
            accessibilityRole="button"
            className="absolute active:opacity-60"
            style={{ left: 0, top: 12, right: 0, height: 52, justifyContent: 'center' }}
          >
            <Text
              className="absolute text-[14px] font-semibold text-black"
              style={{ left: 25, top: 11, lineHeight: 30 }}
            >
              개인정보처리방침
            </Text>
            <View style={{ position: 'absolute', left: 290, top: 19 }}>
              <RowChevron />
            </View>
          </Pressable>

          <Divider top={69} />

          <Pressable
            onPress={() => openWeb(WEB_ROUTES.terms, '이용약관')}
            accessibilityRole="button"
            className="absolute active:opacity-60"
            style={{ left: 0, top: 74, right: 0, height: 52, justifyContent: 'center' }}
          >
            <Text
              className="absolute text-[14px] font-semibold text-black"
              style={{ left: 26, top: 11, lineHeight: 30 }}
            >
              이용약관
            </Text>
            <View style={{ position: 'absolute', left: 290, top: 20 }}>
              <RowChevron />
            </View>
          </Pressable>

          <Divider top={132} />

          <Text
            className="absolute text-[14px] font-semibold text-black"
            style={{ left: 26, top: 150, lineHeight: 30 }}
          >
            앱 버전 정보
          </Text>
          <Text
            className="absolute text-[14px] font-normal"
            style={{ left: 261, top: 155, lineHeight: 25, color: SETTINGS.muted }}
          >
            v.{version}
          </Text>
        </View>

        {/* ── 어르신 화면 ─────────────────────────────────────────
         * 시안에 없는 섹션(계획 M4 복귀 게이트) — 위 정보 카드와 같은 카드·행 스타일로 최소 구현. */}
        <SectionLabel label="어르신 화면" left={29} style={{ marginTop: 33 }} />
        <View
          style={{
            width: SETTINGS.cardW,
            height: 64,
            marginTop: 13,
            marginBottom: 40,
            borderRadius: SETTINGS.cardR,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: SETTINGS.cardBorder,
          }}
        >
          <Pressable
            onPress={() => { if (user?.id) setPinEditing(true); }}
            accessibilityRole="button"
            accessibilityLabel="요양보호사 PIN 정하기"
            className="absolute active:opacity-60"
            style={{ left: 0, top: 6, right: 0, height: 52, justifyContent: 'center' }}
          >
            <Text
              className="absolute text-[14px] font-semibold text-black"
              style={{ left: 26, top: 11, lineHeight: 30 }}
            >
              요양보호사 PIN
            </Text>
            <Text
              className="absolute text-[14px] font-normal"
              style={{ right: 44, top: 13, lineHeight: 25, color: SETTINGS.muted }}
            >
              {pinSet === null ? NO_VALUE : pinSet ? '바꾸기' : '정하기'}
            </Text>
            <View style={{ position: 'absolute', left: 290, top: 19 }}>
              <RowChevron />
            </View>
          </Pressable>
        </View>
      </ScrollView>
      {user?.id ? (
        <CaregiverPinModal
          visible={pinEditing}
          mode="setup"
          userId={user.id}
          onDone={() => {
            setPinEditing(false);
            Alert.alert('PIN을 정했어요', '어르신 화면에서 돌아올 때 이 숫자를 눌러 주세요.');
          }}
          onCancel={() => setPinEditing(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}
