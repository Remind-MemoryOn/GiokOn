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
import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from './ScreenHeader';
import {
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
  birthYear: string;
  hometown: string;
  family: string;
  job: string;
  hobbies: string;
}

export const EMPTY_VALUES: ProfileValues = {
  name: '',
  birthYear: '',
  hometown: '',
  family: '',
  job: '',
  hobbies: '',
};

export interface ProfileSubmit extends ProfileValues {
  memories: MemoryItem[];
  /** 새로 고른 로컬 사진 uri(없으면 null → 사진 변경 없음). */
  pickedPhotoUri: string | null;
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

  const [picked, setPicked] = useState<string | null>(null);

  // 어르신 연령대(40~110세)에 해당하는 출생연도만 최신순으로.
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 71 }, (_, i) => String(now - 40 - i));
  }, []);

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('사진 접근 권한이 필요해요', '설정에서 사진 접근을 허용해 주세요.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [126, 130],
      quality: 0.8,
    });
    if (!res.canceled && res.assets[0]?.uri) setPicked(res.assets[0].uri);
  };

  const submit = () => {
    if (values.name.trim().length === 0 || !/^\d{4}$/.test(values.birthYear.trim())) {
      Alert.alert('입력 확인', '이름과 출생연도를 입력해 주세요.');
      return;
    }
    onSubmit({ ...values, memories, pickedPhotoUri: picked });
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScreenHeader title={title} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingLeft: 28, paddingTop: 36, paddingBottom: SAVE_TO_BOTTOM }}
        keyboardShouldPersistTaps="handled"
      >
        <PhotoField uri={picked ?? photoUrl} onPress={pickPhoto} />

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
          <SelectField
            label="출생연도"
            required
            value={values.birthYear}
            placeholder="출생연도를 선택해 주세요"
            options={years}
            onSelect={(v) => set({ birthYear: v })}
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
