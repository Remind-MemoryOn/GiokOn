import type { CSSProperties } from 'react';
import { asset } from '../../assets/ui';

// 활동 시각 입력 — **24시간제**(00~23시) 시·분 선택.
//
// 왜 네이티브 `<input type="time">` 을 쓰지 않나(2026-09-11 사용자 신고):
//   ① 브라우저가 **자체 시계 아이콘**을 그려서 시안 아이콘과 **두 개**로 보였다.
//   ② 한국어 로캘에서 크롬이 **오전/오후**로 쪼개 보여 준다 — 24시간제를 강제할 방법이 없다.
// 그래서 `<select>` 두 개로 직접 만든다. 값 형식은 그대로 `HH:MM` 이라 저장·불러오기는
// 바뀌지 않는다(`session`/`program_journals.operated_from` 이 time 컬럼).
//
// 분은 5분 단위다 — 요양일지의 활동 시간은 분 단위 정밀도를 요구하지 않고,
// 목록이 60줄이면 고르기가 더 어렵다.
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

/** 투명 select — 시안 글자 위에 겹쳐 둔다(값 표시는 아래 span 이 한다). */
const BARE =
  'absolute inset-y-0 cursor-pointer appearance-none bg-transparent text-[18px] text-ink-900 opacity-0';

interface Props {
  value: string;
  onChange: (v: string) => void;
  label: string;
  className?: string;
  style?: CSSProperties;
  /** Figma 노드 앵커 — 좌표 대조 게이트가 이 칸을 찾는다. */
  'data-fx'?: string;
}

export function TimeField({ value, onChange, label, className, style, ...rest }: Props) {
  const [h, m] = value ? value.split(':') : ['', ''];
  const set = (nh: string, nm: string) => {
    // 한쪽만 골랐으면 나머지는 00 으로 채운다 — 반쪽 값은 저장할 수 없다.
    if (!nh && !nm) return onChange('');
    onChange(`${nh || '00'}:${nm || '00'}`);
  };

  return (
    <div className={className} style={style} data-fx={rest['data-fx']}>
      <span className="pointer-events-none absolute left-[29px] top-1/2 -translate-y-1/2 text-[18px] leading-[21px] text-ink-900">
        {value ? `${h}:${m}` : <span className="text-ink-500">--:--</span>}
      </span>
      {/* 시 */}
      <select
        aria-label={`${label} (시)`}
        value={h}
        onChange={(e) => set(e.target.value, m)}
        className={`${BARE} left-[20px] w-[34px]`}
      >
        <option value="">--</option>
        {HOURS.map((v) => (
          <option key={v} value={v}>
            {v}시
          </option>
        ))}
      </select>
      {/* 분 */}
      <select
        aria-label={`${label} (분)`}
        value={m}
        onChange={(e) => set(h, e.target.value)}
        className={`${BARE} left-[54px] w-[34px]`}
      >
        <option value="">--</option>
        {MINUTES.map((v) => (
          <option key={v} value={v}>
            {v}분
          </option>
        ))}
      </select>
      <img
        src={asset.iconClockField}
        alt=""
        width={22}
        height={22}
        className="pointer-events-none absolute left-[101px] top-1/2 block -translate-y-1/2"
      />
    </div>
  );
}
