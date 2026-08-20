import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// 신규 디자인 실측(Figma 15:443 로그인 · 172:330 어르신 등록):
//   라벨   SemiBold 22 #7b7c7c, 아래 여백 12
//   입력   h-[68] r10 1px #d9d9d9 흰 배경, 좌우 패딩 29, 값/플레이스홀더 Regular 20 #7b7c7c
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      {...rest}
      className={cn(
        'h-[68px] w-full rounded-[10px] border border-line bg-white px-[29px]',
        'text-w-body text-ink-700 placeholder:text-ink-500',
        'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
        'disabled:bg-mute disabled:text-ink-400',
        className,
      )}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      {...rest}
      className={cn(
        'min-h-[160px] w-full resize-y rounded-[10px] border border-line bg-white px-[29px] py-5',
        'text-w-body text-ink-700 placeholder:text-ink-500',
        'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
        'disabled:bg-mute disabled:text-ink-400',
        className,
      )}
    />
  ),
);
Textarea.displayName = 'Textarea';

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** 글자수 카운터 ("0/50") — 디자인의 폼 모달에서 쓰인다. */
  counter?: string;
  children: ReactNode;
}

export function Field({ label, required, hint, error, counter, children }: FieldProps) {
  return (
    <label className="block">
      <div className="mb-3 flex items-baseline gap-1">
        <span className="text-w-nav font-semibold text-ink-500">{label}</span>
        {required ? <span className="text-w-nav font-semibold text-accent">✱</span> : null}
        {counter ? <span className="ml-auto text-w-sub text-ink-500">{counter}</span> : null}
      </div>
      {children}
      {error ? (
        <div className="mt-2 text-w-sub text-alert">{error}</div>
      ) : hint ? (
        <div className="mt-2 text-w-sub text-ink-500">{hint}</div>
      ) : null}
    </label>
  );
}
