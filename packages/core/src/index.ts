// @giokon/core — 플랫폼 무관 도메인 레이어 (웹·모바일 공유)
//
//   - 도메인 타입 (types)
//   - 순수 유틸 (utils)
//   - AI 도메인 규칙 + AIProvider/MockAIProvider (ai)
//   - 음성 입출력 계약 SpeechProvider (speech)
//
// Zustand UI 스토어와 데이터 레이어(TanStack Query)는 각각
// 앱(apps/web)·@giokon/data에서 이 코어를 사용한다. DOM/RN 의존을 두지 않는다.

export * from './types'
export * from './utils'
export * from './ai'
export * from './speech'
