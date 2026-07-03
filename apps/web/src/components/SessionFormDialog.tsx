import { useState } from 'react';
import { Dialog } from './ui/Dialog';
import { Field, Input, Textarea } from './ui/Input';
import { Button } from './ui/Button';
import { useStore } from '../store/store';
import type { Session, TherapyType } from '../types';
import { THERAPY_TYPES } from '../types';
import { cn } from '../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  elderId: string;
  initial?: Session | null;
}

export function SessionFormDialog({ open, onClose, elderId, initial }: Props) {
  const upsertSession = useStore((s) => s.upsertSession);
  const toast = useStore((s) => s.toast);

  const [title, setTitle] = useState('');
  const [therapyType, setTherapyType] = useState<TherapyType>('reminiscence');
  const [note, setNote] = useState('');
  const [duration, setDuration] = useState(10);
  const [errors, setErrors] = useState<{ title?: string }>({});
  const [wasOpen, setWasOpen] = useState(false);

  // 열릴 때마다 initial로 초기화 — effect 내 setState 회피
  if (open && !wasOpen) {
    setWasOpen(true);
    setTitle(initial?.title ?? '');
    setTherapyType(initial?.therapyType ?? 'reminiscence');
    setNote(initial?.note ?? '');
    setDuration(initial?.durationMinutes ?? 10);
    setErrors({});
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  function submit() {
    if (!title.trim()) {
      setErrors({ title: '세션 제목을 입력해 주세요.' });
      return;
    }
    upsertSession({
      id: initial?.id,
      title: title.trim(),
      therapyType,
      note: note.trim() || undefined,
      durationMinutes: duration,
      elderId,
    });
    toast('success', initial ? '세션을 수정했어요.' : '세션을 만들었어요. AI가 대화를 진행합니다.');
    onClose();
  }

  function suggestTitle(t: TherapyType) {
    const map: Record<TherapyType, string> = {
      reminiscence: '오늘의 회상 대화',
      cognitive:    '오늘의 인지자극',
      music:        '옛 노래 한 곡',
      art:          '풍경 떠올리기',
    };
    if (!title) setTitle(map[t]);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? '세션 수정' : '새 활동 세션 만들기'}
      description="활동 종류만 정해 주세요. 대화 주제는 어르신의 연대기를 보고 AI가 알아서 골라 진행합니다."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={submit}>{initial ? '저장' : '만들기'}</Button>
        </>
      }
      size="lg"
    >
      <div className="space-y-5">
        <Field label="활동 종류" required>
          <div className="grid grid-cols-2 gap-3">
            {(Object.values(THERAPY_TYPES)).map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => {
                  setTherapyType(t.type);
                  suggestTitle(t.type);
                }}
                className={cn(
                  'text-left rounded-2xl border-2 p-4 transition group',
                  `bg-gradient-to-br ${t.gradient}`,
                  therapyType === t.type
                    ? `border-transparent ring-2 ring-offset-2 ${t.ringColor} shadow-warm`
                    : 'border-slate-200/50 hover:border-slate-300 hover:shadow-soft'
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-2xl">{t.emoji}</span>
                  <span className="font-bold text-slate-900">{t.label}</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{t.description}</p>
              </button>
            ))}
          </div>
        </Field>

        <Field label="세션 제목" required error={errors.title}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 오늘의 회상 대화"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Field label="요양보호사 메모" hint="AI에 직접 전달되지 않습니다. 본인 기록용.">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="예: 오늘은 컨디션이 좋으신 편. 천천히 진행해 주세요."
              />
            </Field>
          </div>
          <Field label="예상 시간 (분)">
            <Input
              type="number"
              min={1}
              max={60}
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
