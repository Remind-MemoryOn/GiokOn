import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useCareJournals,
  useCreateCareJournal,
  useCurrentUser,
  useProfile,
  useUpdateCareJournal,
} from '@giokon/data';
import { buildJournalDraft } from '@giokon/core';
import { useAuth } from '../../auth/AuthProvider';
import { useStore } from '../../store/store';
import { SessionJournalDialog } from '../../components/SessionJournalDialog';

function today(): string {
  const date = new Date();
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

export function JournalWritePage() {
  const { elderId, journalId } = useParams<{ elderId: string; journalId: string }>();
  const navigate = useNavigate();
  const { isConfigured } = useAuth();
  const toast = useStore((state) => state.toast);
  const me = useCurrentUser();
  const profile = useProfile(elderId);
  const editing = Boolean(journalId);
  const journals = useCareJournals(editing ? elderId : undefined);
  const existing = useMemo(
    () => (journals.data ?? []).find((journal) => journal.id === journalId) ?? null,
    [journals.data, journalId],
  );
  const createJournal = useCreateCareJournal();
  const updateJournal = useUpdateCareJournal();
  const seeded = useRef(false);
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [generatedSource, setGeneratedSource] = useState(false);
  const [sessionDraftOpen, setSessionDraftOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing || seeded.current) return;
    seeded.current = true;
    setDate(existing.journal_date);
    setFrom(existing.activity_from?.slice(0, 5) ?? '');
    setTo(existing.activity_to?.slice(0, 5) ?? '');
    setContent(existing.content);
    setGeneratedSource(existing.source === 'ai_draft');
  }, [existing]);

  function makeDraft() {
    if (!content.trim()) return toast('error', '먼저 활동 내용을 입력해 주세요.');
    if (originalContent !== null) return toast('error', '다시 정리하려면 먼저 원문으로 되돌려 주세요.');
    try {
      const original = content.trim();
      const draft = buildJournalDraft({
        elderName: profile.data?.name ?? '어르신',
        source: 'typed',
        rawText: original,
        date,
      });
      if (draft.length > 5000) {
        toast('error', '정리 결과가 5,000자를 초과합니다. 입력 내용을 나눠 작성해 주세요. 원문은 유지됩니다.');
        return;
      }
      setContent(draft);
      setOriginalContent(original);
      toast('success', '입력 문장을 규칙에 따라 정리했어요. 원문과 비교한 뒤 저장해 주세요.');
    } catch (error) {
      toast('error', error instanceof Error ? error.message : '초안을 만들지 못했어요.');
    }
  }

  async function save(status: 'draft' | 'final') {
    if (!elderId) return;
    if (!isConfigured) return toast('error', 'Supabase 연동 후 저장할 수 있어요.');
    if (!content.trim()) return toast('error', '활동 내용을 입력해 주세요.');
    if (from && to && to < from) return toast('error', '종료 시각이 시작 시각보다 빠릅니다.');
    setSaving(true);
    try {
      const fields = {
        journal_date: date,
        content: content.trim(),
        source: generatedSource ? 'ai_draft' as const : 'typed' as const,
        status,
        activity_from: from || null,
        activity_to: to || null,
      };
      if (editing && journalId) {
        await updateJournal.mutateAsync({ id: journalId, patch: fields });
      } else {
        await createJournal.mutateAsync({
          ...fields,
          profile_id: elderId,
          author_id: me.data?.id ?? null,
        });
      }
      toast('success', status === 'final' ? '프로그램일지를 저장했어요.' : '임시 저장했어요.');
      navigate(`/caregiver/journal/${elderId}`);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : '저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-[1057px] pb-16">
      <div className="flex items-start justify-between gap-4 pt-[47px]">
        <div>
          <h1 className="text-w-page font-bold leading-[70px] text-ink-900">{editing ? '프로그램일지 수정' : '새 프로그램일지 작성'}</h1>
          <p className="text-w-body leading-[30px] text-ink-700">활동 내용을 직접 작성하거나 회상 대화 기록에서 초안을 가져오세요. 저장 전 내용을 확인해 주세요.</p>
        </div>
        <Link to={`/caregiver/journal/${elderId ?? ''}`} className="mt-5 shrink-0 text-w-sub font-semibold text-ink-700 underline">목록으로</Link>
      </div>

      <form className="mt-10 rounded-[10px] bg-white p-10 shadow-card" onSubmit={(event) => { event.preventDefault(); void save('final'); }}>
        <h2 className="text-w-section font-bold text-ink-900">오늘의 활동</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2 text-w-sub font-semibold text-ink-900">기록일
            <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="h-[57px] rounded-[10px] border border-line px-4 font-normal text-ink-700" />
          </label>
          <label className="flex flex-col gap-2 text-w-sub font-semibold text-ink-900">시작 시각
            <input type="time" value={from} onChange={(event) => setFrom(event.target.value)} className="h-[57px] rounded-[10px] border border-line px-4 font-normal text-ink-700" />
          </label>
          <label className="flex flex-col gap-2 text-w-sub font-semibold text-ink-900">종료 시각
            <input type="time" value={to} onChange={(event) => setTo(event.target.value)} className="h-[57px] rounded-[10px] border border-line px-4 font-normal text-ink-700" />
          </label>
          <div className="flex flex-col gap-2 text-w-sub font-semibold text-ink-900">담당 요양보호사
            <div className="flex h-[57px] items-center rounded-[10px] border border-line px-4 font-normal text-ink-700">{me.data?.name ?? '—'}</div>
          </div>
        </div>
        <label htmlFor="program-journal-content" className="mt-8 block text-w-sub font-semibold text-ink-900">프로그램 활동 내용</label>
        <textarea
          id="program-journal-content"
          value={content}
          maxLength={5000}
          onChange={(event) => setContent(event.target.value)}
          className="mt-3 min-h-[300px] w-full rounded-[10px] border border-line p-5 text-w-body leading-8 text-ink-900 focus:border-accent focus:outline-none"
          placeholder="실제로 진행한 활동과 관찰한 내용을 입력해 주세요."
        />
        {originalContent ? (
          <div className="mt-5 rounded-[10px] border border-line bg-[#fbfbfb] p-5">
            <h3 className="text-w-sub font-semibold text-ink-900">정리 전 입력 원문</h3>
            <p className="mt-2 whitespace-pre-wrap text-w-sub leading-7 text-ink-700" style={{ wordBreak: 'keep-all' }}>{originalContent}</p>
            <button type="button" onClick={() => { setContent(originalContent); setOriginalContent(null); }} className="mt-3 text-w-label font-semibold text-accent underline">원문으로 되돌리기</button>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" disabled={!content.trim() || saving || originalContent !== null} onClick={makeDraft} className="rounded-[10px] border border-line px-5 py-3 text-w-sub font-semibold text-ink-700 disabled:opacity-50">입력 내용 규칙 정리</button>
          <button type="button" disabled={saving || !isConfigured} onClick={() => setSessionDraftOpen(true)} className="rounded-[10px] border border-accent px-5 py-3 text-w-sub font-semibold text-accent disabled:opacity-50">회상 대화에서 일지 초안</button>
        </div>
        <p className="mt-3 text-w-label text-ink-500">입력 내용 정리는 생성형 AI가 아닙니다. 회상 대화 초안은 AI가 생성하므로 발화 근거와 당일 관찰을 구분해 확인해 주세요.</p>
        <div className="mt-10 flex justify-end gap-4">
          <button type="button" disabled={saving} onClick={() => void save('draft')} className="rounded-[10px] border border-accent px-8 py-3 text-w-sub font-semibold text-accent disabled:opacity-50">임시 저장</button>
          <button type="submit" disabled={saving} className="rounded-[10px] bg-accent px-8 py-3 text-w-sub font-semibold text-white disabled:opacity-50">저장</button>
        </div>
      </form>
      {sessionDraftOpen && elderId ? (
        <SessionJournalDialog key={elderId} elderId={elderId} hasContent={Boolean(content.trim())}
          onClose={() => setSessionDraftOpen(false)}
          onApply={(text) => { setContent(text); setOriginalContent(null); setGeneratedSource(true); setSessionDraftOpen(false); }} />
      ) : null}
    </div>
  );
}
