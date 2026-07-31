import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, pickAvatarColor } from '@giokon/core'
import {
  toChronicleEntry,
  toConversationLog,
  toConversationTurn,
  toElderProfile,
  toSession,
} from './mappers'
import { queryKeys } from './query'
import type { ChronicleRow, ProfileRow, SessionLogRow, SessionRow } from './database.types'

const profileRow: ProfileRow = {
  id: 'p1',
  user_id: 'u1',
  org_id: 'o1',
  name: '이순자',
  birth_year: 1945,
  hometown: '전북 전주',
  job: '식당 운영, 30년',
  family: '딸 둘, 사위 둘',
  memories: ['남편과 처음 만난 장터'],
  hobbies: '텃밭 가꾸기',
  guardian_name: '박민준',
  guardian_relation: '아들',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}

describe('toElderProfile', () => {
  it('snake_case DB row를 camelCase 도메인 타입으로 변환한다', () => {
    const elder = toElderProfile(profileRow)
    expect(elder).toMatchObject({
      id: 'p1',
      name: '이순자',
      birthYear: 1945,
      hometown: '전북 전주',
      job: '식당 운영, 30년',
      family: '딸 둘, 사위 둘',
      hobbies: '텃밭 가꾸기',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    })
  })

  it('guardian_name이 있으면 guardian 객체를 구성한다', () => {
    const elder = toElderProfile(profileRow)
    expect(elder.guardian).toEqual({ name: '박민준', relation: '아들' })
  })

  it('guardian_name이 없으면 guardian은 undefined', () => {
    const elder = toElderProfile({ ...profileRow, guardian_name: null, guardian_relation: null })
    expect(elder.guardian).toBeUndefined()
  })

  it('null 선택 필드는 undefined로 매핑한다', () => {
    const elder = toElderProfile({
      ...profileRow,
      hometown: null,
      job: null,
      family: null,
      hobbies: null,
    })
    expect(elder.hometown).toBeUndefined()
    expect(elder.job).toBeUndefined()
    expect(elder.family).toBeUndefined()
    expect(elder.hobbies).toBeUndefined()
  })

  it('avatarColor는 id 시드 기반 결정적 값, appearance는 기본값(v2 미저장)', () => {
    const elder = toElderProfile(profileRow)
    expect(elder.avatarColor).toBe(pickAvatarColor('p1'))
    expect(elder.appearance).toEqual(DEFAULT_APPEARANCE)
  })
})

describe('toChronicleEntry', () => {
  const base: ChronicleRow = {
    id: 'c1',
    profile_id: 'p1',
    user_id: 'u1',
    org_id: 'o1',
    topic: '직업',
    content: '전주에서 식당을 했다',
    keywords: ['전주', '식당'],
    source: 'caregiver',
    recorded_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
  }

  it('profile_id를 elderId로, source를 도메인 표기로 매핑한다', () => {
    expect(toChronicleEntry(base)).toMatchObject({
      id: 'c1',
      elderId: 'p1',
      topic: '직업',
      content: '전주에서 식당을 했다',
      keywords: ['전주', '식당'],
      source: 'Caregiver',
      recordedAt: '2026-01-03T00:00:00Z',
    })
  })

  it("source 'ai'는 'AI'로 매핑한다", () => {
    expect(toChronicleEntry({ ...base, source: 'ai' }).source).toBe('AI')
  })
})

describe('toConversationTurn', () => {
  const aiLog: SessionLogRow = {
    id: 'l1',
    session_id: 's1',
    profile_id: 'p1',
    user_id: 'u1',
    org_id: 'o1',
    turn_index: 1,
    role: 'ai',
    content: '고향이 어디세요?',
    original_content: null,
    topic: '고향',
    switch_topic: false,
    audio_url: 'https://x/a.mp3',
    audio_expires_at: null,
    duration_ms: null,
    spoken_at: '2026-01-04T00:00:00Z',
    created_at: '2026-01-04T00:00:00Z',
    updated_at: '2026-01-04T00:00:00Z',
  }

  it("role 'ai'는 speaker 'AI', spoken_at은 timestamp로 매핑한다", () => {
    expect(toConversationTurn(aiLog)).toMatchObject({
      id: 'l1',
      speaker: 'AI',
      text: '고향이 어디세요?',
      timestamp: '2026-01-04T00:00:00Z',
      topic: '고향',
    })
  })

  it("role 'user'는 speaker 'Elderly', topic null은 undefined", () => {
    const turn = toConversationTurn({ ...aiLog, role: 'user', topic: null })
    expect(turn.speaker).toBe('Elderly')
    expect(turn.topic).toBeUndefined()
  })
})

