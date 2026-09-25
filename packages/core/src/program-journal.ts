// 프로그램 일지 초안 매핑(파일럿 T20.4) — 대화 생성 결과(GeneratedSession) → 공단 서식 칸.
//
// 워커(C4 program-journal-draft)가 이 함수들로 `program_journals` 를 채운다. 원칙:
//   · **확정하지 않는다** — 결과는 언제나 확인 대기(pending_review) 초안이다(확정은 DB 가 사람만 허용한다).
//   · 없는 내용을 만들지 않는다 — 근거가 없는 칸은 null 로 두고, 종합평가·다음 계획은 사람이 쓴다.
//   · 진단·판정 표현이 걸린 칸은 **그 칸만 비운다**(전체 실패가 아니다) — 무엇을 비웠는지 돌려주어
//     확인 화면이 "이 칸은 직접 적어 주세요"라고 알릴 수 있게 한다.
// Edge Function 과 공유하므로 런타임·환경 import 가 없다.
import { DIAGNOSTIC_EXPRESSION, type GeneratedSession, type GroundedClaim } from './generated-session.ts'

/** 워커가 초안으로 채우는 공단 서식 칸(program_journals 컬럼 이름 그대로). */
export interface JournalDraftFields {
  activity_content: string | null
  participant_response: string | null
  opinion_collected: string | null
  /** 종합평가·다음 계획은 사람이 판단한다 — 초안에서는 비워 둔다. */
  overall_evaluation: null
  next_plan: null
  guardian_text: string | null
}

/** 칸 이름 → 한도(DB 제약과 같다). */
const LIMITS = {
  activity_content: 5000,
  participant_response: 2000,
  opinion_collected: 2000,
  guardian_text: 1000,
} as const
type ScreenedField = keyof typeof LIMITS

function joinClaims(claims: GroundedClaim[] | undefined, limit: number): string | null {
  const text = (claims ?? []).map(c => c.text.trim()).filter(Boolean).join('\n')
  if (!text) return null
  // 잘라서 "완성된 기록"처럼 보이게 하지 않는다 — 넘치면 비우고 사람이 쓰게 한다.
  return text.length > limit ? null : text
}

/** 보호자 문장 — 생성된 것이 있으면 그것, 없으면 요약 첫 문장. 판정 표현이면 비운다. */
export function buildGuardianText(result: GeneratedSession): string | null {
  const candidate = (result.guardianText ?? result.summary[0]?.text ?? '').trim()
  if (!candidate || candidate.length > LIMITS.guardian_text || DIAGNOSTIC_EXPRESSION.test(candidate)) return null
  return candidate
}

/** 생성 결과 → 공단 서식 칸(검사 전). */
export function mapAnalysisToJournalFields(result: GeneratedSession): JournalDraftFields {
  return {
    activity_content: joinClaims(result.journal, LIMITS.activity_content),
    participant_response: joinClaims(result.participantResponse, LIMITS.participant_response),
    opinion_collected: joinClaims(result.opinion, LIMITS.opinion_collected),
    overall_evaluation: null,
    next_plan: null,
    guardian_text: buildGuardianText(result),
  }
}

export interface ScreenedJournalDraft {
  fields: JournalDraftFields
  /** 진단·판정 표현이 걸려 비운 칸(확인 화면 안내용). */
  cleared: ScreenedField[]
  /** 초안은 언제나 확인 대기다 — 워커가 확정을 쓰는 경로는 없다. */
  status: 'pending_review'
}

/** 진단·판정 표현이 걸린 칸만 비운다(나머지는 그대로 — 전체 실패가 아니다). */
export function screenJournalDraft(fields: JournalDraftFields): ScreenedJournalDraft {
  const out: JournalDraftFields = { ...fields }
  const cleared: ScreenedField[] = []
  for (const key of Object.keys(LIMITS) as ScreenedField[]) {
    const value = out[key]
    if (value && DIAGNOSTIC_EXPRESSION.test(value)) {
      out[key] = null
      cleared.push(key)
    }
  }
  return { fields: out, cleared, status: 'pending_review' }
}
