import { beforeEach, expect, it } from 'vitest';
import { CRISIS_CAREGIVER_ALERT, DEFAULT_APPEARANCE, DISTRESS_CAREGIVER_NOTE } from '@giokon/core';
import { useApp } from './appStore';

beforeEach(() => {
  useApp.setState({ active: null, lastFinished: null });
  useApp.getState().beginSession({ id: 'e1', name: '테스트', birthYear: 1945,
    avatarColor: '#fff', appearance: DEFAULT_APPEARANCE, createdAt: '', updatedAt: '' }, [],
  { title: '테스트', therapyType: 'reminiscence' });
  expect(useApp.getState().acceptOpener('고향이 어디세요?')).toBe(true);
});

it('starts with no AI turn and no topic until the relay greeting is accepted — nothing is fabricated', () => {
  useApp.setState({ active: null });
  useApp.getState().beginSession({ id: 'e2', name: '테스트', birthYear: 1945,
    avatarColor: '#fff', appearance: DEFAULT_APPEARANCE, createdAt: '', updatedAt: '' }, [],
  { title: '테스트', therapyType: 'reminiscence' });
  const a = useApp.getState().active!;
  expect(a.turns).toEqual([]);
  expect(a.currentQuestion).toBe('');
  expect(a.currentTopic).toBeNull();
  useApp.getState().finishSession();
  expect(useApp.getState().lastFinished).toMatchObject({ turns: [], currentTopic: null });
});

it('accepts the opener once, only when it passes the output guard', () => {
  useApp.setState({ active: { ...useApp.getState().active!, turns: [], currentQuestion: '' } });
  expect(useApp.getState().acceptOpener('   ')).toBe(false);
  expect(useApp.getState().acceptOpener('치매 진단을 받으셨죠?')).toBe(false);
  expect(useApp.getState().active!.turns).toEqual([]);
  expect(useApp.getState().acceptOpener('어르신, 오늘 고향 이야기를 들려주시겠어요?')).toBe(true);
  expect(useApp.getState().active!.turns).toHaveLength(1);
  expect(useApp.getState().active!.currentQuestion).toBe('어르신, 오늘 고향 이야기를 들려주시겠어요?');
  expect(useApp.getState().acceptOpener('두 번째 인사')).toBe(false);
  expect(useApp.getState().active!.turns).toHaveLength(1);
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

it('retains playback observations in the finished bundle without sharing mutable entries',()=>{
  const before=useApp.getState().active!, turn=before.turns[0];
  useApp.getState().markTurnPlayback(turn.id,turn.text,'completed');
  const live=useApp.getState().active!.playbackByTurnId!;
  useApp.getState().finishSession();
  expect(useApp.getState().lastFinished!.playbackByTurnId?.[turn.id]).toEqual(live[turn.id]);
  live[turn.id].result='interrupted';
  expect(useApp.getState().lastFinished!.playbackByTurnId?.[turn.id].result).toBe('completed');
});

it('retains a relay review request without inventing a transcript or crisis category',()=>{
  const turns=useApp.getState().active!.turns;
  useApp.getState().requireRelayReview(); useApp.getState().requireRelayReview();
  const active=useApp.getState().active!;
  expect(active.turns).toEqual(turns);
  expect(active.events).toHaveLength(1);
  expect(active.events[0]).toMatchObject({level:'watch',categories:[],matchedTerms:[],excerpt:'',acknowledgedAt:null});
  expect(active.safety.recommendation).toBe('end_session');
  useApp.getState().acknowledgeSafety();useApp.getState().finishSession();
  expect(useApp.getState().lastFinished!.events[0].acknowledgedAt).not.toBeNull();
});
it('links a relay-recorded safety event instead of recording it again (T21.4)',()=>{
  const id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  useApp.getState().requireRelayReview({remoteId:id}); useApp.getState().requireRelayReview();
  const active=useApp.getState().active!;
  expect(active.events).toHaveLength(1);
  expect(active.events[0]).toMatchObject({remoteId:id,acknowledgedAt:null,ackSynced:false});
  useApp.getState().acknowledgeSafety();
  expect(useApp.getState().active!.events[0]).toMatchObject({remoteId:id,ackSynced:false});
  expect(useApp.getState().active!.events[0].acknowledgedAt).not.toBeNull();
});
it.each([
  ['recorded by the relay',{remoteId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'}],
  ['not recorded (failure or timeout) — the app records it on save',{}],
] as const)('keeps the relay crisis level, categories and specific guidance when %s (T25.14)',(_,extra)=>{
  useApp.getState().requireRelayReview({...extra,safety:{level:'crisis',categories:['self_harm'],alert:'self_harm'}});
  const active=useApp.getState().active!;
  expect(active.events).toHaveLength(1);
  expect(active.events[0]).toMatchObject({level:'crisis',categories:['self_harm'],matchedTerms:[],excerpt:'',
    caregiverAlert:CRISIS_CAREGIVER_ALERT.self_harm,remoteId:'remoteId' in extra ? extra.remoteId : null});
  expect(active.safety).toMatchObject({level:'crisis',caregiverAlert:CRISIS_CAREGIVER_ALERT.self_harm,recommendation:'end_session',acknowledged:false});
  expect(active.safety.caregiverAlert).toContain('109');
});
it('shows the distress note at watch level for a relay distress summary (T25.14)',()=>{
  useApp.getState().requireRelayReview({safety:{level:'watch',categories:[],alert:'distress'}});
  expect(useApp.getState().active!.safety).toMatchObject({level:'watch',caregiverAlert:DISTRESS_CAREGIVER_NOTE});
});
it('never replaces an existing crisis with a generic relay review',()=>{
  useApp.getState().adoptAutomaticInput('죽고 싶어요');
  const before=useApp.getState().active!;
  useApp.getState().requireRelayReview();
  expect(useApp.getState().active!.safety).toEqual(before.safety);
  expect(useApp.getState().active!.events).toEqual(before.events);
});
