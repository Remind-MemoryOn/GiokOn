import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Dialog({ open, onClose, title, description, children, footer, size = 'lg' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in-up"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative w-full bg-white rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up',
          SIZE[size]
        )}
      >
        <header className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            {title ? <h2 className="text-lg font-semibold text-slate-900">{title}</h2> : null}
            {description ? <p className="text-sm text-slate-500 mt-1">{description}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition p-1 rounded-md hover:bg-slate-100"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </header>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer ? (
          <footer className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
