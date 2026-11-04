// 플로팅 대화창의 시각·날짜 표시 — 기기 시간대가 아니라 한국 시각(Asia/Seoul)으로 보인다.

/** `오전 10:18` — 기기 시간대가 아니라 한국 시각으로 보인다. */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' });
}

/** `2026년 9월 21일 월요일`. */
export function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' });
}
