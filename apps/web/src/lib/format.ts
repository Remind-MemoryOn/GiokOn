// 화면 공용 표기 헬퍼 — 값이 없거나 잘못됐으면 만들지 않는다(자리표시자 금지 원칙).

/** 날짜 필터·그룹의 키 `YYYY-MM-DD`(로컬 날짜). 잘못된 값은 빈 문자열. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 초 → `14분 12초` 조각(숫자 SemiBold 35 · 단위 Regular 22 로 따로 그린다). 없으면 null. */
export function secondsParts(sec: number | null): { n: string; unit: string }[] | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r === 0 ? [{ n: `${m}`, unit: '분' }] : [{ n: `${m}`, unit: '분 ' }, { n: `${r}`, unit: '초' }];
}
