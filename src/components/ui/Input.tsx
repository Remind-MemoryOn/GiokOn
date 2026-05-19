import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      {...rest}
      className={cn(
        'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400',
        'focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400',
        'disabled:bg-slate-50 disabled:text-slate-400',
        className
      )}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      {...rest}
      className={cn(
        'min-h-[88px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 resize-y',
        'focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400',
        'disabled:bg-slate-50 disabled:text-slate-400',
        className
      )}
    />
  )
);
Textarea.displayName = 'Textarea';

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export function Field({ label, required, hint, error, children }: FieldProps) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </div>
      {children}
      {error ? (
        <div className="text-xs text-red-500 mt-1">{error}</div>
      ) : hint ? (
        <div className="text-xs text-slate-500 mt-1">{hint}</div>
      ) : null}
    </label>
  );
}
