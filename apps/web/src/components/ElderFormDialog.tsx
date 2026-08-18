import { useState } from 'react';
import { Dialog } from './ui/Dialog';
import { Field, Input, Textarea } from './ui/Input';
import { Button } from './ui/Button';
import { birthYearFromDate, isBirthDate } from '@giokon/core';
import {
  useCreateProfile,
  useUpdateProfile,
  toProfileInsert,
  toProfileUpdate,
  type ElderWriteInput,
} from '@giokon/data';
import { useStore } from '../store/store';
import { useAuth } from '../auth/AuthProvider';
import type { ElderProfile } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: ElderProfile | null;
}

const empty = {
  name: '',
  /** 생년월일 `YYYY-MM-DD`. DB 가 birth_year 와 연도 일치를 강제하므로 날짜로 받는다. */
  birthDate: '',
  hometown: '',
  job: '',
  family: '',
  hobbies: '',
  guardianName: '',
  guardianRelation: '',
};

export function ElderFormDialog({ open, onClose, initial }: Props) {
  const toast = useStore((s) => s.toast);
  const { user } = useAuth();
  const userId = user?.id;
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const saving = createProfile.isPending || updateProfile.isPending;

  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof empty, string>>>({});
  const [wasOpen, setWasOpen] = useState(false);

  // 열릴 때마다 initial로 폼 초기화 — effect 내 setState 대신 렌더 단계 동기화
  if (open && !wasOpen) {
    setWasOpen(true);
    setForm(
      initial
        ? {
            name: initial.name,
            birthDate: initial.birthDate ?? '',
            hometown: initial.hometown || '',
            job: initial.job || '',
            family: initial.family || '',
            hobbies: initial.hobbies || '',
            guardianName: initial.guardian?.name || '',
            guardianRelation: initial.guardian?.relation || '',
          }
        : empty,
    );
    setErrors({});
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  function update<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    const next: typeof errors = {};
    if (!form.name.trim()) next.name = '이름을 입력해 주세요.';
    if (!isBirthDate(form.birthDate)) {
      next.birthDate = '생년월일을 선택해 주세요.';
    } else if (form.birthDate < '1900-01-01' || form.birthDate > '2006-12-31') {
      next.birthDate = '1900 ~ 2006 사이의 생년월일을 선택해 주세요.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (!userId) {
      toast('error', '로그인이 필요합니다.');
      return;
    }

    const input: ElderWriteInput = {
      name: form.name.trim(),
      birthDate: form.birthDate,
      birthYear: birthYearFromDate(form.birthDate),
      hometown: form.hometown.trim() || undefined,
      job: form.job.trim() || undefined,
      family: form.family.trim() || undefined,
      hobbies: form.hobbies.trim() || undefined,
      // 보호자는 웹 폼이 소유하는 필드 → 비우면 명시적으로 null(지움)을 보낸다.
      // (undefined 로 두면 매퍼가 "건드리지 않음"으로 해석해 지울 수 없다.)
      guardian: form.guardianName.trim()
        ? { name: form.guardianName.trim(), relation: form.guardianRelation.trim() || '자녀' }
        : null,
      // 성별은 앱 폼에만 있다 → undefined(=건드리지 않음)로 두어 앱이 넣은 값을 보존한다.
    };

    try {
      if (initial) {
        await updateProfile.mutateAsync({ id: initial.id, patch: toProfileUpdate(input) });
        toast('success', '연대기를 수정했어요.');
      } else {
        await createProfile.mutateAsync(toProfileInsert(input, userId));
        toast('success', '새 어르신을 등록했어요.');
      }
      onClose();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? '연대기 수정' : '새 어르신 등록'}
      description="AI가 이 연대기를 바탕으로 어르신과 대화합니다. 채워질수록 대화가 풍부해져요."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? '저장 중...' : initial ? '저장' : '등록'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="이름" required error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="예: 이순자"
          />
        </Field>
        <Field label="생년월일" required error={errors.birthDate}>
          <Input
            type="date"
            min="1900-01-01"
            max="2006-12-31"
            value={form.birthDate}
            onChange={(e) => update('birthDate', e.target.value)}
          />
        </Field>
        <Field label="출신지">
          <Input
            value={form.hometown}
            onChange={(e) => update('hometown', e.target.value)}
            placeholder="예: 전북 전주"
          />
        </Field>
        <Field label="직업 이력">
          <Input
            value={form.job}
            onChange={(e) => update('job', e.target.value)}
            placeholder="예: 식당 운영, 30년"
          />
        </Field>
        <Field label="가족 구성" hint="자녀·손자녀 등">
          <Textarea
            value={form.family}
            onChange={(e) => update('family', e.target.value)}
            placeholder="예: 딸 둘, 사위 둘, 손자 셋"
          />
        </Field>
        <Field label="취미">
          <Textarea
            value={form.hobbies}
            onChange={(e) => update('hobbies', e.target.value)}
            placeholder="예: 텃밭 가꾸기, 화투"
          />
        </Field>
        <Field label="보호자 이름" hint="세션 종료 후 자동 리포트가 전달됩니다.">
          <Input
            value={form.guardianName}
            onChange={(e) => update('guardianName', e.target.value)}
            placeholder="예: 박민준"
          />
        </Field>
        <Field label="관계">
          <Input
            value={form.guardianRelation}
            onChange={(e) => update('guardianRelation', e.target.value)}
            placeholder="예: 아들 / 딸 / 며느리"
          />
        </Field>
      </div>
    </Dialog>
  );
}
