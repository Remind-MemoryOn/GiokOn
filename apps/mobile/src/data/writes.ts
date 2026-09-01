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
  getGiokonClient,
  useCreateChronicle,
  useCreateProfile,
  useDeleteChronicle as useDeleteChronicleData,
  useDeleteProfile as useDeleteProfileData,
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
  type ConsentCapacity,
  type ConsentSubjectType,
  type ConsentType,
  type ElderProfile,
} from '@giokon/core';
import { isSupabaseConfigured as CFG } from '../lib/supabase';
import { useApp } from '../store/appStore';
import { useAuth } from '../auth/AuthProvider';

/**
 * 쓰기 전 신원 확인 — 로그인 + **기관 소속**까지 본다.
 *
 * 기관이 없는 계정(웹 온보딩 미완료)으로 어르신을 등록하면, org_id 스탬프 트리거가
 * 채울 값이 없어 `null value in column "org_id" violates not-null constraint` 라는
 * 날것의 DB 오류가 그대로 Alert 에 뜬다. 원인을 알 수 있는 문구로 먼저 막는다.
 * (앱에는 온보딩 화면이 없다 — 회원가입·기관 설정은 웹 담당.)
 */
function requireWriteIdentity(
  user: { id: string } | null,
  userRow: { org_id: string | null } | null,
): string {
  if (!user) throw new Error('로그인이 필요합니다.');
  if (!userRow) throw new Error('계정 정보를 불러오는 중이에요. 잠시 후 다시 시도해 주세요.');
  if (!userRow.org_id) {
    throw new Error('기관 정보가 없어요. 웹에서 회원가입(기관 설정)을 먼저 완료해 주세요.');
  }
  return user.id;
}

export type ElderUpsertInput = ElderWriteInput & { id?: string };
export type ChronicleUpsertInput = Omit<ChronicleWriteInput, 'source'> & {
  source?: ChronicleSource;
  id?: string;
};

/** 어르신 등록/수정. id 있으면 수정, 없으면 신규(연대기 소유=현재 요양보호사). */
export function useUpsertElder(): (input: ElderUpsertInput) => Promise<ElderProfile> {
  const { user, userRow } = useAuth();
  const mockUpsert = useApp((s) => s.upsertElder);
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();

  return useCallback(
    async (input: ElderUpsertInput): Promise<ElderProfile> => {
      // 목업 도메인 타입은 "지움"을 null 로 표현하지 않는다(undefined 만) → 정규화.
      if (!CFG)
        return mockUpsert({
          ...input,
          gender: input.gender ?? undefined,
          guardian: input.guardian ?? undefined,
          note: input.note ?? undefined,
        });
      const userId = requireWriteIdentity(user, userRow);
      if (input.id) {
        const row = await updateProfile.mutateAsync({ id: input.id, patch: toProfileUpdate(input) });
        return toElderProfile(row);
      }
      const row = await createProfile.mutateAsync(toProfileInsert(input, userId));
      return toElderProfile(row);
    },
    [mockUpsert, createProfile, updateProfile, user, userRow],
  );
}

/** 연대기 항목 등록/수정(기본 출처=요양보호사). */
export function useUpsertChronicle(): (input: ChronicleUpsertInput) => Promise<ChronicleEntry> {
  const { user, userRow } = useAuth();
  const mockUpsert = useApp((s) => s.upsertChronicle);
  const createChronicle = useCreateChronicle();
  const updateChronicle = useUpdateChronicle();

  return useCallback(
    async (input: ChronicleUpsertInput): Promise<ChronicleEntry> => {
      if (!CFG) return mockUpsert(input);
      const userId = requireWriteIdentity(user, userRow);
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
      const row = await createChronicle.mutateAsync(toChronicleInsert(full, userId));
      return toChronicleEntry(row);
    },
    [mockUpsert, createChronicle, updateChronicle, user, userRow],
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

/**
 * 어르신 삭제(설정 → 담당 어르신 관리).
 *
 * 라이브에서는 `useDeleteProfile` 이 **Storage 사진을 먼저 파기하고** 행을 지운다
 * (행을 먼저 지우면 Storage 정책이 기관을 확인할 수 없어 파일이 남는다). 나머지
 * 연대기·세션·대화·분석·동의·안전 이벤트는 DB 의 FK cascade 로 함께 사라진다.
 * 목업 모드도 같은 결과가 되도록 스토어에서 딸린 기록을 함께 비운다.
 */
export function useDeleteElder(): (id: string) => Promise<void> {
  const mockDelete = useApp((s) => s.deleteElder);
  const deleteProfile = useDeleteProfileData();

  return useCallback(
    async (id: string): Promise<void> => {
      if (!CFG) {
        mockDelete(id);
        return;
      }
      await deleteProfile.mutateAsync(id);
    },
    [mockDelete, deleteProfile],
  );
}

/**
 * 어르신 동의 부여(필수 동의 일괄). 라이브에서는 타입별 1건씩 기록한다.
 *
 * 이미 유효한 동의는 다시 넣지 않는다 — 동의 화면을 두 번 통과하면 같은 동의가
 * 여러 줄 쌓여, 나중에 "언제 받은 동의인지" 를 가리기 어려워진다(감사 지적).
 * 철회된 동의(revoked_at)는 유효하지 않으므로 다시 받는 것이 맞다.
 */
/** 동의 기록에 함께 남길 주체 정보(대리동의 확인용). */
export interface ConsentSubjectDetail {
  subjectType: ConsentSubjectType;
  capacity: ConsentCapacity;
  /** 본인 동의면 null. DB 제약상 본인이 아니면 반드시 있어야 한다. */
  guardianName: string | null;
  guardianRelation: string | null;
  /** 보호자(성년후견 미개시) 동의의 법적 한계 고지 근거. */
  basis: string | null;
}

export function useGrantConsents(): (
  elderId: string,
  types: ConsentType[],
  detail: ConsentSubjectDetail,
) => Promise<void> {
  const { user, userRow } = useAuth();
  const mockGrant = useApp((s) => s.grantElderConsents);
  const recordConsent = useRecordConsent();

  return useCallback(
    async (elderId: string, types: ConsentType[], detail: ConsentSubjectDetail): Promise<void> => {
      if (!CFG) {
        mockGrant(elderId, types);
        return;
      }
      const userId = requireWriteIdentity(user, userRow);

      const { data: existing, error } = await getGiokonClient()
        .from('consents')
        .select('consent_type, granted, revoked_at, version')
        .eq('profile_id', elderId);
      if (error) throw new Error(error.message);
      const active = new Set(
        (existing ?? [])
          .filter((c) => c.granted && !c.revoked_at && c.version === CONSENT_VERSION)
          .map((c) => c.consent_type),
      );

      for (const t of types) {
        if (active.has(t)) continue;
        // 어르신 세션 게이팅 동의는 모두 DB consent_type 열거에 속한다(필수 4종).
        await recordConsent.mutateAsync({
          profile_id: elderId,
          user_id: userId,
          consent_type: t as ConsentInsert['consent_type'],
          granted: true,
          version: CONSENT_VERSION,
          // 대리동의 확인 — 예전에는 이 넷이 항상 DB 기본값(self/unknown/null)으로
          // 굳어 "누가 동의했는지"가 기록에 남지 않았다(감사 지적).
          subject_type: detail.subjectType,
          capacity: detail.capacity,
          guardian_name: detail.guardianName,
          guardian_relation: detail.guardianRelation,
          basis: detail.basis,
        });
      }
    },
    [mockGrant, recordConsent, user, userRow],
  );
}
