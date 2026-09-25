// 설정 화면의 "내 이름" 칸 — 요양보호사·보호자 설정이 같은 규칙으로 저장한다.
import { useState } from 'react';
import { useUpdateMyName, type UserRow } from '@giokon/data';
import { useStore } from '../store/store';

/** 초기값은 서버 값(`me.name`)이다. 빈 이름은 저장하지 않고 알린다. */
export function useMyNameForm(me: UserRow | null) {
  const rename = useUpdateMyName();
  const toast = useStore((s) => s.toast);
  const [name, setName] = useState(me?.name ?? '');

  function onSave() {
    if (!me) return;
    if (!name.trim()) return toast('error', '이름을 입력해 주세요.');
    rename.mutate(
      { id: me.id, name: name.trim() },
      {
        onSuccess: () => toast('success', '이름을 저장했어요.'),
        onError: (e) => toast('error', e.message),
      },
    );
  }

  return { name, setName, onSave, saving: rename.isPending };
}
