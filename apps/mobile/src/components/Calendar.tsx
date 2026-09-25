// 캘린더 (Figma `568:286` "Calendar" — shadcn Simple Design System 기반, 사용자 배치)
//
// Figma 실측(get_metadata + get_design_context + get_variable_defs):
//   카드 318 × auto  bg #ffffff · border 1 #d9d9d9 · radius 16 · padding 16 · 열 정렬 center
//   헤더(Block) 286×36 · gap 16 · items-center
//     아이콘 버튼 36×36 (padding 8 · radius 32 · 화살표 20×20, 글리프 5×10)
//     선택 그룹 182×28 · gap 8 → 필드 각 87
//       필드: bg #ffffff · border 1 #d9d9d9 · radius 8 · padding 6 · gap 8
//             값 16/16 #1e1e1e · ∨ 16×16(글리프 8×4)
//   테이블 paddingTop 16
//     Thead 286×20 · gap 1 · 칸 40 · 요일 12/20 #757575 중앙
//     Tbody gap 1 · 행 gap 1 · 칸 40×40 radius 8
//       Default  글자 #1e1e1e 16/22.4
//       Active   bg #e9822b · 글자 #f5f5f5     ← 선택된 날짜
//       Disabled 글자 #b3b3b3                  ← 다음 달(격자 채움) · 선택 불가
//       Hidden   빈 칸                          ← 1일 이전(앞쪽 여백)
//   → 총 높이 16+36+16+20+5행(200)+행간(4)+16 = 308 (Figma 값과 일치)
//
// ⚠️ Figma 컴포넌트는 5행이지만 달에 따라 6행이 필요하다(31일이 토요일에 시작하는 달 등).
//   날짜를 버리면 고를 수 없는 날이 생기므로 필요한 행 수만큼 그린다 — 카드가 41 커질 뿐
//   디자인(padding 기반 세로 스택)은 그대로다.
//
// ⚠️ 화살표·∨ 는 Figma 벡터지만 이 컨테이너의 egress 정책이 www.figma.com 을 막아 에셋을
//   받을 수 없어 react-native-svg 로 같은 치수로 그린다(글리프 크기·색은 실측값).
//   폰트는 프로젝트 전역 Pretendard 를 쓴다(디자인 파일의 Inter/Geist 대신 — 앱 타이포 일관성).
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { daysInMonth, isBirthDate } from '@giokon/core';

