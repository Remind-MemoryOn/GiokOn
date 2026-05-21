import { useMemo, useState } from 'react';
import { Plus, Sparkles, User, Pencil, Trash2, X } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Dialog } from './ui/Dialog';
import { Field, Input, Textarea } from './ui/Input';
import { useStore } from '../store/store';
import { formatRelative } from '../lib/utils';
import type { ChronicleEntry } from '../types';

interface Props {
  elderId: string;
}

const TOPIC_SUGGESTIONS = ['고향', '가족', '직업', '취미', '학창 시절', '음식', '추억'];

export function ChronicleView({ elderId }: Props) {
  const allChronicles = useStore((s) => s.chronicles);
  const entries = useMemo(
    () =>
      allChronicles
        .filter((c) => c.elderId === elderId)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [allChronicles, elderId]
  );
  const deleteChronicle = useStore((s) => s.deleteChronicle);
  const toast = useStore((s) => s.toast);

  const [editing, setEditing] = useState<ChronicleEntry | null>(null);
  const [open, setOpen] = useState(false);

  function startNew() {
    setEditing(null);
    setOpen(true);
  }
  function startEdit(e: ChronicleEntry) {
    setEditing(e);
    setOpen(true);
  }

  return (
    <Card>
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900">연대기</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            <Sparkles size={11} className="inline -mt-0.5 mr-0.5 text-purple-500" />
            AI 자동 축적 + 요양보호사 직접 입력
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={startNew}>
          <Plus size={14} /> 항목 추가
        </Button>
      </div>
      <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
        {entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            아직 연대기가 없습니다. 첫 항목을 추가하거나, AI와 대화를 시작해 보세요.
          </div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="px-5 py-4 group hover:bg-slate-50/60">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge tone={e.source === 'AI' ? 'pink' : 'info'}>
                  {e.source === 'AI' ? (
                    <><Sparkles size={10} className="mr-1" /> AI 자동</>
                  ) : (
                    <><User size={10} className="mr-1" /> 요양보호사</>
                  )}
                </Badge>
                <Badge tone="brand">{e.topic}</Badge>
                <span className="text-[11px] text-slate-400 ml-auto">{formatRelative(e.recordedAt)}</span>
                <div className="flex opacity-0 group-hover:opacity-100 transition gap-0.5">
                  <button
                    onClick={() => startEdit(e)}
                    className="text-slate-400 hover:text-slate-700 p-1 rounded"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => {
                      deleteChronicle(e.id);
                      toast('info', '연대기 항목을 삭제했습니다.');
                    }}
                    className="text-slate-400 hover:text-red-500 p-1 rounded"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="text-sm text-slate-800 leading-relaxed">{e.content}</div>
              {e.keywords.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-2">
                  {e.keywords.map((k) => (
                    <span
                      key={k}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                    >
                      #{k}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <EntryDialog
        open={open}
        onClose={() => setOpen(false)}
        elderId={elderId}
        initial={editing}
      />
    </Card>
  );
}

interface EntryProps {
  open: boolean;
  onClose: () => void;
  elderId: string;
  initial: ChronicleEntry | null;
}

function EntryDialog({ open, onClose, elderId, initial }: EntryProps) {
  const upsertChronicle = useStore((s) => s.upsertChronicle);
  const toast = useStore((s) => s.toast);

  const [topic, setTopic] = useState<string>(initial?.topic || '추억');
  const [content, setContent] = useState(initial?.content || '');
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords || []);
  const [keywordInput, setKeywordInput] = useState('');
  const [errors, setErrors] = useState<{ content?: string }>({});

  // reset when opens
  if (open && initial && (topic !== initial.topic || content !== initial.content)) {
    // we trust the initial mount
  }

  function addKeyword(k: string) {
    const clean = k.trim();
    if (!clean || keywords.includes(clean)) return;
    setKeywords([...keywords, clean]);
    setKeywordInput('');
  }

  function submit() {
    if (!content.trim()) {
      setErrors({ content: '내용을 입력해 주세요.' });
      return;
    }
    upsertChronicle({
      id: initial?.id,
      elderId,
      topic,
      content: content.trim(),
      keywords,
      source: initial?.source || 'Caregiver',
    });
    toast('success', initial ? '연대기를 수정했어요.' : '연대기에 추가했어요.');
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? '연대기 수정' : '연대기 항목 추가'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={submit}>저장</Button>
        </>
      }
      size="md"
    >
      <div className="space-y-4">
        <Field label="주제">
          <div className="flex flex-wrap gap-1.5">
            {TOPIC_SUGGESTIONS.map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className={
                  topic === t
                    ? 'text-xs px-2.5 py-1 rounded-full bg-brand-500 text-white'
                    : 'text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50'
                }
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        <Field label="내용" required error={errors.content}>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="예: 전주 시내에서 30년 동안 백반 식당을 운영했다."
          />
        </Field>
        <Field label="키워드" hint="회상 질문 생성에 활용됩니다.">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {keywords.map((k) => (
              <Badge key={k} tone="brand" className="gap-1 pr-1">
                {k}
                <button
                  onClick={() => setKeywords(keywords.filter((x) => x !== k))}
                  className="hover:bg-brand-100 rounded-full p-0.5"
                >
                  <X size={10} />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addKeyword(keywordInput);
                }
              }}
              placeholder="키워드 입력 후 Enter"
            />
            <Button size="md" variant="outline" onClick={() => addKeyword(keywordInput)}>
              추가
            </Button>
          </div>
        </Field>
      </div>
    </Dialog>
  );
}
