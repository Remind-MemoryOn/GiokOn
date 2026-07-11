// 동의 행 → 활성 동의 유형 계산 (컴포넌트와 분리 — fast refresh 규칙).

import type { ConsentType } from '@giokon/core';
import type { ConsentRow } from '@giokon/data';

/** 활성(철회되지 않은) 동의 유형 집합을 계산한다. */
export function activeConsentTypes(rows: ConsentRow[] | undefined): ConsentType[] {
  if (!rows) return [];
  const active = new Set<ConsentType>();
  for (const r of rows) {
    if (r.granted && !r.revoked_at) active.add(r.consent_type as ConsentType);
  }
  return [...active];
}
