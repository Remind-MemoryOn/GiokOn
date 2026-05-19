import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useStore } from '../../store/store';
import { cn } from '../../lib/utils';

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const TONE = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-slate-200 bg-white text-slate-900',
};

export function ToastShelf() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border shadow-sm px-3.5 py-3 animate-fade-in-up',
              TONE[t.kind]
            )}
          >
            <Icon size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1 text-sm font-medium leading-relaxed">{t.message}</div>
            <button
              onClick={() => dismiss(t.id)}
              className="opacity-60 hover:opacity-100 transition shrink-0"
              aria-label="닫기"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
