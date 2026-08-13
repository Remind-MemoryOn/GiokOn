// 앱 데이터 쓰기 어댑터 — 어르신 등록/수정·연대기·동의를 라이브 DB 또는 목업에 쓴다.
//
// 읽기(reads.ts)와 대칭: Supabase 설정 시 @giokon/data 뮤테이션 훅 + mappers로 DB에
// 쓰고(RLS·기관 인가), 미설정 시 기존 목업 스토어 액션을 호출한다(시연 보존).
// 반환 타입은 목업 액션과 동일한 코어 도메인 타입 → 화면 변경 최소.
//
// 목업 액션은 동기, 라이브 뮤테이션은 비동기라 어댑터는 async 함수를 반환한다 —
// 화면 핸들러는 await 하고 실패를 안내한다.

import { useCallback } from 'react';
import {
  useCreateChronicle,
  useCreateProfile,
  useDeleteChronicle as useDeleteChronicleData,
  useRecordConsent,
  useUpdateChronicle,
  useUpdateProfile,
  toChronicleEntry,
  toChronicleInsert,
  toChronicleUpdate,
  toElderProfile,
  toProfileInsert,
  toProfileUpdate,
  type ChronicleWriteInput,
  type ConsentInsert,
  type ElderWriteInput,
} from '@giokon/data';
import {
  CONSENT_VERSION,
  type ChronicleEntry,
  type ChronicleSource,
  type ConsentType,
  type ElderProfile,
} from '@giokon/core';
import { isSupabaseConfigured as CFG } from '../lib/supabase';
import { useApp } from '../store/appStore';
import { useAuth } from '../auth/AuthProvider';

export type ElderUpsertInput = ElderWriteInput & { id?: string };
export type ChronicleUpsertInput = Omit<ChronicleWriteInput, 'source'> & {
  source?: ChronicleSource;
  id?: string;
};

/** 어르신 등록/수정. id 있으면 수정, 없으면 신규(연대기 소유=현재 요양보호사). */
export function useUpsertElder(): (input: ElderUpsertInput) => Promise<ElderProfile> {
  const { user } = useAuth();
  const mockUpsert = useApp((s) => s.upsertElder);
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();

  return useCallback(
    async (input: ElderUpsertInput): Promise<ElderProfile> => {
      if (!CFG) return mockUpsert(input);
      if (!user) throw new Error('로그인이 필요합니다.');
      if (input.id) {
        const row = await updateProfile.mutateAsync({ id: input.id, patch: toProfileUpdate(input) });
        return toElderProfile(row);
      }
      const row = await createProfile.mutateAsync(toProfileInsert(input, user.id));
      return toElderProfile(row);
    },
    [mockUpsert, createProfile, updateProfile, user],
  );
}

/** 연대기 항목 등록/수정(기본 출처=요양보호사). */
export function useUpsertChronicle(): (input: ChronicleUpsertInput) => Promise<ChronicleEntry> {
  const { user } = useAuth();
  const mockUpsert = useApp((s) => s.upsertChronicle);
  const createChronicle = useCreateChronicle();
  const updateChronicle = useUpdateChronicle();

  return useCallback(
    async (input: ChronicleUpsertInput): Promise<ChronicleEntry> => {
      if (!CFG) return mockUpsert(input);
      if (!user) throw new Error('로그인이 필요합니다.');
      const full: ChronicleWriteInput = {
        elderId: input.elderId,
        topic: input.topic,
        content: input.content,
        keywords: input.keywords,
        source: input.source ?? 'Caregiver',
      };
      if (input.id) {
        const row = await updateChronicle.mutateAsync({ id: input.id, patch: toChronicleUpdate(full) });
        return toChronicleEntry(row);
      }
      const row = await createChronicle.mutateAsync(toChronicleInsert(full, user.id));
      return toChronicleEntry(row);
    },
    [mockUpsert, createChronicle, updateChronicle, user],
  );
}

/** 연대기 항목 삭제(주요 기억 목록의 X). */
export function useDeleteChronicle(): (input: { id: string; elderId: string }) => Promise<void> {
  const mockDelete = useApp((s) => s.deleteChronicle);
  const deleteChronicle = useDeleteChronicleData();

  return useCallback(
    async ({ id, elderId }: { id: string; elderId: string }): Promise<void> => {
      if (!CFG) {
        mockDelete(id);
        return;
      }
      await deleteChronicle.mutateAsync({ id, profileId: elderId });
    },
    [mockDelete, deleteChronicle],
  );
}

/** 어르신 동의 부여(필수 동의 일괄). 라이브에서는 타입별 1건씩 기록한다. */
export function useGrantConsents(): (elderId: string, types: ConsentType[]) => Promise<void> {
  const { user } = useAuth();
  const mockGrant = useApp((s) => s.grantElderConsents);
  const recordConsent = useRecordConsent();

  return useCallback(
    async (elderId: string, types: ConsentType[]): Promise<void> => {
      if (!CFG) {
        mockGrant(elderId, types);
        return;
      }
      if (!user) throw new Error('로그인이 필요합니다.');
      for (const t of types) {
        // 어르신 세션 게이팅 동의는 모두 DB consent_type 열거에 속한다(필수 4종).
        await recordConsent.mutateAsync({
          profile_id: elderId,
          user_id: user.id,
          consent_type: t as ConsentInsert['consent_type'],
          granted: true,
          version: CONSENT_VERSION,
        });
      }
    },
    [mockGrant, recordConsent, user],
  );
}
