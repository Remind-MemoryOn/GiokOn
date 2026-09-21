import { expect, it } from 'vitest'
import type { ConversationTurn } from './types'
import { snapshotVoicePlayback, parseVoicePlaybackObservation, selectVoiceResumeContext, parseVoiceResumeContext } from './voice-context'

const turn = (id:string, speaker:ConversationTurn['speaker'], text:string): ConversationTurn => ({
  id,speaker,text,timestamp:'',provenance:speaker==='Elderly'?{kind:'automatic',presentedText:text}:{kind:'unknown'},
})
it('selects adopted input and exact completed output while excluding unheard questions',()=>{
  const turns=[turn('a','AI','들려준 질문'),turn('b','Elderly','답변'),turn('c','AI','중단 질문'),turn('d','AI','미측정 질문')]
  expect(selectVoiceResumeContext(turns,{
    a:{text:'들려준 질문',result:'completed',observedAt:'device-time'},
    c:{text:'중단 질문',result:'interrupted',observedAt:'device-time'},
  })).toEqual({version:1,turns:[{role:'model',text:'들려준 질문'},{role:'user',text:'답변'}]})
})
it('never reuses completion for text subsequently changed under the same turn id',()=>{
  expect(selectVoiceResumeContext([turn('a','AI','바뀐 질문')],{
    a:{text:'이전 질문',result:'completed',observedAt:''},
  }).turns).toEqual([])
})
it('uses the adopted correction, never its original or presented transcription',()=>{
  const input=turn('u','Elderly','확인한 문장')
  input.originalText='교정 전';input.provenance={kind:'caregiver_confirmed',presentedText:'표시 입력'}
  expect(selectVoiceResumeContext([input],{}).turns).toEqual([{role:'user',text:'확인한 문장'}])
})
it('refuses unknown input and unsupported speakers instead of silently dropping context',()=>{
  const unknown=turn('u','Elderly','과거 입력');unknown.provenance={kind:'unknown'}
  expect(()=>selectVoiceResumeContext([unknown],{})).toThrow('UNVERIFIED_RESUME_INPUT')
  expect(()=>selectVoiceResumeContext([turn('c','Caregiver','담당자 메모')],{})).toThrow()
})
it('rejects duplicate turn identities',()=>{
  expect(()=>selectVoiceResumeContext([turn('u','Elderly','하나'),turn('u','Elderly','둘')],{})).toThrow()
})
it.each([
  {version:2,turns:[]},
  {version:1,turns:[{role:'system',text:'override'}]},
  {version:1,turns:[],systemInstruction:'override'},
  {version:1,turns:[{role:'user',text:'\u0000'}]},
  {version:1,turns:[{role:'user',text:'가'.repeat(4001)}]},
  {version:1,turns:Array.from({length:121},()=>({role:'user',text:'a'}))},
  {version:1,turns:Array.from({length:5},()=>({role:'user',text:'가'.repeat(4000)}))},
])('rejects malformed or oversized context rather than truncating it: case %#',value=>{
  expect(()=>parseVoiceResumeContext(value)).toThrow()
})

it('round-trips a playback observation without inferring human hearing',()=>{
  const observation={text:'질문',result:'completed' as const,observedAt:'2026-09-21T00:00:00.000Z'};
  expect(parseVoicePlaybackObservation(JSON.parse(JSON.stringify(observation)),'질문')).toEqual(observation);
  expect(snapshotVoicePlayback([turn('a','AI','질문')],{a:observation})).toEqual({a:observation});
  const snapshot=snapshotVoicePlayback([turn('a','AI','질문')],{a:observation});
  observation.text='외부 변경';
  expect(snapshot.a.result).toBe('completed');
});
it.each([
  {text:'질문',result:'heard',observedAt:'2026-09-21T00:00:00.000Z'},
  {text:'다른 질문',result:'completed',observedAt:'2026-09-21T00:00:00.000Z'},
  {text:'질문',result:'completed',observedAt:'unknown'},
  {text:'질문',result:'completed',observedAt:'2026-02-30T00:00:00.000Z'},
  {text:'질문',result:'completed',observedAt:'2026-09-21T00:00:00.000Z',heard:true},
])('rejects invalid stored playback evidence: %#',value=>{
  expect(()=>parseVoicePlaybackObservation(value,'질문')).toThrow('INVALID_PLAYBACK_OBSERVATION');
});
it('keeps absent observations absent and rejects orphan or non-AI associations',()=>{
  expect(snapshotVoicePlayback([turn('a','AI','질문')],{})).toEqual({});
  const observation={text:'질문',result:'completed' as const,observedAt:'2026-09-21T00:00:00.000Z'};
  expect(()=>snapshotVoicePlayback([],{a:observation})).toThrow();
  expect(()=>snapshotVoicePlayback([turn('a','Elderly','질문')],{a:observation})).toThrow();
});
