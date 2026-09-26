// 프로그램 일지 상태 칩(파일럿 W1) — 기존 요양일지 분류 배지(107×35 · 글자 20, 207:1147)와 같은 틀.
// 색은 점과 옅은 바탕으로만 구분하고 글자는 본문색이다 — 주황·초록·하늘색 글자는 밝은 바탕에서 대비가 모자란다.
import type { CSSProperties } from 'react';
import type { ProgramJournalStatus } from '@giokon/data';
import { JOURNAL_STATUS } from '../lib/programJournal';
import { cn } from '../lib/utils';

export function JournalStatusChip({ status, size = 'tag', className, style, fx }: {
  status: ProgramJournalStatus;
  /** tag = 목록 행 배지(107×35) · sm = 상세 제목 옆(높이 32). */
  size?: 'tag' | 'sm';
  className?: string;
  style?: CSSProperties;
  fx?: string;
}) {
  const s = JOURNAL_STATUS[status];
  return (
    <span
      data-fx={fx}
      className={cn(
        'inline-flex items-center justify-center gap-[6px] whitespace-nowrap rounded-pill font-semibold text-ink-900',
        size === 'tag' ? 'h-[35px] w-[107px] text-[20px]' : 'h-[32px] px-[16px] text-w-sub',
        s.bg,
        className,
      )}
      style={style}
    >
      <span aria-hidden className={cn('h-[8px] w-[8px] shrink-0 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}
