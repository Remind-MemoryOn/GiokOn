import { beforeEach, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '@giokon/core';
import { useApp } from './appStore';

beforeEach(() => {
  useApp.setState({ active: null, lastFinished: null });
  useApp.getState().beginSession({ id: 'e1', name: '테스트', birthYear: 1945,
    avatarColor: '#fff', appearance: DEFAULT_APPEARANCE, createdAt: '', updatedAt: '' }, [],
  { title: '테스트', therapyType: 'reminiscence' });
});

it.each(['고향 이야기', '수정한 이야기'])('records explicit confirmation and preserves the presented text: %s', text => {
  useApp.getState().setPendingStt('고향 이야기');
  useApp.getState().confirmUtterance(text);
  const turn = useApp.getState().active!.turns[1];
  expect(turn.provenance).toEqual({ kind: 'caregiver_confirmed', presentedText: '고향 이야기' });
  expect(turn.text).toBe(text);
});

it('does not invent a transcript for manual entry', () => {
  useApp.getState().captureUtterance();
  useApp.getState().confirmUtterance('직접 입력');
  expect(useApp.getState().active!.turns[1].provenance).toEqual({ kind: 'caregiver_confirmed', presentedText: null });
});

it('does not turn blank confirmation into an elder record', () => {
  const before = useApp.getState().active;
  useApp.getState().confirmUtterance('   ');
  expect(useApp.getState().active).toBe(before);
});
