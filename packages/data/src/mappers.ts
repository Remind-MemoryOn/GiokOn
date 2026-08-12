// @giokon/data — DB row ↔ @giokon/core 도메인 타입 매퍼
//
// 데이터 레이어 훅은 DB row(snake_case)를 그대로 반환한다. 화면(apps/web 등)이
// 도메인 타입(camelCase)을 원할 때 이 매퍼로 변환한다(T2.4 연결 시 사용).
//
// 주의: ElderProfile.appearance / avatarColor는 v2 클라이언트 표현이라 DB에
// 저장하지 않는다 → appearance는 기본값, avatarColor는 id 시드로 파생한다.

import {
  DEFAULT_APPEARANCE,
  pickAvatarColor,
  type ChronicleEntry,
  type ChronicleSource,
  type ConversationLog,
  type ConversationTurn,
  type ElderGender,
  type ElderProfile,
  type Guardian,
  type Session,
  type Speaker,
} from '@giokon/core'
import type {
  ChronicleRow,
  ProfileRow,
  SessionLogRow,
  SessionRow,
  TablesInsert,
  TablesUpdate,
} from './database.types'

export function toElderProfile(row: ProfileRow): ElderProfile {
  const guardian: Guardian | undefined = row.guardian_name
    ? { name: row.guardian_name, relation: row.guardian_relation ?? '' }
    : undefined

  return {
    id: row.id,
    name: row.name,
    birthYear: row.birth_year,
    hometown: row.hometown ?? undefined,
    job: row.job ?? undefined,
    family: row.family ?? undefined,
    hobbies: row.hobbies ?? undefined,
    avatarColor: pickAvatarColor(row.id),
    photoPath: row.photo_path ?? undefined,
    gender: row.gender ?? undefined,
    guardian,
    appearance: DEFAULT_APPEARANCE,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toChronicleSource(source: ChronicleRow['source']): ChronicleSource {
  return source === 'ai' ? 'AI' : 'Caregiver'
}

export function toChronicleEntry(row: ChronicleRow): ChronicleEntry {
  return {
    id: row.id,
    elderId: row.profile_id,
    topic: row.topic,
    content: row.content,
    keywords: row.keywords ?? [],
    source: toChronicleSource(row.source),
    recordedAt: row.recorded_at,
    updatedAt: row.updated_at,
  }
}

function toSpeaker(role: SessionLogRow['role']): Speaker {
  return role === 'ai' ? 'AI' : 'Elderly'
}

export function toConversationTurn(row: SessionLogRow): ConversationTurn {
  return {
    id: row.id,
    speaker: toSpeaker(row.role),
    text: row.content,
    timestamp: row.spoken_at,
    topic: row.topic ?? undefined,
  }
}

/**
 * DB 세션 메타 → 도메인 Session(세션 목록 카드용).
 * v1 스키마는 title/therapyType/note를 별도 컬럼으로 두지 않으므로(프로토타입 도메인
 * ↔ v1 스키마 불일치) 표시값을 파생한다: title←현재 주제, therapyType←회상 고정,
 * durationMinutes←duration_seconds/60.
 */
export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.current_topic ?? '회상 대화',
    therapyType: 'reminiscence',
    durationMinutes:
      row.duration_seconds != null ? Math.max(0, Math.round(row.duration_seconds / 60)) : 0,
    elderId: row.profile_id,
    createdAt: row.started_at,
    updatedAt: row.updated_at,
  }
}

/** DB 세션 메타 + 전문(session_logs)을 도메인 ConversationLog로 합친다. */
export function toConversationLog(session: SessionRow, logs: SessionLogRow[]): ConversationLog {
  return {
    id: session.id,
    sessionId: session.id,
    elderId: session.profile_id,
    therapyType: 'reminiscence', // v1은 회상 대화만
    turns: logs.map(toConversationTurn),
    status: session.status,
    startedAt: session.started_at,
    endedAt: session.ended_at ?? undefined,
    chronicleEntriesAdded: [],
  }
}

// ── 도메인/폼 입력 → DB 쓰기 페이로드 ────────────────────────────────────

/** 어르신 등록/수정 입력(꾸미기 필드 제외 — v1 스키마에 없음). */
export interface ElderWriteInput {
  name: string
  birthYear: number
  hometown?: string
  job?: string
  family?: string
  hobbies?: string
  /** Storage elder-photos 내 경로(업로드 후 반환값). 미변경 시 undefined. */
  photoPath?: string
  /** 성별(선택). 미입력이면 저장하지 않는다. */
  gender?: ElderGender
  guardian?: Guardian
}

export function toProfileInsert(input: ElderWriteInput, userId: string): TablesInsert<'profiles'> {
  return {
    user_id: userId,
    name: input.name,
    birth_year: input.birthYear,
    hometown: input.hometown ?? null,
    job: input.job ?? null,
    family: input.family ?? null,
    hobbies: input.hobbies ?? null,
    photo_path: input.photoPath ?? null,
    gender: input.gender ?? null,
    guardian_name: input.guardian?.name ?? null,
    guardian_relation: input.guardian?.relation ?? null,
  }
}

/**
 * 어르신 수정 페이로드. `photoPath` 가 undefined 면 **사진 필드를 건드리지 않는다**
 * (기존 사진 유지). 사진을 지우려면 명시적으로 null 을 넣도록 호출부에서 처리한다.
 */
export function toProfileUpdate(input: ElderWriteInput): TablesUpdate<'profiles'> {
  const patch: TablesUpdate<'profiles'> = {
    name: input.name,
    birth_year: input.birthYear,
    hometown: input.hometown ?? null,
    job: input.job ?? null,
    family: input.family ?? null,
    hobbies: input.hobbies ?? null,
    gender: input.gender ?? null,
    guardian_name: input.guardian?.name ?? null,
    guardian_relation: input.guardian?.relation ?? null,
  }
  if (input.photoPath !== undefined) patch.photo_path = input.photoPath
  return patch
}

/** 연대기 항목 입력. */
export interface ChronicleWriteInput {
  elderId: string
  topic: string
  content: string
  keywords: string[]
  source: ChronicleSource
}

function fromChronicleSource(source: ChronicleSource): ChronicleRow['source'] {
  return source === 'AI' ? 'ai' : 'caregiver'
}

export function toChronicleInsert(
  input: ChronicleWriteInput,
  userId: string,
): TablesInsert<'chronicle_entries'> {
  return {
    user_id: userId,
    profile_id: input.elderId,
    topic: input.topic,
    content: input.content,
    keywords: input.keywords,
    source: fromChronicleSource(input.source),
  }
}

export function toChronicleUpdate(
  input: Omit<ChronicleWriteInput, 'elderId'>,
): TablesUpdate<'chronicle_entries'> {
  return {
    topic: input.topic,
    content: input.content,
    keywords: input.keywords,
    source: fromChronicleSource(input.source),
  }
}
