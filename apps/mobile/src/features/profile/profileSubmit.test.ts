import { describe, expect, it, vi } from 'vitest';
import { KEY_MEMORY_TOPIC, type ChronicleEntry } from '@giokon/core';
import { applyChronicleSync, elderFieldsFromForm, planChronicleSync } from './profileSubmit';

const entry = (id: string, content: string): ChronicleEntry => ({
  id, elderId: 'e1', topic: `topic-${id}`, content, keywords: [`kw-${id}`],
  source: 'Caregiver', recordedAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
});

describe('elderFieldsFromForm', () => {
  it('trims text, derives birth year, and empties blank optional fields', () => {
    expect(elderFieldsFromForm({
      name: '  김순자 ', birthDate: '1941-03-02', gender: 'female',
      hometown: ' 부산 ', family: '   ', job: '', hobbies: ' 노래 ',
    })).toEqual({
      name: '김순자', birthDate: '1941-03-02', birthYear: 1941, gender: 'female',
      hometown: '부산', family: undefined, job: undefined, hobbies: '노래',
    });
  });
});

describe('planChronicleSync', () => {
  it('deletes removed entries first, then follows the list order', () => {
    const existing = [entry('a', '고향 이야기'), entry('b', '첫 직장'), entry('c', '결혼'), entry('d', '손주')];
    const ops = planChronicleSync(existing, [
      { key: 'new-1', text: '  새 기억 ' },   // create (trimmed)
      { key: 'b', text: '첫 직장 — 방직공장' }, // update
      { key: 'c', text: '   ' },             // emptied → delete
      { key: 'd', text: ' 손주 ' },           // unchanged after trim → nothing
      { key: 'new-2', text: '' },            // empty new → nothing
    ]);
    expect(ops).toEqual([
      { kind: 'delete', id: 'a' },
      { kind: 'create', content: '새 기억' },
      { kind: 'update', entry: existing[1], content: '첫 직장 — 방직공장' },
      { kind: 'delete', id: 'c' },
    ]);
  });

  it('with no existing entries only creates non-empty memories (registration)', () => {
    expect(planChronicleSync([], [{ key: 'n1', text: ' 하나 ' }, { key: 'n2', text: ' ' }, { key: 'n3', text: '셋' }]))
      .toEqual([{ kind: 'create', content: '하나' }, { kind: 'create', content: '셋' }]);
  });
});

describe('applyChronicleSync', () => {
  it('writes each op in order with the same payloads as before', async () => {
    const calls: unknown[] = [];
    const write = {
      upsert: vi.fn(async (input: unknown) => { calls.push(['upsert', input]); }),
      remove: vi.fn(async (input: unknown) => { calls.push(['remove', input]); }),
    };
    const b = entry('b', 'old');
    await applyChronicleSync('e1', [
      { kind: 'delete', id: 'a' },
      { kind: 'update', entry: b, content: 'new' },
      { kind: 'create', content: '새 기억' },
    ], write);
    expect(calls).toEqual([
      ['remove', { id: 'a', elderId: 'e1' }],
      ['upsert', { id: 'b', elderId: 'e1', topic: 'topic-b', content: 'new', keywords: ['kw-b'] }],
      ['upsert', { elderId: 'e1', topic: KEY_MEMORY_TOPIC, content: '새 기억', keywords: [] }],
    ]);
  });

  it('stops at the first failure', async () => {
    const write = { upsert: vi.fn(async () => { throw new Error('boom'); }), remove: vi.fn(async () => {}) };
    await expect(applyChronicleSync('e1', [
      { kind: 'create', content: 'x' }, { kind: 'delete', id: 'a' },
    ], write)).rejects.toThrow('boom');
    expect(write.remove).not.toHaveBeenCalled();
  });
});
