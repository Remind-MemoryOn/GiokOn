// window.confirm 대체 — 초점 가둠·Esc·스크린리더 이름이 붙는다(KWCAG).
//
// 네이티브 대화상자는 초점을 가두지 않고 접근 가능한 이름이 없어 `check:a11y` 가
// 보지도 못한다. 되돌릴 수 없는 동작(삭제·공개 취소·연결 해제)은 전부 이걸 쓴다.
import { Button } from './Button';
import { Dialog } from './Dialog';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <span className="sr-only">{description}</span>
    </Dialog>
  );
}
