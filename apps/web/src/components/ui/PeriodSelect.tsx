import { asset } from '../../assets/ui';
import { PERIODS, Y, type Months } from '../../lib/analysis';
import { Select } from './Select';

export function PeriodSelect({ months, onChange, fxBox, fxLabel }: {
  months: Months; onChange: (months: Months) => void; fxBox: string; fxLabel: string;
}) {
  return <div data-fx={fxBox} className="absolute h-[30px] w-[127px] rounded-[5px] border border-ink-500/30 bg-ink-500/[0.03]" style={{ left: 1249, top: Y(292) }}>
    <span data-fx={fxLabel} className="pointer-events-none absolute left-[19px] top-1/2 -translate-y-1/2 whitespace-nowrap text-[16px] leading-[23px] text-ink-500">최근 {months}개월</span>
    <img src={asset.iconChevronDownSm} alt="" width={12} height={7.81} className="pointer-events-none absolute left-[97px] top-1/2 block -translate-y-1/2" />
    <Select aria-label="분석 기간" value={months} onChange={(event) => onChange(Number(event.target.value) as Months)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
      {PERIODS.map((month) => <option key={month} value={month}>최근 {month}개월</option>)}
    </Select>
  </div>;
}
