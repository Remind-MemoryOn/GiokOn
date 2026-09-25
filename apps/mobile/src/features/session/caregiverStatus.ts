// 요양보호사 대화 화면 상태 — 자동 대화 단계별 안내 문구와 멈추기/재개 버튼 상태.
// 어르신 화면 문구는 elderStatus.ts 에 따로 둔다(보이는 대상이 다르다).
import type { AutomaticPhase } from '../../lib/live/automatic';

/** 요양보호사 안내 문구 — 컨트롤러 사유 문구(reason)가 없을 때 단계별로 보인다. */
export const CAREGIVER_STATUS: Record<AutomaticPhase, string> = {
  idle: '담당자가 시작하면 대화가 자동으로 이어져요.',
  starting: '대화를 준비하고 있어요.',
  listening: '말씀해 주세요.',
  processing: '말씀을 기록하고 응답을 준비하고 있어요.',
  speaking: '듣고 있어요...',
  pausing: '음성을 멈추고 있어요.',
  paused: '대화를 잠시 멈췄어요.',
  stopped: '대화를 멈췄어요. 기록을 저장해 주세요.',
};

/** 시작 전·종료 후가 아니면 대화 중이다(어르신 화면 복귀·멈추기 버튼 노출 기준). */
export function isInConversation(phase: AutomaticPhase): boolean {
  return !['idle', 'stopped'].includes(phase);
}

/**
 * 멈추기/재개 버튼.
 * 감독 화면의 원격 일시정지는 현장에서 풀지 않는다(사용자 확정) — 감독 화면 재개 시 자동으로 이어진다.
 * 확인하지 않은 부분 전사가 남아 있으면 먼저 정리해야 재개할 수 있다.
 */
export function pauseButtonState(
  phase: AutomaticPhase,
  remote: boolean | undefined,
  hasPending: boolean,
): { disabled: boolean; label: string } {
  return {
    disabled: phase === 'pausing' || (phase === 'paused' && (hasPending || remote === true)),
    label: phase === 'paused'
      ? (remote ? '감독 화면 재개 대기' : '대화 재개')
      : phase === 'pausing' ? '일시정지 중…' : '잠시 멈추기',
  };
}
