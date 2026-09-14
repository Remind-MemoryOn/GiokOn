import { useState } from 'react';
import { useGenerateSessionReport, useSessions } from '@giokon/data';
import { renderSessionJournal } from '@giokon/core';
import { Dialog } from './ui/Dialog';

export function SessionJournalDialog({ elderId, hasContent, onClose, onApply }: {
  elderId: string; hasContent: boolean; onClose: () => void; onApply: (text: string) => void;
}) {
  const sessions = useSessions(elderId);
  const generate = useGenerateSessionReport();
  const [selected, setSelected] = useState('');
  const rows = (sessions.data ?? []).filter(s => s.status === 'ended');
  const report = generate.data?.sourceSessionId === selected ? generate.data : null;
  const preview = report ? renderSessionJournal(report.result) : '';
  return (
    <Dialog open onClose={onClose} title="회상 대화에서 일지 초안 만들기" size="md">
      <p className="mb-4 text-ink-700">종료된 대화의 발화를 바탕으로 생성합니다. 당일 생활 관찰과 구분해 확인한 뒤 적용해 주세요.</p>
      {sessions.error ? <p role="alert">대화 목록을 불러오지 못했습니다. <button type="button" onClick={() => void sessions.refetch()}>다시 시도</button></p> : null}
      <label className="block font-semibold" htmlFor="journal-source-session">대화 선택</label>
      <select id="journal-source-session" value={selected} disabled={generate.isPending} onChange={e => { setSelected(e.target.value); generate.reset(); }} className="my-3 w-full rounded border border-line p-3">
        <option value="">{sessions.isLoading ? '대화를 불러오는 중…' : '종료된 대화를 선택하세요'}</option>
        {rows.map(s => <option key={s.id} value={s.id}>{new Date(s.started_at).toLocaleString('ko-KR')} · {s.title ?? '회상 대화'}</option>)}
      </select>
      {!sessions.isLoading && !sessions.error && rows.length === 0 ? <p>앱에서 대화를 종료하고 저장한 뒤 이용해 주세요.</p> : null}
      <button type="button" disabled={!selected || generate.isPending} onClick={() => generate.mutate(selected)} className="rounded bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50">
        {generate.isPending ? 'AI가 초안을 생성하고 있어요…' : 'AI 초안 생성·불러오기'}
      </button>
      {generate.error ? <p role="alert" className="mt-3 text-ink-700">{generate.error.message}</p> : null}
      {preview ? <>
        <h3 className="mb-2 mt-5 font-semibold">초안 미리보기</h3>
        <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap font-sans text-ink-900">{preview}</pre>
        <p className="my-3 text-ink-700">{hasContent ? '적용하면 작성 중인 본문을 이 초안으로 교체합니다. 취소하면 기존 본문을 유지합니다.' : '적용 후 본문을 확인·수정하고 저장해 주세요. 자동으로 저장·공개되지 않습니다.'}</p>
        {preview.length > 5000 ? <p role="alert">초안이 편집 가능한 5,000자를 초과했습니다. 다시 확인해 주세요.</p> : null}
        <button type="button" disabled={preview.length > 5000} onClick={() => onApply(preview)} className="rounded bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50">{hasContent ? '본문을 초안으로 교체' : '본문에 초안 적용'}</button>
      </> : null}
    </Dialog>
  );
}
