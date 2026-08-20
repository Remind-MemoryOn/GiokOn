// 어르신 프로필 폼 — Figma `56:337`(어르신 등록, 빈 상태)와 `15:7`(연대기 수정, 입력 상태)는
// **같은 화면의 두 상태**다(사용자 확정). 그래서 한 컴포넌트로 두고 제목·초기값·저장 동작만
// 화면이 넘긴다.
//
// Figma 실측 배치(프레임 393 / 빈 상태 높이 1200 · 입력 상태 1380 → 스크롤):
//   헤더 0..114 → 사진 (28,150) 126×130 → 첫 라벨 306 (사진 아래 26)
//   라벨 top 306·414·521·628·735·843·950 → pitch 108/107/107/107/108/107 (아래 ROW_GAPS)
//   주요 기억: 박스 986부터 pitch 60(46+14), 항목이 있으면 마지막에 "＋ 기억 추가"
//   마지막 요소 아래 62 → 저장하기 336×57 → 프레임 하단까지 49
//
// ⚠️ 값은 전부 실데이터 바인딩이다. 디자인의 "이순자 / 1945 / 전라북도 전주시" 등은
// 자리표시자이므로 코드에 넣지 않는다(실서비스 원칙).
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { isBirthDate, type ElderGender } from '@giokon/core';
import type { PickedPhoto } from '../data/elder-photo';
import { ScreenHeader } from './ScreenHeader';
import {
  DateField,
  MemoryList,
  PhotoField,
  SaveButton,
  SearchField,
  SelectField,
  TextField,
  type MemoryItem,
} from './form';
import { searchRegions } from '../lib/regions';

/** Figma 카운터에서 읽은 입력 상한(3/10 · 16/25 · 10/30 · 6/30). */
export const MAX = { name: 10, family: 25, job: 30, hobbies: 30 } as const;
/**
 * 행별 다음 라벨까지 여백 — Figma 의 라벨 top 이 정수 시퀀스(pitch 108/107/107/107/108/107)라
 * 균일 pitch 로 두면 최대 0.7px 누적 오차가 난다. 값을 그대로 박아 정확히 일치시킨다.
 */
const ROW_GAPS = [26, 25, 25, 25, 26, 25] as const;
/** 사진 아래 첫 라벨까지 · 마지막 요소 아래 저장 버튼까지 · 프레임 하단 여백. */
const PHOTO_TO_FIRST_LABEL = 26;
const CONTENT_TO_SAVE = 62;
const SAVE_TO_BOTTOM = 49;

export interface ProfileValues {
  name: string;
  /** 생년월일 `YYYY-MM-DD`(미선택은 빈 문자열). */
  birthDate: string;
  /** 미선택은 undefined — 임의값을 넣지 않는다(표기도 생략된다). */
  gender: ElderGender | undefined;
  hometown: string;
  family: string;
  job: string;
  hobbies: string;
}

/** 성별 선택 표기 ↔ DB enum. */
const GENDER_OPTIONS: string[] = ['여성', '남성'];
const GENDER_LABEL: Record<ElderGender, string> = { female: '여성', male: '남성' };
const GENDER_VALUE: Record<string, ElderGender> = { 여성: 'female', 남성: 'male' };

export const EMPTY_VALUES: ProfileValues = {
  name: '',
  birthDate: '',
  gender: undefined,
  hometown: '',
  family: '',
  job: '',
  hobbies: '',
};

export interface ProfileSubmit extends ProfileValues {
  memories: MemoryItem[];
  /** 새로 고른 사진(없으면 null → 사진 변경 없음). */
  pickedPhoto: PickedPhoto | null;
}

