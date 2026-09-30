// 위험 발화 기록 — 사건 id · 중복 없는 재시도 · 비어 있는 근거만 채우기(파일럿 T25.17).
//
// 중계는 감지 시점에 사건 id 를 만들고 그 id 로 safety_events 를 넣는다. 같은 id 로 다시 넣으면 중복 키 오류가 나는데,
// 그건 "이미 있다"는 뜻이다 — ① 앞선 시도가 DB 에 들어갔는데 응답만 유실됐거나 ② 앱이 같은 id 로 대체 기록(수준·분류만,
// 발췌 없음)을 먼저 넣은 경우다. 어느 쪽이든 새 행을 만들지 않고 **비어 있는 근거 칸(발췌·매칭 단어)만 한 번** 채운다
// (이미 채워져 있으면 조건에 걸리지 않아 0건 — 덮어쓰지 않는다. DB 가드 20260928020000 이 같은 규칙을 강제한다).
// ⚠️ 발췌 원문은 이 모듈의 인자로만 다닌다 — 로그·오류 메시지에 넣지 않는다.

export interface SafetyEventRow {
  id: string
  profile_id: string
  session_id: string
  user_id: string
  level: 'watch' | 'crisis'
  categories: string[]
  matched_terms: string[]
  excerpt: string
  caregiver_alert: string
}

type DbResult = PromiseLike<{ error: { code?: string } | null }>

export interface SafetyEventTable {
  insert(row: SafetyEventRow): DbResult
  /** 같은 id 행의 근거가 비어 있을 때만 채운다(조건부 UPDATE — 이미 있으면 0건, 오류 아님). */
  fillEmptyEvidence(id: string, excerpt: string, matchedTerms: string[]): DbResult
}

const UNIQUE_VIOLATION = '23505'

export async function storeSafetyEvent(table: SafetyEventTable, row: SafetyEventRow): Promise<void> {
  const inserted = await table.insert(row)
  if (!inserted.error) return
  if (inserted.error.code !== UNIQUE_VIOLATION) throw new Error('SAFETY_RECORD_FAILED')
  const filled = await table.fillEmptyEvidence(row.id, row.excerpt, row.matched_terms)
  if (filled.error) throw new Error('SAFETY_EVIDENCE_FILL_FAILED')
}

export interface SafetyRetryPolicy {
  /** 첫 시도 포함 최대 시도 수. */
  attempts: number
  /** 시도 사이 대기(ms) — 매번 두 배(2·4·8·16초). */
  baseDelayMs: number
}

/** 기본 정책 — 5회 · 대기 합 30초(+ 시도마다 DB 요청 상한 5초). 서버 재시작까지 견디는 보존은 범위 밖(결정 대기). */
export const SAFETY_RETRY: SafetyRetryPolicy = { attempts: 5, baseDelayMs: 2000 }

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** 성공하면 true, 한도를 다 쓰면 false. 던지지 않는다. */
export async function recordWithRetry(record: () => Promise<void>, policy: SafetyRetryPolicy = SAFETY_RETRY): Promise<boolean> {
  for (let attempt = 0; attempt < policy.attempts; attempt++) {
    try {
      await record()
      return true
    } catch {
      if (attempt < policy.attempts - 1) await sleep(policy.baseDelayMs * 2 ** attempt)
    }
  }
  return false
}
