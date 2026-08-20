import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// 신규 디자인 실측(Figma 118:300 대시보드):
//   알약 r100 · SemiBold 18 · 높이 25(기본)~32(카드 내부)
//   폭 — 관찰/위기 = 글자 + 좌우 16 · 상태(종료·진행 중·미확인) = 고정 82 · 카운트(세션·연대기) = 글자 + 좌우 18
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
  /** 상태 배지(종료·진행 중·미확인) — Figma 실측 고정 폭 82. */
  fixed?: boolean;
}

export function Badge({ tone = 'mute', large, fixed, className, ...rest }: Props) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center justify-center rounded-pill font-semibold text-w-sub whitespace-nowrap',
        large ? 'h-[32px] px-[18px]' : 'h-[25px] px-[16px]',
        fixed && 'w-[82px] px-0',
        TONE[tone],
        className,
      )}
    />
  );
}