export function ProfileForm({
  title,
  sig,
  initial,
  initialMemories,
  photoUrl,
  saving,
  onSubmit,
}: {
  title: string;
  /**
   * 초기값 신선도 서명(예: `${elder.id}:${elder.updatedAt}`). 라이브 조회는 나중에
   * 도착하므로, 서명이 바뀌면 폼이 새 초기값을 채택하고 사용자가 고친 뒤에는 편집값을
   * 유지한다(effect 안에서 동기 setState 하지 않기 위한 파생 구조).
   */
  sig: string;
  initial: ProfileValues;
  initialMemories: MemoryItem[];
  /** 기존 사진 표시용 URL(없으면 null). */
  photoUrl: string | null;
  saving: boolean;
  onSubmit: (v: ProfileSubmit) => void;
}) {
  const [edited, setEdited] = useState<{ sig: string; values: ProfileValues } | null>(null);
  const values = edited?.sig === sig ? edited.values : initial;
  const set = (patch: Partial<ProfileValues>) => setEdited({ sig, values: { ...values, ...patch } });

  const memSig = `${sig}#${initialMemories.map((m) => m.key).join('|')}`;
  const [editedMem, setEditedMem] = useState<{ sig: string; items: MemoryItem[] } | null>(null);
  const memories = editedMem?.sig === memSig ? editedMem.items : initialMemories;

  const [picked, setPicked] = useState<PickedPhoto | null>(null);

  // 어르신 연령대(40~110세)에 해당하는 출생연도 범위.
  const nowYear = new Date().getFullYear();
  const maxYear = nowYear - 40;
  const minYear = nowYear - 110;

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('사진 접근 권한이 필요해요', '설정에서 사진 접근을 허용해 주세요.');
      return;
    }
    // base64 를 함께 받아 업로드에 쓴다 — RN 에서 file:// 을 fetch 하면 폴리필이
    // status 0 으로 Response 를 만들다 터진다(elder-photo.ts 주석 참조).
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [126, 130],
      quality: 0.8,
      base64: true,
    });
    const asset = res.canceled ? undefined : res.assets[0];
    if (asset?.uri) setPicked({ uri: asset.uri, base64: asset.base64 ?? null });
  };

  const submit = () => {
    if (values.name.trim().length === 0 || !isBirthDate(values.birthDate)) {
      Alert.alert('입력 확인', '이름과 생년월일을 입력해 주세요.');
      return;
    }
    onSubmit({ ...values, memories, pickedPhoto: picked });
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader title={title} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingLeft: 28, paddingTop: 36, paddingBottom: SAVE_TO_BOTTOM }}
        keyboardShouldPersistTaps="handled"
      >
        <PhotoField uri={picked?.uri ?? photoUrl} onPress={pickPhoto} />

        {/* 입력 박스는 Figma 에서 x29(사진은 x28) — 1px 차이를 그대로 둔다. */}
        <View style={{ marginLeft: 1, marginTop: PHOTO_TO_FIRST_LABEL }}>
          <TextField
            label="이름"
            required
            value={values.name}
            onChangeText={(t) => set({ name: t })}
            placeholder="이름을 입력해 주세요"
            maxLength={MAX.name}
            gap={ROW_GAPS[0]}
          />
          <DateField
            label="생년월일"
            required
            value={values.birthDate}
            placeholder="생년월일을 선택해 주세요"
            minYear={minYear}
            maxYear={maxYear}
            onSelect={(v) => set({ birthDate: v })}
            gap={ROW_GAPS[1]}
          />
          {/*
           * 성별 — Figma 폼에는 없지만 메인 카드·상세 프로필이 "81세 l 여성"으로 성별을
           * 표시한다(사용자 지적 2026-08-13). 입력받는 곳이 없으면 영원히 표기할 수 없어
           * 여기서 수집한다. 다른 행과 같은 프리미티브·같은 간격이라 폼 리듬은 유지된다.
           */}
          <SelectField
            label="성별"
            value={values.gender ? GENDER_LABEL[values.gender] : ''}
            placeholder="성별을 선택해 주세요"
            options={GENDER_OPTIONS}
            onSelect={(v) => set({ gender: GENDER_VALUE[v] })}
            gap={ROW_GAPS[1]}
          />
          <SearchField
            label="출신지"
            value={values.hometown}
            onChangeText={(t) => set({ hometown: t })}
            placeholder="출신 지역 검색하기"
            search={searchRegions}
            gap={ROW_GAPS[2]}
          />
          <TextField
            label="가족 구성"
            value={values.family}
            onChangeText={(t) => set({ family: t })}
            placeholder="가족 구성을 입력해 주세요"
            maxLength={MAX.family}
            gap={ROW_GAPS[3]}
          />
          <TextField
            label="직업 이력"
            value={values.job}
            onChangeText={(t) => set({ job: t })}
            placeholder="직업 이력을 입력해 주세요"
            maxLength={MAX.job}
            gap={ROW_GAPS[4]}
          />
          <TextField
            label="취미"
            value={values.hobbies}
            onChangeText={(t) => set({ hobbies: t })}
            placeholder="취미를 입력해 주세요"
            maxLength={MAX.hobbies}
            gap={ROW_GAPS[5]}
          />
          <MemoryList
            label="주요 기억"
            items={memories}
            setItems={(next) => setEditedMem({ sig: memSig, items: next })}
            placeholder="주요 기억을 입력해 주세요"
            addLabel="기억 추가"
            newKey={() => `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`}
          />

          <View style={{ marginTop: CONTENT_TO_SAVE }}>
            <SaveButton label="저장하기" onPress={submit} disabled={saving} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
