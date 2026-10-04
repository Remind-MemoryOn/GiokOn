// @giokon/core — 대화 단계 정책(파일럿 계획 §9-1 · C2) — 중계와 앱이 공유하는 순수 함수
//
// 세션은 도입(인사·컨디션) → 회상(설계된 주제) → 마무리·의견수렴 순서로 흐른다.
// **현재 단계는 서버(sessions.phase)가 권위**다 — 이 모듈은 "다음 단계로 넘어갈 때인가"를 계산하고
// (중계가 advance_session_phase 로 기록), 단계마다 모델에 넣을 **내부 지시문**을 만든다.
// 지시문은 clientContent(turnComplete=false)로 주입되어 어르신께 들리지 않고, 모델 출력은 여전히
// 중계의 출력 검열(screenAiUtterance)·Gemini TTS 합성을 거친다. AI 자율 판단에 단계를 맡기지 않는다.
//
// 시간 상한은 세션 1회 **최대 10분**(사용자 확정 2026-09-24, 서버 고정). 마무리·의견수렴이 잘리지 않게
// 마무리 진입은 목표 시간보다 CLOSING_RESERVE_SECONDS 앞에서 한다.

export type SessionPhase = 'intro' | 'reminiscence' | 'closing'

/** 서버 고정 상한(분). 목표 시간이 더 커도 이 값으로 자른다(DB `app.session_target_minutes` 와 같은 규칙). */
export const SESSION_MAX_MINUTES = 10
/** 마무리·의견수렴에 남겨 두는 시간(초). */
export const CLOSING_RESERVE_SECONDS = 90
/** 도입이 이보다 길어지면(초) 대답이 없어도 회상으로 넘어간다. */
export const INTRO_MAX_SECONDS = 60

export interface PhaseClock {
  /** 현재 단계(아직 시작 전이면 null). */
  phase: SessionPhase | null
  /** 세션 시작부터 경과(초) — 서버 시계(session_tick). */
  elapsedSeconds: number
  /** 목표 시간(분) — coalesce(세션 설계, 기관 설정). 상한은 여기서도 다시 건다. */
  targetMinutes: number
  /** 현재 단계에 들어온 뒤 어르신이 대답한 횟수. */
  elderTurnsInPhase: number
  /** 현재 단계에 들어온 뒤 경과(초). */
  phaseElapsedSeconds: number
}

/** 마무리 진입 시각(초) — 목표 시간(상한 10분) − 여유. 너무 짧은 목표에서도 회상 시간이 음수가 되지 않게 한다. */
export function closingStartsAt(targetMinutes: number): number {
  const target = Math.min(SESSION_MAX_MINUTES, Math.max(1, Math.floor(targetMinutes))) * 60
  return Math.max(Math.floor(target / 2), target - CLOSING_RESERVE_SECONDS)
}

/**
 * 다음 단계가 있으면 그 값을, 머물러야 하면 null 을 돌려준다(순수).
 * 단계는 앞으로만 간다 — DB(advance_session_phase)도 같은 순서를 강제한다.
 */
export function shouldAdvancePhase(clock: PhaseClock): SessionPhase | null {
  if (!Number.isFinite(clock.elapsedSeconds) || !Number.isFinite(clock.targetMinutes)) return null
  if (clock.phase === null) return 'intro'
  if (clock.phase === 'closing') return null
  if (clock.elapsedSeconds >= closingStartsAt(clock.targetMinutes)) return 'closing'
  if (clock.phase === 'intro' && (clock.elderTurnsInPhase >= 1 || clock.phaseElapsedSeconds >= INTRO_MAX_SECONDS)) {
    return 'reminiscence'
  }
  return null
}

/** 마무리로 가는 이유 — 시간이 다 됐는지, 어르신이 쉬고 싶어 하셨는지(파일럿 계획 §9-5). */
export type ClosingReason = 'time' | 'rest_request'

