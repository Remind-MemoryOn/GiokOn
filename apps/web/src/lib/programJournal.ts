// 프로그램 일지(파일럿 W1) 화면 공용 — 상태·칸 이름·표기.
// 규칙 판정(확정·수정 사유·보호자 문장 승인)은 서버 트리거가 한다. 여기에는 **보이는 말**만 둔다.
import type { JournalNonDeliveryReason, ProgramJournalRow, ProgramJournalStatus } from '@giokon/data';

/** 상태 칩 — 계획 SCR-W15 의 네 상태. 색은 점으로만 쓰고 글자는 본문색(대비). */
export const JOURNAL_STATUS: Record<ProgramJournalStatus, { label: string; dot: string; bg: string }> = {
  generating: { label: '생성 중', dot: 'bg-info', bg: 'bg-info-soft' },
  pending_review: { label: '확인 대기', dot: 'bg-accent', bg: 'bg-accent-tint' },
  final: { label: '확정', dot: 'bg-live', bg: 'bg-live-soft' },
  failed: { label: '생성 실패', dot: 'bg-alert', bg: 'bg-alert-soft' },
};

export const NON_DELIVERY_LABEL: Record<JournalNonDeliveryReason, string> = {
  absent: '결석',
  unwell: '컨디션 난조',
  refused: '거부',
  other: '기타',
};

/** 공단 서식 칸 이름 — 상세 폼과 수정 이력이 같은 이름을 쓴다(서버 이력의 추적 칸과 같은 목록). */
export const JOURNAL_FIELD_LABEL: Record<string, string> = {
  journal_date: '운영일',
  operated_from: '시작 시각',
  operated_to: '종료 시각',
  program_type: '프로그램 유형',
  location: '장소',
  facilitator_user_id: '진행자',
  participants: '참여자',
  goal: '목표',
  activity_content: '진행 내용',
  participant_response: '수급자 반응·특이사항',
  opinion_collected: '의견수렴',
  overall_evaluation: '전반적 평가',
  next_plan: '다음 계획',
  tool_used: '사용 도구',
  delivered: '제공 여부',
  non_delivery_reason: '미제공 사유',
};

/** 대화가 끝나면 워커가 채우는 칸(finish_journal_generation) — 'AI 초안' 표시는 이 칸들에만 붙인다. */
export const AI_DRAFT_FIELDS = ['activity_content', 'participant_response', 'opinion_collected', 'guardian_text'] as const;

/** `09:00:00` → `09:00`. 없으면 만들지 않고 `—`. */
export const hhmm = (t: string | null | undefined) => t?.slice(0, 5) ?? '—';

/** `7월 30일 프로그램 일지` — 값이 없으면 만들지 않는다. */
export function journalTitle(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '프로그램 일지';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 프로그램 일지`;
}

/** 목록 본문 — 생성 중·실패는 내용이 아직 없다는 사실을 그대로 말한다(없는 내용을 만들지 않는다). */
export function journalSummary(j: ProgramJournalRow): string {
  if (j.status === 'generating') return '대화 기록으로 일지 초안을 만들고 있어요.';
  if (j.status === 'failed') return j.last_error ?? '일지 초안을 만들지 못했어요. 다시 생성하거나 직접 입력해 주세요.';
  if (!j.delivered) return `미제공 · ${j.non_delivery_reason ? NON_DELIVERY_LABEL[j.non_delivery_reason] : '사유 없음'}`;
  return j.activity_content ?? (j.last_error ?? '아직 적은 내용이 없어요.');
}
