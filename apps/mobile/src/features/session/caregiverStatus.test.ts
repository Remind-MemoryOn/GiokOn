import { describe, expect, it } from 'vitest';
import type { AutomaticPhase } from '../../lib/live/automatic';
import { CAREGIVER_STATUS, isInConversation, pauseButtonState } from './caregiverStatus';

const PHASES: AutomaticPhase[] = ['idle', 'starting', 'processing', 'speaking', 'listening', 'pausing', 'paused', 'stopped'];

describe('caregiver status copy', () => {
  it('has copy for every automatic phase', () => {
    for (const phase of PHASES) expect(CAREGIVER_STATUS[phase].trim()).not.toBe('');
    expect(CAREGIVER_STATUS.stopped).toBe('대화를 멈췄어요. 기록을 저장해 주세요.');
  });

  it('is in conversation for every phase except idle and stopped', () => {
    expect(PHASES.filter(isInConversation)).toEqual(['starting', 'processing', 'speaking', 'listening', 'pausing', 'paused']);
  });
});

describe('pause button', () => {
  it('pauses while running', () => {
    for (const phase of ['starting', 'processing', 'speaking', 'listening'] as const) {
      expect(pauseButtonState(phase, false, false)).toEqual({ disabled: false, label: '잠시 멈추기' });
    }
  });

  it('is disabled while pausing', () => {
    expect(pauseButtonState('pausing', false, false)).toEqual({ disabled: true, label: '일시정지 중…' });
  });

  it('resumes a local pause only when no recovered input is pending', () => {
    expect(pauseButtonState('paused', false, false)).toEqual({ disabled: false, label: '대화 재개' });
    expect(pauseButtonState('paused', undefined, false)).toEqual({ disabled: false, label: '대화 재개' });
    expect(pauseButtonState('paused', false, true)).toEqual({ disabled: true, label: '대화 재개' });
  });

  it('never resumes a supervisor (remote) pause on site', () => {
    expect(pauseButtonState('paused', true, false)).toEqual({ disabled: true, label: '감독 화면 재개 대기' });
  });

  it('pending input alone does not disable a running conversation', () => {
    expect(pauseButtonState('listening', true, true)).toEqual({ disabled: false, label: '잠시 멈추기' });
  });
});
