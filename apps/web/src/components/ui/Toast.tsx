import { useStore } from '../../store/store';
import { cn } from '../../lib/utils';

// 전역 토스트 — 우하단 스택, 3.2초 자동 소멸(스토어). 신규 디자인 토큰으로 재작성.
const TONE = {
  success: 'border-live bg-live-soft text-ink-900',
  error: 'border-alert bg-alert-soft text-alert',
  info: 'border-line bg-white text-ink-900',
};

export function ToastShelf() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div className="fixed bottom-8 right-8 z-[60] flex max-w-[520px] flex-col gap-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-4 rounded-[10px] border bg-white px-6 py-4 shadow-card',
            TONE[t.kind],
          )}
        >
          <div className="flex-1 text-w-body font-medium">{t.message}</div>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 text-w-body text-ink-500 transition hover:text-ink-900"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
