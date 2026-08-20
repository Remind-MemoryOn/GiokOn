import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// 신규 디자인 실측: 본문 카드 = 흰 배경 · 1px #d9d9d9 · r10 (폭 1054 콘텐츠 열)
// 통계 카드 = 흰 배경 · 그림자 1px 1px 8px rgba(106,106,106,.25) · r10 (243×107)
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn('rounded-[10px] border border-line bg-white', className)} />;
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn('px-[52px] pt-8', className)} />;
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...rest} className={cn('text-w-section font-bold text-ink-900', className)} />;
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...rest} className={cn('text-w-sub text-ink-700', className)} />;
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn('px-[52px] py-6', className)} />;
}

/** 리스트 행 구분선 — 카드(테두리 1px) 안에서 375~1325(950)에 놓이는 1px 라인. */
export function RowDivider({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn('mx-[51px] h-px bg-line', className)} />;
}
