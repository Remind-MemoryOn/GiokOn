import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// 신규 디자인 실측(Figma 15:443 로그인 CTA · 각 화면 액션 버튼):
//   주 버튼 = 배경 accent(#e9822b) · 흰 글자 · r10 · SemiBold
//   size lg = h71 / text 24  (인증 화면 전폭 CTA)
//   size md = h57 / text 22  (화면 상단 액션)
//   size sm = h44 / text 20  (카드 내 액션)
export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:brightness-95 active:brightness-90',
  outline: 'bg-white text-ink-500 border border-line hover:bg-mute/40',
  ghost: 'bg-transparent text-ink-700 hover:bg-mute/60',
  danger: 'bg-alert text-white hover:brightness-95',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-[44px] px-5 text-w-body',
  md: 'h-[57px] px-6 text-w-nav',
  lg: 'h-[71px] px-7 text-w-cta',
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = 'primary', size = 'md', children, ...rest }, ref) => (
    <button
      ref={ref}
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
