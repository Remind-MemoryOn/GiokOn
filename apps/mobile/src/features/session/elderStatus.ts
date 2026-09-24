// 어르신 화면 상태 문구 — 자동 대화 단계별 고정값(계획 M2).
// 컨트롤러 사유 문구(요양보호사 안내)나 안전 알림 내용은 어르신 화면에 쓰지 않는다.
import type { AutomaticPhase } from '../../lib/live/automatic';

/** 어르신께 보이는 상태 문구 — 단계별 고정값. 컨트롤러 사유 문구는 쓰지 않는다. */
export const ELDER_STATUS: Record<AutomaticPhase, string> = {
  idle: '곧 이야기를 시작해요.',
  starting: '곧 이야기를 시작해요.',
  speaking: '듣고 있어요...',
  listening: '말씀해 주세요.',
  processing: '말씀을 정리하고 있어요...',
  pausing: '잠시 쉬어요.',
  paused: '잠시 쉬어요.',
  stopped: '이야기를 잠시 멈췄어요.\n선생님을 기다려 주세요.',
};
