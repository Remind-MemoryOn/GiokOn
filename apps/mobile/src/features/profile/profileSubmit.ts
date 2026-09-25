// 어르신 프로필 폼 제출 → 저장 입력 변환. 등록(register)·연대기 수정(chronicle/[id])이 공유한다.
import { KEY_MEMORY_TOPIC, birthYearFromDate, type ChronicleEntry } from '@giokon/core';
import type { ProfileValues } from '../../components/ProfileForm';
import type { MemoryItem } from '../../components/form';
import type { ChronicleUpsertInput } from '../../data/writes';

/** 폼 값 → 어르신 저장 필드. 선택 칸은 공백만 있으면 비운다(undefined). */
export function elderFieldsFromForm(v: ProfileValues) {
  return {
    name: v.name.trim(),
    birthDate: v.birthDate,
    birthYear: birthYearFromDate(v.birthDate),
    gender: v.gender,
    hometown: v.hometown.trim() || undefined,
    family: v.family.trim() || undefined,
    job: v.job.trim() || undefined,
    hobbies: v.hobbies.trim() || undefined,
  };
}

export type ChronicleOp =
  | { kind: 'delete'; id: string }
  | { kind: 'update'; entry: ChronicleEntry; content: string }
  | { kind: 'create'; content: string };

/**
 * 주요 기억 = 연대기 항목. 목록에서 사라진 항목은 삭제, 내용이 바뀐 항목은 수정,
 * 비운 항목은 삭제, 새 항목(new-*)은 추가한다. 순서: 사라진 항목 삭제 → 목록 순서대로.
 */
export function planChronicleSync(
  existing: readonly ChronicleEntry[],
  memories: readonly MemoryItem[],
): ChronicleOp[] {
  const ops: ChronicleOp[] = [];
  const keptIds = new Set(memories.map((m) => m.key));
  for (const c of existing) {
    if (!keptIds.has(c.id)) ops.push({ kind: 'delete', id: c.id });
  }
  for (const m of memories) {
    const content = m.text.trim();
    const entry = existing.find((c) => c.id === m.key);
    if (entry) {
      if (content && content !== entry.content) ops.push({ kind: 'update', entry, content });
      else if (!content) ops.push({ kind: 'delete', id: entry.id });
    } else if (content) {
      ops.push({ kind: 'create', content });
    }
  }
  return ops;
}

/** 계획한 연대기 변경을 순서대로 하나씩 반영한다. 하나라도 실패하면 거기서 멈춘다(throw). */
export async function applyChronicleSync(
  elderId: string,
  ops: readonly ChronicleOp[],
  write: {
    upsert: (input: ChronicleUpsertInput) => Promise<unknown>;
    remove: (input: { id: string; elderId: string }) => Promise<void>;
  },
): Promise<void> {
  for (const op of ops) {
    if (op.kind === 'delete') {
      await write.remove({ id: op.id, elderId });
    } else if (op.kind === 'update') {
      const { entry, content } = op;
      await write.upsert({ id: entry.id, elderId, topic: entry.topic, content, keywords: entry.keywords });
    } else {
      await write.upsert({ elderId, topic: KEY_MEMORY_TOPIC, content: op.content, keywords: [] });
    }
  }
}
