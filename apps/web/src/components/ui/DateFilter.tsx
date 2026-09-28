import type { CSSProperties } from 'react';
import { asset } from '../../assets/ui';

/** 세션 목록과 보호자 소식에서 공유하는 날짜 필터. */
export function DateFilter({ value, onChange, label, style, fxBox, fxLabel }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  style?: CSSProperties;
  fxBox?: string;
  fxLabel?: string;
}) {
  return (
    <div data-fx={fxBox} className="absolute left-[1203px] h-[37.04px] w-[170px] rounded-[5px] border border-line bg-white focus-within:border-accent" style={style}>
      <img src={asset.iconCalendarSm} alt="" width={22} height={22} className="pointer-events-none absolute left-[13px] top-1/2 block -translate-y-1/2" />
      <span data-fx={fxLabel} className="pointer-events-none absolute left-[47px] top-1/2 -translate-y-1/2 whitespace-nowrap text-[16px] leading-[30px] text-ink-500">
        {value ? value.replace(/-/g, '.') : '날짜 선택하기'}
      </span>
      <img src={asset.iconChevronDownSm} alt="" width={12} height={7.81} className="pointer-events-none absolute left-[144px] top-1/2 block -translate-y-1/2" />
      <input type="date" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} onClick={(event) => event.currentTarget.showPicker?.()} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </div>
  );
}
