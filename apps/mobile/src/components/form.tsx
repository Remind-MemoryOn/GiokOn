// 프로필 폼 프리미티브 (Figma `56:337` 어르신 등록 / `15:7` 연대기 수정 —
// **같은 화면의 빈 상태·입력 상태**).
//
// Figma 실측(프레임 393. 폼은 스크롤 화면이라 절대 배치가 아니라 흐름 배치로 둔다):
//   라벨      SemiBold 20/30 검정 @ left 29 · 필수 ✱ 8×8.25 #e9822b (라벨 우측 2, top 6.75)
//   라벨→박스 6
//   입력 박스 336×46 r10 #f4f4f4 @ left 29
//   값        Regular 18/30 검정 @ 박스 내 left 16 (박스 top+8)
//   안내문구  Regular 16/30 #7b7c7c @ 같은 자리      ← 값과 **크기가 다르다**(18 vs 16)
//   글자수    Regular 16/30 #7b7c7c @ 박스 내 우측 21 ← 값이 있을 때만(빈 상태엔 없다)
//   행 간격   라벨top 306·414·521·628·735·843·950 (pitch 108/107/107/107/108/107)
//   드롭다운  ∨ 14.14×9.54 @ 박스 우측 21.9 · 검색 🔍 19×20.31 @ 박스 우측 21
//   달력      🗓 19×19 @ 박스 우측 20 (생년월일 — 누르면 Figma `568:286` 캘린더)
//   주요 기억 행 pitch 60(= 46+14) · 삭제 X 13.7 @ 우측 21 · ＋ 16 @ 박스 내 left 18
//   사진      126×130 r14 #f5f5f5 border #e3e3e3 · 아이콘 중앙(빈=사진추가 / 채움=수정)
//   저장하기  336×57 r10 #e9822b · 라벨 SemiBold 18/30 흰색
//
// RN 은 TextInput 의 placeholder 를 값과 다른 크기로 줄 수 없어 안내문구는 별도 Text 를
// 겹쳐 그린다(Figma 16px 유지). 카운터도 Figma 처럼 **박스 안** 우측에 둔다.
import { useMemo, useState, type ReactNode } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { birthSlashLabel } from '@giokon/core';
import { Calendar } from './Calendar';
import iconRequired from '../../assets/brand/icon-required.png';
import iconChevronDown from '../../assets/brand/icon-chevron-down.png';
import iconFieldSearch from '../../assets/brand/icon-field-search.png';
import iconXSmall from '../../assets/brand/icon-x-small.png';
import iconPlus from '../../assets/brand/icon-plus.png';
import iconPhotoAdd from '../../assets/brand/icon-photo-add.png';
import iconPhotoEdit from '../../assets/brand/icon-photo-edit.png';

/**
 * 주요 기억 한 항목의 최대 길이 — DB `chronicle_entries_content_check`(2000자)와 같다.
 * 다른 필드(이름 10·가족 25·직업 30·취미 30)와 달리 Figma 에 카운터가 없어 상한 표시는
 * 하지 않지만, 넘겨서 입력하면 저장 시 날것의 DB 오류가 뜨므로 입력 단계에서 막는다.
 */
const MEMORY_MAX = 2000;

/**
 * Figma 폼 상수 — scripts/check-figma-spec.mjs 가 이 값을 검사한다.
 * `fieldW` 는 393 폭 기준값이다. 화면에서는 입력 박스·저장 버튼이 화면 좌우 여백 안에서 늘어나고
 * 박스 안 오른쪽 아이콘은 오른쪽 끝 기준이라 함께 따라간다(기기 폭 대응, src/lib/layout.ts).
 */
export const FORM = {
  left: 29,
  fieldW: 336,
  fieldH: 46,
  fieldR: 10,
  fieldBg: '#f4f4f4',
  labelGap: 6,
  valueInset: 16,
  counterInset: 21,
  // Figma 의 라벨 top 은 306·414·521·628·735·843·950 (간격 108/107/107/107/108/107)이라
  // 균일 pitch 가 아니다. 기본 25(=pitch 107)로 두고 108 인 행만 호출부가 26 을 넘긴다.
  rowGap: 25,
  memoryGap: 14,
  photo: { w: 126, h: 130, r: 14, bg: '#f5f5f5', border: '#e3e3e3' },
} as const;

const boxWrapStyle = { marginTop: FORM.labelGap } as const;
const valueClass = 'text-[18px] font-normal text-black';
const valueStyle = { lineHeight: 30, padding: 0 } as const;

// ── 라벨 ──────────────────────────────────────────────────────
function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <View className="flex-row items-start">
      <Text className="text-[20px] font-semibold text-black" style={{ lineHeight: 30 }}>
        {label}
      </Text>
      {required ? (
        <Image
          source={iconRequired}
          style={{ width: 8, height: 8.25, marginLeft: 2, marginTop: 6.75 }}
          resizeMode="contain"
          accessibilityLabel="필수"
        />
      ) : null}
    </View>
  );
}

