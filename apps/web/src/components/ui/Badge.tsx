import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// 신규 디자인 실측(Figma 118:300 대시보드):
//   알약 r100 · SemiBold 18 · 높이 25(기본)~32(카드 내부)
//   관찰·세션 = info(#1cb2d0) / 연대기 = chronicle(#d5379b) / 진행 중 = live(#60bd66)
//   종료·미확인 = 회색(#f2f1f1·#efefef 배경 + #6e6e6e 글자)
export type BadgeTone = 'info' | 'chronicle' | 'live' | 'mute' | 'muteStrong' | 'alert' | 'accent';

const TONE: Record<BadgeTone, string> = {
  info: 'bg-info-soft text-info',
  chronicle: 'bg-chronicle-soft text-chronicle',
  live: 'bg-live-soft text-live',
  mute: 'bg-mute text-ink-400',
  muteStrong: 'bg-mute-strong text-ink-400',
  alert: 'bg-alert-soft text-alert',
  accent: 'bg-accent-soft text-accent',
};

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** 카드 내부의 큰 배지(높이 32). 기본은 25. */
  large?: boolean;
}

export function Badge({ tone = 'mute', large, className, ...rest }: Props) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center justify-center rounded-pill px-3 font-semibold text-w-sub whitespace-nowrap',
        large ? 'h-[32px]' : 'h-[25px]',
        TONE[tone],
        className,
      )}
    />
  );
}