/**
 * 단계 전환 시 모델에 넣을 내부 지시문. "(내부 지시)" 로 시작한다 — 시스템 프롬프트가 이 표식의
 * 메시지를 어르신 말씀이 아니라 진행 지시로 다루고 소리 내어 읽지 않게 한다.
 */
export function buildPhaseDirective(phase: SessionPhase, reason: ClosingReason = 'time'): string {
  switch (phase) {
    case 'intro':
      return '(내부 지시) 지금은 도입 단계입니다. 따뜻하게 인사하고 오늘 기분이나 몸 상태를 짧게 한 가지만 여쭤보세요. 회상 질문은 아직 하지 않습니다.'
    case 'reminiscence':
      return '(내부 지시) 지금부터 회상 단계입니다. 오늘 설계된 주제를 중심으로 옛 이야기를 여쭤보세요. 짧은 문장으로 한 번에 질문 하나만 하고, 대답이 짧거나 없으시면 예·아니오나 둘 중 고르는 쉬운 질문으로 바꿉니다. 재촉하지 않습니다. 피해 갈 주제는 꺼내지 않습니다.'
    case 'closing':
      return reason === 'rest_request'
        ? '(내부 지시) 어르신이 쉬고 싶어 하십니다. 새 질문 없이 고마움을 담은 짧은 인사 한 문장으로 대화를 마칩니다.'
        : '(내부 지시) 이제 마무리 단계입니다. 새 주제를 꺼내지 말고, 오늘 나눈 이야기에 고마움을 전한 뒤 "오늘 이야기 어떠셨어요?"처럼 소감을 한 번만 여쭤보세요. 대답을 들으면 짧게 인사하고 마칩니다.'
  }
}

/**
 * 어르신의 휴식 요청·거부로 대화를 마칠 때(파일럿 계획 §9-5 · T21.11) 중계가 들려주는 **고정 인사 한 문장**.
 * 모델에게 생성을 맡기지 않는다 — 새 질문·긴 말 없이 정확히 한 문장으로 끝나게. 그래도 중계 출력 검열과 TTS 를 거친다.
 * 의견수렴("오늘 어떠셨어요?")은 하지 않는다(쉬고 싶어 하시는 분께 질문하지 않는다).
 */
export const ELDER_CLOSING_FAREWELL = '오늘 이야기 나눠 주셔서 고마워요. 편히 쉬세요.'
/** 어르신 요청으로 마무리한 이유 — 감독 화면 기록(`session_interventions.detail.situation`)에 그대로 남는다(발화 원문 없음). */
export type ElderClosingSituation = 'rest_request' | 'refusal'

/** 단계별 예상 시간(초) — 웹 세션 설계의 "단계 미리보기"용. */
export interface PhasePlan {
  /** 목표 시간(분) — 상한 10분을 건 값. */
  targetMinutes: number
  /** 도입 최대(첫 대답이 오면 더 일찍 회상으로 넘어간다). */
  introSeconds: number
  /** 회상(도입이 빨리 끝나면 그만큼 길어진다). */
  reminiscenceSeconds: number
  /** 마무리·의견수렴. */
  closingSeconds: number
}

/**
 * 목표 시간 → 단계별 예상 시간(순수). shouldAdvancePhase 와 **같은 규칙**이다 —
 * 도입은 최대 INTRO_MAX_SECONDS, 마무리는 closingStartsAt 부터 목표 시간까지.
 */
export function phasePlan(targetMinutes: number): PhasePlan {
  const minutes = Math.min(SESSION_MAX_MINUTES, Math.max(1, Math.floor(Number.isFinite(targetMinutes) ? targetMinutes : SESSION_MAX_MINUTES)))
  const closingAt = closingStartsAt(minutes)
  const intro = Math.min(INTRO_MAX_SECONDS, closingAt)
  return {
    targetMinutes: minutes,
    introSeconds: intro,
    reminiscenceSeconds: closingAt - intro,
    closingSeconds: minutes * 60 - closingAt,
  }
}
