// @giokon/data — Supabase 데이터·인증 레이어 (웹·모바일 공유)
//
// 구성:
//   - client    : supabase-js 클라이언트 팩토리 + 전역 레지스트리(initGiokonData)
//   - auth      : Supabase Auth (signUp/signIn/signOut/비밀번호 재설정/session)
//   - query     : TanStack Query 클라이언트 + 쿼리 키 팩토리
//   - hooks/*   : 엔티티별 TanStack Query 훅 (profiles/chronicles/sessions/logs/organizations/consents)
//   - mappers   : DB row ↔ @giokon/core 도메인 타입 변환
//   - database.types : DB 타입(추후 `supabase gen types`로 교체)
//
// 서버 상태의 source of truth는 TanStack Query. (UI 상태는 @giokon/core의 Zustand)
//
// 사용:
//   initGiokonData(createGiokonClient({ url, publishableKey, storage }))
//   <QueryClientProvider client={createGiokonQueryClient()}> ... </QueryClientProvider>

export * from './client'
export * from './auth'
export * from './query'
export * from './database.types'
export * from './mappers'
export * from './hooks/profiles'
export * from './hooks/chronicles'
export * from './hooks/sessions'
export * from './hooks/organizations'
export * from './hooks/consents'
export * from './hooks/safety'
