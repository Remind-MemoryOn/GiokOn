import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, pickAvatarColor } from '@giokon/core'
import {
  toChronicleEntry,
  toConversationLog,
  toConversationTurn,
  toElderProfile,
  toProfileInsert,
  toProfileUpdate,
  toSession,
  toSessionLogInsert,
} from './mappers'
import { queryKeys } from './query'
import type { ConversationTurn } from '@giokon/core'
import type { ChronicleRow, ProfileRow, SessionLogRow, SessionRow } from './database.types'

const profileRow: ProfileRow = {
  id: 'p1',
  user_id: 'u1',
  org_id: 'o1',
  name: '이순자',
  birth_year: 1945,
  birth_date: '1945-03-12',
  hometown: '전북 전주',
  job: '식당 운영, 30년',
  family: '딸 둘, 사위 둘',
  hobbies: '텃밭 가꾸기',
  guardian_name: '박민준',
  guardian_relation: '아들',
  photo_path: null,
  gender: 'female',
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
      birthDate: '1945-03-12',
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

  it('photo_path 를 photoPath 로 매핑하고, null 이면 undefined', () => {
    expect(toElderProfile(profileRow).photoPath).toBeUndefined()
    expect(toElderProfile({ ...profileRow, photo_path: 'p1/abc.jpg' }).photoPath).toBe('p1/abc.jpg')
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

describe('toProfileInsert / toProfileUpdate — 생년월일', () => {
  const base = { name: '이순자', birthYear: 1945 }

  it('birthDate 를 주면 birth_year 를 거기서 파생한다(DB 연도 일치 제약)', () => {
    // 입력의 birthYear 가 어긋나 있어도 날짜가 이긴다.
    const ins = toProfileInsert({ ...base, birthYear: 1950, birthDate: '1945-03-12' }, 'u1')
    expect(ins.birth_date).toBe('1945-03-12')
    expect(ins.birth_year).toBe(1945)

    const upd = toProfileUpdate({ ...base, birthYear: 1950, birthDate: '1945-03-12' })
    expect(upd.birth_date).toBe('1945-03-12')
    expect(upd.birth_year).toBe(1945)
  })

  it('birthDate 가 없으면 birth_date 는 null(월·일 미상 — 임의값 금지)', () => {
    expect(toProfileInsert(base, 'u1').birth_date).toBeNull()
    expect(toProfileInsert(base, 'u1').birth_year).toBe(1945)
    expect(toProfileUpdate(base).birth_date).toBeNull()
  })
})

describe('toProfileInsert / toProfileUpdate — 사진 경로', () => {
  const base = { name: '이순자', birthYear: 1945 }

  it('insert: photoPath 없으면 null', () => {
    expect(toProfileInsert(base, 'u1').photo_path).toBeNull()
    expect(toProfileInsert({ ...base, photoPath: 'p1/a.jpg' }, 'u1').photo_path).toBe('p1/a.jpg')
  })

  it('update: photoPath 가 undefined 면 사진 필드를 건드리지 않는다(기존 사진 유지)', () => {
    expect('photo_path' in toProfileUpdate(base)).toBe(false)
  })

  it('update: photoPath 를 주면 갱신, null 이면 삭제', () => {
    expect(toProfileUpdate({ ...base, photoPath: 'p1/b.jpg' }).photo_path).toBe('p1/b.jpg')
    expect(toProfileUpdate({ ...base, photoPath: null as unknown as string }).photo_path).toBeNull()
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

describe('toProfileUpdate — 화면마다 다른 필드의 부분 갱신', () => {
  // 앱 폼에는 성별이 있고 보호자가 없다. 웹 폼은 그 반대다. 전부 덮어쓰면 상대 화면이
  // 입력한 값이 지워지므로(실제로 웹 수정 시 성별이 날아갔다) undefined = 미변경이다.
  const base = { name: '이순자', birthYear: 1945, birthDate: '1945-03-12' }

  it('gender/guardian 이 undefined 면 해당 컬럼을 아예 넣지 않는다', () => {
    const upd = toProfileUpdate(base)
    expect('gender' in upd).toBe(false)
    expect('guardian_name' in upd).toBe(false)
    expect('guardian_relation' in upd).toBe(false)
    expect('photo_path' in upd).toBe(false)
  })

  it('값을 주면 그대로, null 을 주면 지운다', () => {
    const set = toProfileUpdate({
      ...base,
      gender: 'female',
      guardian: { name: '박민준', relation: '아들' },
    })
    expect(set.gender).toBe('female')
    expect(set.guardian_name).toBe('박민준')
    expect(set.guardian_relation).toBe('아들')

    const cleared = toProfileUpdate({ ...base, gender: null, guardian: null })
    expect(cleared.gender).toBeNull()
    expect(cleared.guardian_name).toBeNull()
    expect(cleared.guardian_relation).toBeNull()
  })

  it('신규 등록(insert)은 부분 갱신이 아니라 없는 값을 null 로 채운다', () => {
    const ins = toProfileInsert(base, 'u1')
    expect(ins.gender).toBeNull()
    expect(ins.guardian_name).toBeNull()
  })
})

describe('toConversationTurn — STT 보정 원문', () => {
  const userLog: SessionLogRow = {
    id: 'l9',
    session_id: 's1',
    profile_id: 'p1',
    user_id: 'u1',
    org_id: 'o1',
    turn_index: 2,
    role: 'user',
    content: '아버지가 지어 주신 이름이에요',
    original_content: null,
    topic: '이름',
    switch_topic: false,
    audio_url: null,
    audio_expires_at: null,
    duration_ms: null,
    spoken_at: '2026-01-04T00:01:00Z',
    created_at: '2026-01-04T00:01:00Z',
    updated_at: '2026-01-04T00:01:00Z',
  }

  it('original_content 를 originalText 로 옮긴다(보정 근거 보존)', () => {
    const corrected = { ...userLog, original_content: '아버지가 지어준 이름이에요' }
    expect(toConversationTurn(corrected).originalText).toBe('아버지가 지어준 이름이에요')
  })

  it('보정하지 않은 턴은 undefined', () => {
    expect(toConversationTurn(userLog).originalText).toBeUndefined()
  })
})

describe('toSessionLogInsert — 진행 중 턴 기록', () => {
  const owner = { sessionId: 's1', profileId: 'p1', userId: 'u1' }
  const turns: ConversationTurn[] = [
    { id: 't1', speaker: 'AI', text: '고향이 어디세요?', timestamp: '2026-01-04T00:00:00Z', topic: '고향' },
    { id: 't2', speaker: 'Elderly', text: '전주요', timestamp: '2026-01-04T00:00:30Z', topic: '고향' },
    { id: 't3', speaker: 'AI', text: '가족은요?', timestamp: '2026-01-04T00:01:00Z', topic: '가족' },
    {
      id: 't4',
      speaker: 'Elderly',
      text: '딸이 둘이에요',
      timestamp: '2026-01-04T00:01:30Z',
      topic: '가족',
      originalText: '딸이 둘이여',
    },
  ]

  it('turn_index 는 1-기반이다(DB check turn_index >= 1)', () => {
    expect(toSessionLogInsert(turns, 0, owner).turn_index).toBe(1)
    expect(toSessionLogInsert(turns, 3, owner).turn_index).toBe(4)
  })

  it('주제가 바뀐 턴에만 switch_topic 이 true 다', () => {
    expect(toSessionLogInsert(turns, 0, owner).switch_topic).toBe(true) // 첫 주제
    expect(toSessionLogInsert(turns, 1, owner).switch_topic).toBe(false) // 같은 주제
    expect(toSessionLogInsert(turns, 2, owner).switch_topic).toBe(true) // 고향 → 가족
    expect(toSessionLogInsert(turns, 3, owner).switch_topic).toBe(false)
  })

  it('보정 원문은 어르신 턴에만 실린다(DB 제약)', () => {
    expect(toSessionLogInsert(turns, 3, owner).original_content).toBe('딸이 둘이여')
    expect(toSessionLogInsert(turns, 1, owner).original_content).toBeNull()
    // AI 턴은 originalText 가 있어도 null 로 보낸다.
    const aiWithOriginal = [{ ...turns[0], originalText: '엉뚱한 값' }]
    expect(toSessionLogInsert(aiWithOriginal, 0, owner).original_content).toBeNull()
  })

  it('녹음·발화 길이는 구현 전이라 값을 만들지 않는다', () => {
    const row = toSessionLogInsert(turns, 1, owner)
    expect(row.audio_url).toBeUndefined()
    expect(row.duration_ms).toBeUndefined()
  })
})
