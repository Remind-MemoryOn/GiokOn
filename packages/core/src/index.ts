// @giokon/core — 플랫폼 무관 도메인 레이어 (웹·모바일 공유)
//
//   - 도메인 타입 (types)
//   - 어르신 프로필 파생값(만 나이·생년월일 표기) (profile)
//   - 순수 유틸 (utils)
//   - 노인 특화 대화 안전 엔진(상황 분류·관여도·가드레일·투명성) (safety)
//   - 어르신 발화 안전 평가·세션 권고 (conversation) — 대화 생성은 음성 중계가 한다
//   - 실 LLM 시스템 프롬프트 (prompt)
//   - 대화 단계 정책(도입→회상→마무리, 전환 시점·내부 지시문) (session-phase)
//   - 세션 자동 요약·분석(비의료 관찰 지표·주제 반응·추천) (analysis)
//   - (AI 에이전트 agent.ts 는 신규 웹 디자인에서 기능이 제거돼 삭제됨)
//   - 동의 카탈로그(필수/민감/국외이전·온보딩 게이팅) (consent)
//   - 정보주체 권리(이동권 산출물·삭제 계획) (subject-rights)
//   - 음성 입출력 계약 SpeechProvider (speech)
//
// Zustand UI 스토어와 데이터 레이어(TanStack Query)는 각각
// 앱(apps/web)·@giokon/data에서 이 코어를 사용한다. DOM/RN 의존을 두지 않는다.

export * from './types'
export * from './profile'
export * from './utils'
export * from './safety'
export * from './conversation'
export * from './session-phase'
export * from './prompt'
export * from './analysis'
export * from './observations'
export * from './journal'
export * from './consent'
export * from './subject-rights'
export * from './speech'
export * from './voice-context'
export * from './generated-session'

export * from './voice-failure'