// ── 입력 박스(껍데기) ─────────────────────────────────────────
function FieldBox({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const style = {
    alignSelf: 'stretch',
    height: FORM.fieldH,
    borderRadius: FORM.fieldR,
    backgroundColor: FORM.fieldBg,
  } as const;
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-80" style={style}>
      {children}
    </Pressable>
  ) : (
    <View style={style}>{children}</View>
  );
}

/** 박스 안 안내문구(Regular 16) — 값이 비었을 때만. 터치는 아래 TextInput 으로 통과. */
function Placeholder({ text }: { text: string }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: FORM.valueInset, top: 8 }}>
      <Text className="text-[16px] font-normal text-muted" style={{ lineHeight: 30 }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * 생년월일 필드의 달력 아이콘 — Figma 19×19 벡터(`568:46`/`568:48`).
 * egress 정책상 figma.com 에셋을 못 받아 같은 치수로 그린다. 색은 같은 필드의 검색
 * 아이콘 에셋에서 뽑은 회색(#c8c8c8).
 */
function CalendarGlyph() {
  const c = '#c8c8c8';
  return (
    <Svg width={19} height={19}>
      <Rect x={1} y={3.6} width={17} height={14.4} rx={2.6} stroke={c} strokeWidth={1.4} fill="none" />
      <Line x1={1} y1={8.2} x2={18} y2={8.2} stroke={c} strokeWidth={1.4} />
      <Line x1={5.6} y1={1.4} x2={5.6} y2={5.2} stroke={c} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={13.4} y1={1.4} x2={13.4} y2={5.2} stroke={c} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

/** 박스 안 우측 글자수(Regular 16) — 값이 있을 때만. */
function Counter({ length, max }: { length: number; max: number }) {
  if (length === 0) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: FORM.counterInset, top: 8 }}>
      <Text className="text-[16px] font-normal text-muted" style={{ lineHeight: 30 }}>
        {length}/{max}
      </Text>
    </View>
  );
}

// ── 일반 입력 ─────────────────────────────────────────────────
export function TextField({
  label,
  required = false,
  value,
  onChangeText,
  placeholder,
  maxLength,
  keyboardType,
  gap = FORM.rowGap,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  maxLength: number;
  keyboardType?: KeyboardTypeOptions;
  /** 다음 행까지 여백(Figma 정수 시퀀스 — 기본 25, 108 pitch 행은 26). */
  gap?: number;
}) {
  return (
    <View style={{ marginBottom: gap }}>
      <FieldLabel label={label} required={required} />
      <View style={boxWrapStyle}>
        <FieldBox>
          <TextInput
            value={value}
            onChangeText={(t) => onChangeText(t.slice(0, maxLength))}
            keyboardType={keyboardType}
            accessibilityLabel={label}
            className={`absolute ${valueClass}`}
            style={{ ...valueStyle, left: FORM.valueInset, right: FORM.counterInset + 30, top: 8, height: 30 }}
          />
          {value.length === 0 ? <Placeholder text={placeholder} /> : null}
          <Counter length={value.length} max={maxLength} />
        </FieldBox>
      </View>
    </View>
  );
}

// ── 선택(드롭다운) — 성별 등 단일 목록 ────────────────────────
export function SelectField({
  label,
  required = false,
  value,
  placeholder,
  options,
  onSelect,
  gap = FORM.rowGap,
}: {
  label: string;
  required?: boolean;
  value: string;
  placeholder: string;
  options: string[];
  onSelect: (v: string) => void;
  gap?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: gap }}>
      <FieldLabel label={label} required={required} />
      <View style={boxWrapStyle}>
        <FieldBox onPress={() => setOpen(true)}>
          {value.length === 0 ? (
            <Placeholder text={placeholder} />
          ) : (
            <Text className={`absolute ${valueClass}`} style={{ ...valueStyle, left: FORM.valueInset, top: 8 }}>
              {value}
            </Text>
          )}
          <Image
            source={iconChevronDown}
            style={{ position: 'absolute', right: 21.9, top: 18, width: 14.14, height: 9.54 }}
            resizeMode="contain"
          />
        </FieldBox>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
          onPress={() => setOpen(false)}
        >
          <View
            className="bg-white"
            style={{ borderTopLeftRadius: 14, borderTopRightRadius: 14, maxHeight: '60%', paddingVertical: 12 }}
          >
            <Text
              className="text-[18px] font-semibold text-black text-center"
              style={{ lineHeight: 30, marginBottom: 8 }}
            >
              {label}
            </Text>
            <FlatList
              data={options}
              keyExtractor={(o) => o}
              initialNumToRender={20}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  className="active:opacity-70"
                  style={{ height: 46, justifyContent: 'center', paddingHorizontal: FORM.left }}
                >
                  <Text
                    className={`text-[18px] font-normal ${item === value ? 'text-accent' : 'text-black'}`}
                    style={{ lineHeight: 30 }}
                  >
                    {item}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── 날짜 선택 — 생년월일 ──────────────────────────────────────
/**
 * 생년월일 필드 (Figma 어르신 등록 `56:337` / 연대기 수정 `15:7`).
 *
 * Figma 실측: 라벨 "생년월일" @(29,414) · 박스 336×46 @(29,450) · 값/안내문구 @(45,458)
 *   우측 달력 아이콘 19×19 @(326,463) = 박스 우측 20 · 세로 중앙
 *   값 표기는 "1945 / 5 / 13" (년월일 한자 없이 슬래시 구분 — core birthSlashLabel)
 *
 * 누르면 Figma `568:286` 캘린더가 뜬다(사용자 변경 2026-08-17: 스크롤 목록 → 캘린더).
 * 아이콘만이 아니라 필드 전체가 눌린다 — 19px 아이콘만 대상으로 두면 누르기 어렵다.
 */
export function DateField({
  label,
  required = false,
  value,
  placeholder,
  onSelect,
  minYear,
  maxYear,
  gap = FORM.rowGap,
}: {
  label: string;
  required?: boolean;
  /** `YYYY-MM-DD` 또는 빈 문자열. */
  value: string;
  placeholder: string;
  onSelect: (iso: string) => void;
  minYear: number;
  maxYear: number;
  gap?: number;
}) {
  const [open, setOpen] = useState(false);
  const shown = birthSlashLabel(value);

  return (
    <View style={{ marginBottom: gap }}>
      <FieldLabel label={label} required={required} />
      <View style={boxWrapStyle}>
        <FieldBox onPress={() => setOpen(true)}>
          {shown.length > 0 ? (
            <Text
              className={`absolute ${valueClass}`}
              style={{ ...valueStyle, left: FORM.valueInset, top: 8 }}
            >
              {shown}
            </Text>
          ) : (
            <Placeholder text={placeholder} />
          )}
          {/* 달력 아이콘 — Figma 19×19, 박스 우측 20 · 세로 중앙(박스 46) */}
          <View
            pointerEvents="none"
            style={{ position: 'absolute', right: 20, top: (FORM.fieldH - 19) / 2 }}
          >
            <CalendarGlyph />
          </View>
        </FieldBox>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
          onPress={() => setOpen(false)}
        >
          {/* 카드 내부 탭이 배경 닫힘으로 전파되지 않게 감싼다 */}
          <Pressable onPress={() => {}}>
            <Calendar
              value={value.length > 0 ? value : null}
              minYear={minYear}
              maxYear={maxYear}
              onSelect={(iso) => {
                onSelect(iso);
                setOpen(false);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}


// ── 검색형 — 출신지 ──────────────────────────────────────────
export function SearchField({
  label,
  value,
  onChangeText,
  placeholder,
  search,
  gap = FORM.rowGap,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  /** 질의 → 후보(빈 배열이면 목록을 열지 않는다). */
  search: (q: string) => string[];
  gap?: number;
}) {
  const [focused, setFocused] = useState(false);
  const results = useMemo(() => (focused ? search(value) : []), [focused, value, search]);

  return (
    <View style={{ marginBottom: gap, zIndex: 5 }}>
      <FieldLabel label={label} />
      <View style={boxWrapStyle}>
        <FieldBox>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel={label}
            className={`absolute ${valueClass}`}
            style={{ ...valueStyle, left: FORM.valueInset, right: 48, top: 8, height: 30 }}
          />
          {value.length === 0 ? <Placeholder text={placeholder} /> : null}
          <Image
            source={iconFieldSearch}
            style={{ position: 'absolute', right: FORM.counterInset, top: 13, width: 19, height: 20.31 }}
            resizeMode="contain"
          />
        </FieldBox>
      </View>

      {results.length > 0 ? (
        <View
          className="absolute bg-white"
          style={{
            top: 30 + FORM.labelGap + FORM.fieldH + 4,
            left: 0,
            right: 0,
            borderRadius: FORM.fieldR,
            borderWidth: 1,
            borderColor: '#cccdce',
            boxShadow: '1px 1px 10px rgba(108,101,101,0.13)',
            overflow: 'hidden',
          }}
        >
          {results.map((r) => (
            <Pressable
              key={r}
              onPress={() => onChangeText(r)}
              accessibilityRole="button"
              className="active:opacity-70"
              style={{ height: 42, justifyContent: 'center', paddingHorizontal: FORM.valueInset }}
            >
              <Text className="text-[16px] font-normal text-black" style={{ lineHeight: 30 }}>
                {r}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── 주요 기억(반복 목록) ──────────────────────────────────────
export interface MemoryItem {
  /** 안정 키 — 라이브는 chronicle id, 신규는 생성 id. */
  key: string;
  text: string;
}

/**
 * Figma 두 상태를 그대로 재현한다:
 *  - 비어 있으면(등록 화면) 안내문구만 있는 **박스 1개** — 삭제 X·＋행 없음
 *  - 하나라도 있으면(연대기 수정) 항목마다 삭제 X + 맨 아래 "＋ 기억 추가"
 */
export function MemoryList({
  label,
  items,
  setItems,
  placeholder,
  addLabel,
  newKey,
}: {
  label: string;
  items: MemoryItem[];
  setItems: (next: MemoryItem[]) => void;
  placeholder: string;
  addLabel: string;
  /** 새 항목 키 생성기(호출부가 제공). */
  newKey: () => string;
}) {
  const rows = items.length > 0 ? items : [{ key: '__first', text: '' }];
  const showControls = items.length > 1 || (items[0]?.text.trim().length ?? 0) > 0;

  const change = (key: string, text: string) => {
    if (items.length === 0) {
      setItems([{ key: newKey(), text }]);
      return;
    }
    setItems(items.map((it) => (it.key === key ? { ...it, text } : it)));
  };

  return (
    <View>
      <FieldLabel label={label} />
      <View style={boxWrapStyle}>
        {rows.map((it, i) => (
          // 빈 상태(등록 화면)는 박스 1개뿐이라 아래 여백이 없다 — Figma 실측(주요 기억
          // 박스 하단 1032 → 저장 버튼 1094, 간격 62)과 정확히 맞춘다.
          <View key={it.key} style={{ marginBottom: showControls ? FORM.memoryGap : 0 }}>
            <FieldBox>
              <TextInput
                value={it.text}
                onChangeText={(t) => change(it.key, t.slice(0, MEMORY_MAX))}
                maxLength={MEMORY_MAX}
                accessibilityLabel={`${label} ${i + 1}`}
                className={`absolute ${valueClass}`}
                style={{ ...valueStyle, left: FORM.valueInset, right: showControls ? 48 : FORM.valueInset, top: 8, height: 30 }}
              />
              {it.text.length === 0 ? <Placeholder text={placeholder} /> : null}
              {showControls ? (
                <Pressable
                  onPress={() => setItems(items.filter((x) => x.key !== it.key))}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} ${i + 1} 삭제`}
                  hitSlop={14}
                  className="absolute active:opacity-60"
                  style={{ right: FORM.counterInset, top: 16 }}
                >
                  <Image source={iconXSmall} style={{ width: 13.7, height: 13.7 }} resizeMode="contain" />
                </Pressable>
              ) : null}
            </FieldBox>
          </View>
        ))}

        {showControls ? (
          <FieldBox onPress={() => setItems([...items, { key: newKey(), text: '' }])}>
            <View
              className="flex-row items-center"
              style={{ position: 'absolute', left: 18, top: 8, height: 30 }}
            >
              <Image source={iconPlus} style={{ width: 16, height: 16 }} resizeMode="contain" />
              <Text className="text-[18px] font-normal text-muted" style={{ lineHeight: 30, marginLeft: 4 }}>
                {addLabel}
              </Text>
            </View>
          </FieldBox>
        ) : null}
      </View>
    </View>
  );
}

// ── 사진 ─────────────────────────────────────────────────────
export function PhotoField({ uri, onPress }: { uri?: string | null; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={uri ? '사진 변경' : '사진 등록'}
      className="items-center justify-center active:opacity-80"
      style={{
        width: FORM.photo.w,
        height: FORM.photo.h,
        borderRadius: FORM.photo.r,
        backgroundColor: FORM.photo.bg,
        borderWidth: 1,
        borderColor: FORM.photo.border,
        overflow: 'hidden',
      }}
    >
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
      <Image
        source={uri ? iconPhotoEdit : iconPhotoAdd}
        style={uri ? { position: 'absolute', width: 18.75, height: 18 } : { width: 18.6, height: 17.25 }}
        resizeMode="contain"
      />
    </Pressable>
  );
}

// ── 저장하기 ─────────────────────────────────────────────────
export function SaveButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={`items-center justify-center active:opacity-90 ${disabled ? 'opacity-40' : ''}`}
      style={{ alignSelf: 'stretch', height: 57, borderRadius: 10, backgroundColor: '#e9822b' }}
    >
      <Text className="text-[18px] font-semibold text-white" style={{ lineHeight: 30 }}>
        {label}
      </Text>
    </Pressable>
  );
}