describe('toConversationLog', () => {
  const session: SessionRow = {
    id: 's1',
    profile_id: 'p1',
    user_id: 'u1',
    org_id: 'o1',
    status: 'ended',
    turn_count: 2,
    duration_seconds: 120,
    current_topic: null,
    started_at: '2026-01-04T00:00:00Z',
    ended_at: '2026-01-04T00:10:00Z',
    updated_at: '2026-01-04T00:10:00Z',
  }
  const logs: SessionLogRow[] = [
    {
      id: 'l1', session_id: 's1', profile_id: 'p1', user_id: 'u1', org_id: 'o1', turn_index: 1,
      role: 'ai', content: '안녕하세요', original_content: null, topic: '인사',
      switch_topic: null, audio_url: null, audio_expires_at: null, duration_ms: null,
      spoken_at: '2026-01-04T00:00:01Z', created_at: '2026-01-04T00:00:01Z', updated_at: '2026-01-04T00:00:01Z',
    },
    {
      id: 'l2', session_id: 's1', profile_id: 'p1', user_id: 'u1', org_id: 'o1', turn_index: 2,
      role: 'user', content: '네 안녕하세요', original_content: null, topic: null,
      switch_topic: null, audio_url: null, audio_expires_at: null, duration_ms: 1500,
      spoken_at: '2026-01-04T00:00:05Z', created_at: '2026-01-04T00:00:05Z', updated_at: '2026-01-04T00:00:05Z',
    },
  ]

  it('세션 + 로그를 ConversationLog로 합치고 turns를 매핑한다', () => {
    const conv = toConversationLog(session, logs)
    expect(conv).toMatchObject({
      id: 's1',
      sessionId: 's1',
      elderId: 'p1',
      therapyType: 'reminiscence',
      status: 'ended',
      startedAt: '2026-01-04T00:00:00Z',
      endedAt: '2026-01-04T00:10:00Z',
      chronicleEntriesAdded: [],
    })
    expect(conv.turns).toHaveLength(2)
    expect(conv.turns.map((t) => t.speaker)).toEqual(['AI', 'Elderly'])
  })

  it('ended_at이 null이면 endedAt은 undefined', () => {
    const conv = toConversationLog({ ...session, status: 'active', ended_at: null }, [])
    expect(conv.endedAt).toBeUndefined()
    expect(conv.status).toBe('active')
    expect(conv.turns).toEqual([])
  })
})

describe('toSession', () => {
  const row: SessionRow = {
    id: 's1',
    profile_id: 'p1',
    user_id: 'u1',
    org_id: 'o1',
    status: 'ended',
    turn_count: 4,
    duration_seconds: 150,
    current_topic: '고향',
    started_at: '2026-01-04T00:00:00Z',
    ended_at: '2026-01-04T00:10:00Z',
    updated_at: '2026-01-04T00:10:00Z',
  }

  it('세션 메타를 도메인 Session으로 매핑한다(title←현재 주제, 분←초/60)', () => {
    expect(toSession(row)).toEqual({
      id: 's1',
      title: '고향',
      therapyType: 'reminiscence',
      durationMinutes: 3,
      elderId: 'p1',
      createdAt: '2026-01-04T00:00:00Z',
      updatedAt: '2026-01-04T00:10:00Z',
    })
  })

  it('current_topic null은 기본 제목, duration_seconds null은 0분', () => {
    const s = toSession({ ...row, current_topic: null, duration_seconds: null })
    expect(s.title).toBe('회상 대화')
    expect(s.durationMinutes).toBe(0)
  })
})

describe('queryKeys', () => {
  it('엔티티별 캐시 키를 일관되게 생성한다', () => {
    expect(queryKeys.profiles).toEqual(['profiles'])
    expect(queryKeys.profile('p1')).toEqual(['profiles', 'p1'])
    expect(queryKeys.chronicles('p1')).toEqual(['chronicles', 'p1'])
    expect(queryKeys.sessions('p1')).toEqual(['sessions', 'p1'])
    expect(queryKeys.session('s1')).toEqual(['sessions', 'detail', 's1'])
    expect(queryKeys.sessionLogs('s1')).toEqual(['session_logs', 's1'])
  })
})
