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
  useApp.getState().setPendingStt('고향 이야기', 'gemini_live');
  useApp.getState().confirmUtterance(text);
  const turn = useApp.getState().active!.turns[1];
  expect(turn.provenance).toEqual({ kind: 'caregiver_confirmed', presentedText: '고향 이야기', inputSource: 'gemini_live' });
  expect(turn.text).toBe(text);
});

it('does not invent a transcript for manual entry', () => {
  useApp.getState().captureUtterance();
  useApp.getState().confirmUtterance('직접 입력');
  expect(useApp.getState().active!.turns[1].provenance).toEqual({ kind: 'caregiver_confirmed', presentedText: null, inputSource: 'manual' });
});

it('does not turn blank confirmation into an elder record', () => {
  const before = useApp.getState().active;
  useApp.getState().confirmUtterance('   ');
  expect(useApp.getState().active).toBe(before);
});

it('automatically adopts input without inventing an AI response or human confirmation',()=>{
  expect(useApp.getState().adoptAutomaticInput('고향 이야기')).toBe('continue');
  const turns=useApp.getState().active!.turns;
  expect(turns).toHaveLength(2);
  expect(turns[1].provenance).toEqual({kind:'automatic',presentedText:'고향 이야기',inputSource:'gemini_live'});
  expect(useApp.getState().acceptAutomaticResponse('고향에서 무엇을 하셨어요?')).toBe(true);
  expect(useApp.getState().active!.turns).toHaveLength(3);
});
it('records a crisis but requires help without adding a made-up delivered response',()=>{
  expect(useApp.getState().adoptAutomaticInput('죽고 싶어요')).toBe('help');
  expect(useApp.getState().active!.turns).toHaveLength(2);
  expect(useApp.getState().active!.safety.caregiverAlert).toBeTruthy();
});

it('keeps a partial input out of the record until explicit recovery confirmation', () => {
  useApp.getState().setPendingStt('고향은 전', 'gemini_live');
  expect(useApp.getState().active!.turns).toHaveLength(1);
  expect(useApp.getState().confirmRecoveredInput('고향은 전주예요')).toBe(true);
  const turns = useApp.getState().active!.turns;
  expect(turns).toHaveLength(2);
  expect(turns[1]).toMatchObject({text:'고향은 전주예요',originalText:'고향은 전',
    provenance:{kind:'caregiver_confirmed',presentedText:'고향은 전',inputSource:'gemini_live'}});
  expect(useApp.getState().active!.pendingStt).toBeNull();
  expect(useApp.getState().confirmRecoveredInput('중복')).toBe(false);
});

it('rejects empty recovery confirmation without losing the pending input', () => {
  useApp.getState().setPendingStt('부분 입력', 'gemini_live');
  expect(useApp.getState().confirmRecoveredInput('  ')).toBe(false);
  expect(useApp.getState().active!.pendingStt).toBe('부분 입력');
});

it('records delivery only for the matching AI turn without implying a person heard it', () => {
  const {id,text} = useApp.getState().active!.turns[0];
  expect(useApp.getState().markTurnPlayback('missing',text,'completed')).toBe(false);
  expect(useApp.getState().markTurnPlayback(id,'다른 질문','completed')).toBe(false);
  expect(useApp.getState().markTurnPlayback(id,text,'interrupted')).toBe(true);
  expect(useApp.getState().active!.playbackByTurnId?.[id]).toMatchObject({result:'interrupted'});
  useApp.getState().adoptAutomaticInput('고향 이야기');
  const input = useApp.getState().active!.turns[1].id;
  expect(useApp.getState().markTurnPlayback(input,'고향 이야기','completed')).toBe(false);
});

it('appends a resumed response without rewriting an unplayed AI turn and rejects stale adoption',()=>{
  const old=useApp.getState().active!.turns[0];
  expect(useApp.getState().acceptResumedResponse('고향 이야기를 들려주세요.',old.id)).toBe(true);
  expect(useApp.getState().active!.turns[0]).toEqual(old);
  expect(useApp.getState().acceptResumedResponse('중복 질문',old.id)).toBe(false);
});
