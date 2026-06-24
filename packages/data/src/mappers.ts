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
  type ElderProfile,
  type Guardian,
  type Speaker,
} from '@giokon/core'
import type { ChronicleRow, ProfileRow, SessionLogRow, SessionRow } from './database.types'

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
    keywords: row.keywords,
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
