// @giokon/data — Supabase 데이터·인증 레이어 (웹·모바일 공유)
//
// M2에서 이전 예정:
//   - supabase-js 클라이언트 팩토리 (publishable 키, 플랫폼별 storage 어댑터)
//   - TanStack Query 훅 (useQuery/useMutation: profiles/chronicles/sessions/logs)
//   - Supabase Auth (signUp/signIn/signOut/비밀번호 재설정/session)
//   - 생성된 DB 타입
//
// 서버 상태의 source of truth는 TanStack Query. (UI 상태는 @giokon/core의 Zustand)
export const DATA_PLACEHOLDER = true
