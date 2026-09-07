// 조회 실패를 화면이 "기록 없음" 으로 보이게 두지 않는다.
//
// 문제: 화면 30여 곳이 `data ?? []` 로만 그린다. RLS 거부·네트워크 실패·권한 만료가
// 전부 **빈 목록**으로 나타나, 요양보호사는 "이 어르신은 기록이 없다"고 읽는다.
// 어르신 개인에 대한 기록에서 이 오해는 감당할 수 없다.
//
// 왜 배너인가: 화면들은 Figma 실측 좌표로 절대 배치돼 있어 페이지마다 오류 블록을
// 끼워 넣으면 레이아웃(과 픽셀 대조 1511 프로브)이 흔들린다. 셸에 고정 배너를 띄우면
// **레이아웃을 건드리지 않고** 모든 화면이 한 번에 사실을 말한다.
//
// 화면별 정밀한 오류 표시(문의 목록처럼 그 자리에서 재시도)는 이 배너를 대체하는 게
// 아니라 더한다 — 배너는 어디서도 놓치지 않게 하는 바닥선이다.
import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** 지금 캐시에서 실패 상태인 쿼리 수. 성공·재시도 중에는 0 으로 돌아간다. */
function useFailedQueryCount(): number {
  const qc = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => qc.getQueryCache().subscribe(onChange),
    [qc],
  );
  const snapshot = useCallback(
    () =>
      qc
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.status === 'error' && q.getObserversCount() > 0).length,
    [qc],
  );
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

export function QueryErrorBanner() {
  const qc = useQueryClient();
  const failed = useFailedQueryCount();
  if (failed === 0) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-40 flex items-center justify-center gap-4 bg-accent-soft px-6 py-3 text-w-body text-ink-900"
    >
      <span style={{ wordBreak: 'keep-all' }}>
        일부 정보를 불러오지 못했어요. <b className="font-semibold">화면이 비어 보여도 기록이
        없다는 뜻이 아닙니다.</b>
      </span>
      <button
        type="button"
        onClick={() => void qc.refetchQueries({ type: 'active', stale: true })}
        className="shrink-0 rounded-[10px] border border-accent bg-white px-4 py-1.5 text-w-label font-semibold text-accent"
      >
        다시 시도
      </button>
    </div>
  );
}
