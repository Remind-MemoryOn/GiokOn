// 보호자가 공개 항목을 열어 본 사실을 남긴다(공개 이력의 "보호자 확인" · 확인 정보 모달이 읽는다).
import { useEffect, useRef } from 'react';
import { useMarkShareViewed } from '@giokon/data';

/** 한 번 연 화면에서 두 번 세지 않도록 공개 id 당 한 번만 부른다. */
export function useMarkShareViewedOnce(shareId: string | undefined, enabled: boolean) {
  // `mutate` 는 렌더마다 같은 함수라 의존성에 둬도 다시 부르지 않는다(ref 가 한 번 더 막는다).
  const { mutate } = useMarkShareViewed();
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !shareId || marked.current === shareId) return;
    marked.current = shareId;
    mutate(shareId);
  }, [enabled, shareId, mutate]);
}
