import { useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

// 신규 디자인 실측(연대기 추가 196:271 · 회상 세션 설계 196:272 · 어르신 등록 Frame 19):
//   패널 폭 1054(lg) · r10 · 흰 배경 · 그림자 card
//   제목 Bold 25 · 푸터는 취소(outline) / 저장(primary) 우측 정렬
const SIZE = {
  md: 'max-w-[700px]',
  lg: 'max-w-[1054px]',
} as const;

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZE;
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[86vh] w-full flex-col rounded-[10px] bg-white shadow-card',
          SIZE[size],
        )}
      >
        {title ? (
          <header className="px-[52px] pb-4 pt-9">
            <h2 className="text-w-section font-bold text-ink-900">{title}</h2>
            {description ? <p className="mt-1 text-w-sub text-ink-700">{description}</p> : null}
          </header>
        ) : null}
        <div className="flex-1 overflow-y-auto px-[52px] pb-2">{children}</div>
        {footer ? (
          <footer className="flex justify-end gap-3 px-[52px] pb-9 pt-6">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}
