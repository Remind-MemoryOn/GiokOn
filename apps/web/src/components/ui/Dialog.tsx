import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useModalA11y } from '../../lib/modalA11y';
import { cn } from '../../lib/utils';

// 신규 디자인 실측(연대기 추가 196:271 · 회상 세션 설계 196:272 · 어르신 등록 Frame 19):
//   패널 폭 1054(lg) · r10 · 흰 배경 · 그림자 card
//   제목 Bold 25 · 푸터는 취소(outline) / 저장(primary) 우측 정렬
const SIZE = {
  md: 'max-w-[700px]',
  lg: 'max-w-[1054px]',
  /** 시안 치수를 직접 그리는 넓은 패널(공개 기록 설정 1103 등). */
  xl: 'max-w-[1140px]',
} as const;

/** 패널 둘레 여백(p-6 좌우/상하 각 24). 축소 계산에서 빼 준다. */
const GUTTER = 48;

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZE;
  /** 제목을 직접 그리는 모달(시안 치수)의 스크린리더용 이름. `title` 이 있으면 불필요. */
  label?: string;
  /**
   * 시안 치수를 절대좌표로 그리는 패널의 **고정 크기**. 주면 화면이 좁을 때
   * 그만큼 **통째로 축소**해 스크롤 없이 다 보이게 한다(2026-09-11 사용자 신고 —
   * 공개 기록 설정 모달이 노트북에서 잘려 스크롤해야 했다).
   *
   * ⚠️ 배율은 `min(1, …)` 이라 **여유가 있으면 1** 이다 — 넓은 화면에서는 시안 치수
   *    그대로 그려지고 좌표 대조 게이트도 영향받지 않는다.
   */
  fit?: { width: number; height: number };
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'lg',
  label,
  fit,
}: Props) {
  // Esc·본문 스크롤 잠금 + 초점 이동·가둠·복귀(KWCAG) — `lib/modalA11y`.
  const panel = useModalA11y(open, onClose);
  const scale = useFitScale(open, fit);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? label}
        className={cn(
          'relative flex w-full flex-col rounded-[10px] bg-white shadow-card',
          // 고정 치수 패널은 축소로 맞추므로 높이를 제한하지 않는다(제한하면 다시 스크롤이 생긴다).
          fit ? 'overflow-hidden' : 'max-h-[86vh]',
          SIZE[size],
        )}
        style={
          fit
            ? { width: fit.width * scale, height: fit.height * scale, maxWidth: 'none' }
            : undefined
        }
      >
        {title ? (
          <header className="px-[52px] pb-4 pt-9">
            <h2 className="text-w-section font-bold text-ink-900">{title}</h2>
            {description ? <p className="mt-1 text-w-sub text-ink-700">{description}</p> : null}
          </header>
        ) : null}
        {fit ? (
          // 시안 좌표를 그대로 둔 채 통째로 줄인다 — 안쪽 레이아웃은 손대지 않는다.
          <div
            style={{
              width: fit.width,
              height: fit.height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            {children}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-[52px] pb-2">{children}</div>
        )}
        {footer ? (
          <footer className="flex justify-end gap-3 px-[52px] pb-9 pt-6">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}

/** 창 크기에 맞춰 고정 치수 패널을 줄이는 배율. 여유가 있으면 1(축소하지 않는다). */
function useFitScale(open: boolean, fit?: { width: number; height: number }) {
  const [scale, setScale] = useState(1);
  // 호출부가 `fit={{...}}` 객체 리터럴을 넘기므로 렌더마다 참조가 바뀐다 →
  // 두 숫자만 의존성으로 둔다(객체를 넣으면 매 렌더 effect 가 다시 돈다).
  const width = fit?.width;
  const height = fit?.height;
  useLayoutEffect(() => {
    if (!open || !width || !height) return;
    const measure = () =>
      setScale(
        Math.min(1, (window.innerWidth - GUTTER) / width, (window.innerHeight - GUTTER) / height),
      );
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, width, height]);
  return scale;
}