/** Figma 실측 상수 — scripts/check-figma-spec.mjs 가 검사한다. */
const CAL = {
  width: 318,
  pad: 16,
  inner: 286, // 318 - 16*2
  headerH: 36,
  headerGap: 16,
  selectGroupW: 182,
  selectGap: 8,
  fieldPad: 6,
  fieldR: 8,
  cell: 40,
  cellGap: 1,
  cellR: 8,
  theadH: 20,
  tablePadTop: 16,
  border: '#d9d9d9',
  bg: '#ffffff',
  text: '#1e1e1e',
  weekday: '#757575',
  disabled: '#b3b3b3',
  active: '#e9822b',
  onActive: '#f5f5f5',
} as const;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** ∨ — 16×16 박스 안 글리프 8×4 (Figma inset 25%/37.5%). */
function ChevronDown() {
  return (
    <Svg width={16} height={16}>
      <Path
        d="M4 6 L8 10 L12 6"
        stroke={CAL.text}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** ‹ › — 20×20 박스 안 글리프 5×10 (Figma inset 37.5%/25%). */
function ChevronSide({ left }: { left: boolean }) {
  return (
    <Svg width={20} height={20}>
      <Path
        d={left ? 'M12.5 5 L7.5 10 L12.5 15' : 'M7.5 5 L12.5 10 L7.5 15'}
        stroke={CAL.text}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** 헤더 화살표 버튼 36×36 (padding 8 · radius 32). */
function ArrowButton({
  left,
  onPress,
  label,
}: {
  left: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="items-center justify-center active:opacity-60"
      style={{ width: 36, height: 36, borderRadius: 32, padding: 8 }}
    >
      <ChevronSide left={left} />
    </Pressable>
  );
}

/** 헤더의 연/월 선택 필드 — 누르면 목록 시트가 열린다(Figma 는 ∨ 만 그려져 있다). */
function SelectField({
  label,
  text,
  options,
  selected,
  onSelect,
}: {
  label: string;
  text: string;
  options: number[];
  selected: number;
  onSelect: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label} 선택: ${text}`}
        className="flex-row items-center active:opacity-70"
        style={{
          backgroundColor: CAL.bg,
          borderWidth: 1,
          borderColor: CAL.border,
          borderRadius: CAL.fieldR,
          padding: CAL.fieldPad,
          columnGap: CAL.selectGap,
        }}
      >
        <Text
          className="flex-1 text-[16px] font-normal"
          style={{ lineHeight: 16, color: CAL.text }}
          numberOfLines={1}
        >
          {text}
        </Text>
        <ChevronDown />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: 200,
              maxHeight: 320,
              backgroundColor: CAL.bg,
              borderRadius: CAL.fieldR,
              borderWidth: 1,
              borderColor: CAL.border,
              paddingVertical: 8,
            }}
          >
            <FlatList
              data={options}
              keyExtractor={(n) => `${label}-${n}`}
              initialNumToRender={24}
              renderItem={({ item }) => {
                const on = item === selected;
                return (
                  <Pressable
                    onPress={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className="active:opacity-70"
                    style={{ height: 40, justifyContent: 'center', paddingHorizontal: 16 }}
                  >
                    <Text
                      className="text-[16px] font-normal"
                      style={{ lineHeight: 24, color: on ? CAL.active : CAL.text }}
                    >
                      {label === '월' ? `${item}월` : item}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** 격자 한 칸의 상태 — Figma Calendar Button 베리언트와 1:1. */
type CellState = 'hidden' | 'default' | 'active' | 'disabled';
interface Cell {
  key: string;
  label: string;
  state: CellState;
  day?: number;
}

/** 해당 달의 격자(일요일 시작). 앞은 빈 칸, 뒤는 다음 달 숫자로 채운다. */
function buildCells(year: number, month: number, selected: string | null): Cell[] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=일
  const total = daysInMonth(year, month);
  const cells: Cell[] = [];
  for (let i = 0; i < first; i += 1) {
    cells.push({ key: `blank-${i}`, label: '', state: 'hidden' });
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  for (let d = 1; d <= total; d += 1) {
    const iso = `${year}-${pad(month)}-${pad(d)}`;
    cells.push({
      key: iso,
      label: String(d),
      state: iso === selected ? 'active' : 'default',
      day: d,
    });
  }
  // 마지막 행을 다음 달 날짜로 채운다(Figma 의 Disabled 상태 — 선택 불가).
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ key: `next-${next}`, label: String(next), state: 'disabled' });
    next += 1;
  }
  return cells;
}

/**
 * 생년월일 캘린더. `value` 는 `YYYY-MM-DD`(없으면 null), 날짜를 고르면 `onSelect` 로 준다.
 * 연도 범위는 호출부가 정한다(어르신 연령대 40~110세).
 */
export function Calendar({
  value,
  minYear,
  maxYear,
  onSelect,
}: {
  value: string | null;
  minYear: number;
  maxYear: number;
  onSelect: (iso: string) => void;
}) {
  const valid = value && isBirthDate(value) ? value : null;
  // 값이 없으면 허용 범위의 중간 연도에서 시작한다(어느 쪽 끝에서 시작해도 이동이 길다).
  const [ym, setYm] = useState(() => {
    if (valid) {
      const [y, m] = valid.split('-').map(Number);
      return { y, m };
    }
    return { y: Math.round((minYear + maxYear) / 2), m: 1 };
  });

  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i),
    [minYear, maxYear],
  );
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const cells = useMemo(() => buildCells(ym.y, ym.m, valid), [ym.y, ym.m, valid]);
  const rows = useMemo(() => {
    const out: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  /** 월 이동 — 연도 범위를 벗어나면 이동하지 않는다. */
  const step = (delta: number) => {
    setYm((cur) => {
      let m = cur.m + delta;
      let y = cur.y;
      if (m < 1) {
        m = 12;
        y -= 1;
      } else if (m > 12) {
        m = 1;
        y += 1;
      }
      if (y < minYear || y > maxYear) return cur;
      return { y, m };
    });
  };

  return (
    <View
      style={{
        width: CAL.width,
        backgroundColor: CAL.bg,
        borderWidth: 1,
        borderColor: CAL.border,
        borderRadius: 16,
        padding: CAL.pad,
        alignItems: 'center',
      }}
    >
      {/* 헤더 — ‹ | 연도 ∨ | 월 ∨ | › */}
      <View
        className="flex-row items-center"
        style={{ width: CAL.inner, height: CAL.headerH, columnGap: CAL.headerGap }}
      >
        <ArrowButton left onPress={() => step(-1)} label="이전 달" />
        <View
          className="flex-row items-start"
          style={{ flex: 1, columnGap: CAL.selectGap }}
        >
          <SelectField
            label="연도"
            text={String(ym.y)}
            options={years}
            selected={ym.y}
            onSelect={(y) => setYm((cur) => ({ y, m: cur.m }))}
          />
          <SelectField
            label="월"
            text={`${ym.m}월`}
            options={months}
            selected={ym.m}
            onSelect={(m) => setYm((cur) => ({ y: cur.y, m }))}
          />
        </View>
        <ArrowButton left={false} onPress={() => step(1)} label="다음 달" />
      </View>

      {/* 테이블 */}
      <View style={{ width: CAL.inner, paddingTop: CAL.tablePadTop }}>
        <View className="flex-row items-center" style={{ height: CAL.theadH, columnGap: CAL.cellGap }}>
          {WEEKDAYS.map((w) => (
            <View key={w} style={{ width: CAL.cell, alignItems: 'center' }}>
              <Text
                className="text-[12px] font-normal text-center"
                style={{ lineHeight: 20, color: CAL.weekday }}
              >
                {w}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ rowGap: CAL.cellGap }}>
          {rows.map((row, ri) => (
            <View
              key={`row-${ri}`}
              className="flex-row items-center"
              style={{ columnGap: CAL.cellGap }}
            >
              {row.map((c) => {
                if (c.state === 'hidden') {
                  return <View key={c.key} style={{ width: CAL.cell, height: CAL.cell }} />;
                }
                const active = c.state === 'active';
                const off = c.state === 'disabled';
                return (
                  <Pressable
                    key={c.key}
                    disabled={off}
                    onPress={() => c.day && onSelect(c.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: off }}
                    accessibilityLabel={`${ym.y}년 ${ym.m}월 ${c.label}일`}
                    className={off ? undefined : 'active:opacity-70'}
                    style={{
                      width: CAL.cell,
                      height: CAL.cell,
                      borderRadius: CAL.cellR,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? CAL.active : 'transparent',
                    }}
                  >
                    <Text
                      className="text-[16px] font-normal text-center"
                      style={{
                        lineHeight: 22.4,
                        color: active ? CAL.onActive : off ? CAL.disabled : CAL.text,
                      }}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
