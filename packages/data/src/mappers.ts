// @giokon/data — DB row ↔ @giokon/core 도메인 타입 매퍼
//
// 데이터 레이어 훅은 DB row(snake_case)를 그대로 반환한다. 화면(apps/web 등)이
// 도메인 타입(camelCase)을 원할 때 이 매퍼로 변환한다(T2.4 연결 시 사용).
//
// 주의: ElderProfile.appearance / avatarColor는 v2 클라이언트 표현이라 DB에
// 저장하지 않는다 → appearance는 기본값, avatarColor는 id 시드로 파생한다.

import {
  DEFAULT_APPEARANCE,
  birthYearFromDate,
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
    birthDate: row.birth_date ?? undefined,
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
    originalText: row.original_content ?? undefined,
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

/** session_logs 행을 만들 때 필요한 소유자 식별자. */
export interface SessionLogOwner {
  sessionId: string
  profileId: string
  userId: string
}

/**
 * 대화 턴 → `session_logs` insert 행.
 *
 * - `turn_index` 는 **1-기반**(DB check `turn_index >= 1`).
 * - `original_content` 는 요양보호사가 STT 결과를 고친 경우에만 남기고, DB 제약상
 *   어르신 턴에만 허용된다(`session_logs_correction_role_check`).
 * - `switch_topic` 은 **직전 턴과 주제가 달라졌는지** — AI 가 화제를 옮긴 지점이다.
 * - `audio_url`·`audio_expires_at`·`duration_ms` 는 녹음 저장·발화 길이 측정을 아직
 *   구현하지 않아 비운다(없는 값을 만들지 않는다).
 */
export function toSessionLogInsert(
  turns: ConversationTurn[],
  index: number,
  owner: SessionLogOwner,
): TablesInsert<'session_logs'> {
  const turn = turns[index]
  const prevTopic = turns[index - 1]?.topic ?? null
  return {
    session_id: owner.sessionId,
    profile_id: owner.profileId,
    user_id: owner.userId,
    turn_index: index + 1,
    role: turn.speaker === 'AI' ? 'ai' : 'user',
    content: turn.text,
    original_content: turn.speaker === 'AI' ? null : (turn.originalText ?? null),
    topic: turn.topic ?? null,
    switch_topic: turn.topic != null && turn.topic !== prevTopic,
    spoken_at: turn.timestamp,
  }
}

// ── 도메인/폼 입력 → DB 쓰기 페이로드 ────────────────────────────────────

/** 어르신 등록/수정 입력(꾸미기 필드 제외 — v1 스키마에 없음). */
export interface ElderWriteInput {
  name: string
  /** 출생연도. `birthDate` 를 주면 그 연도와 같아야 한다(DB 제약). */
  birthYear: number
  /** 생년월일 `YYYY-MM-DD`. 월·일을 모르면 생략 → DB 에 null 로 저장한다. */
  birthDate?: string
  hometown?: string
  job?: string
  family?: string
  hobbies?: string
  /** Storage elder-photos 내 경로(업로드 후 반환값). 미변경 시 undefined. */
  photoPath?: string
  /**
   * 성별. **앱 폼에만 있는 필드**라 부분 갱신 규약을 따른다:
   * `undefined` = 건드리지 않음(웹에서 수정해도 앱이 넣은 값이 유지된다),
   * `null` = 지움.
   */
  gender?: ElderGender | null
  /**
   * 보호자. **웹 폼에만 있는 필드**라 성별과 같은 규약을 따른다:
   * `undefined` = 건드리지 않음(앱에서 수정해도 웹이 넣은 값이 유지된다), `null` = 지움.
   */
  guardian?: Guardian | null
}

/**
 * 저장할 출생연도 — 생년월일이 있으면 **거기서 파생**한다.
 * DB 가 두 컬럼의 연도 일치를 강제하므로(profiles_birth_date_year_check) 여기서 맞춘다.
 */
function birthYearOf(input: ElderWriteInput): number {
  if (input.birthDate) {
    const y = birthYearFromDate(input.birthDate)
    if (!Number.isNaN(y)) return y
  }
  return input.birthYear
}

export function toProfileInsert(input: ElderWriteInput, userId: string): TablesInsert<'profiles'> {
  return {
    user_id: userId,
    name: input.name,
    birth_year: birthYearOf(input),
    birth_date: input.birthDate ?? null,
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
 * 어르신 수정 페이로드.
 *
 * ⚠️ **부분 갱신 필드**(`photoPath`·`gender`·`guardian`)는 `undefined` 면 그 컬럼을
 * 아예 건드리지 않는다. 앱 폼(성별 O·보호자 X)과 웹 폼(성별 X·보호자 O)이 서로 다른
 * 필드를 가지므로, 전부 덮어쓰면 **다른 화면에서 입력한 값이 지워진다**
 * (웹에서 연대기 수정 → 앱이 넣은 성별 소실 / 앱에서 수정 → 웹이 넣은 보호자 소실).
 * 지우려면 호출부가 명시적으로 `null` 을 넘긴다.
 */
export function toProfileUpdate(input: ElderWriteInput): TablesUpdate<'profiles'> {
  const patch: TablesUpdate<'profiles'> = {
    name: input.name,
    birth_year: birthYearOf(input),
    birth_date: input.birthDate ?? null,
    hometown: input.hometown ?? null,
    job: input.job ?? null,
    family: input.family ?? null,
    hobbies: input.hobbies ?? null,
  }
  if (input.photoPath !== undefined) patch.photo_path = input.photoPath
  if (input.gender !== undefined) patch.gender = input.gender
  if (input.guardian !== undefined) {
    patch.guardian_name = input.guardian?.name ?? null
    patch.guardian_relation = input.guardian?.relation ?? null
  }
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
