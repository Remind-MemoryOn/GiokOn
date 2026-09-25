// 프로필 행 → 화면용 어르신(ElderProfile). 여러 화면이 같은 memo 를 되풀이하던 것을 하나로.
import { useMemo } from 'react';
import { toElderProfile, type ProfileRow } from '@giokon/data';

/** 행이 없으면(로딩·없음) null — 값을 만들지 않는다. */
export function useElderProfile(row: ProfileRow | null | undefined) {
  return useMemo(() => (row ? toElderProfile(row) : null), [row]);
}
