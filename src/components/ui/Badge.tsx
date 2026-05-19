import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Tone = 'neutral' | 'brand' | 'success' | 'info' | 'warning' | 'pink';

const TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  brand:   'bg-brand-50 text-brand-700 border-brand-100',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  info:    'bg-sky-50 text-sky-700 border-sky-100',
  warning: 'bg-amber-50 text-amber-700 border-amber-100',
  pink:    'bg-pink-50 text-pink-700 border-pink-100',
};

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = 'neutral', className, ...rest }: Props) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE[tone],
        className
      )}
    />
  );
}
