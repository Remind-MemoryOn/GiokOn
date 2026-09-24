import { describe, expect, it } from 'vitest';
import { VOICE_FAILURE_MESSAGES } from '@giokon/core';
import { ELDER_STATUS } from './elderStatus';

describe('elder display copy', () => {
  it('has fixed, elder-facing copy for every automatic phase', () => {
    for (const text of Object.values(ELDER_STATUS)) expect(text.trim()).not.toBe('');
    expect(ELDER_STATUS.listening).toBe('말씀해 주세요.');
    expect(ELDER_STATUS.paused).toBe('잠시 쉬어요.');
  });
  it('never shows caregiver instructions, phone numbers or failure internals to the elder', () => {
    const shown = Object.values(ELDER_STATUS).join('\n');
    expect(shown).not.toMatch(/\d{3}|저장|회수|담당자|중계|연결|위기|PIN/);
    for (const message of Object.values(VOICE_FAILURE_MESSAGES)) expect(shown).not.toContain(message);
  });
});
