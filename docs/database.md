# Database Setup

## Direction

기억온 v1 데이터베이스는 Supabase PostgreSQL을 사용한다. 인증은 **Supabase Auth**를 사용하며, 데이터 접근은 클라이언트(웹·모바일)가 supabase-js로 직접 연동하고 **RLS(`auth.uid()`)** 로 소유자별로 격리한다. Supabase는 DB·Auth·Storage·Edge Functions를 통합 제공한다.

## Files

- `supabase/migrations/`: v1 스키마, 인덱스, 트리거, RLS 정책. (RLS는 `auth.uid()` 기준으로 작성한다.)
- `supabase/functions/`: AI 파이프라인 Edge Functions(STT→LLM→TTS).
- `docs/database.md`: Supabase 적용 절차와 접근 모델.

## Tables

- `users`: 요양보호사 계정. `auth.users`와 1:1로 연결되며(가입 시 트리거로 생성), `id = auth.uid()`.
- `profiles`: 요양보호사가 담당하는 어르신 기본 연대기.
- `chronicle_entries`: 요양보호사 입력 및 AI 추출 연대기 항목.
- `sessions`: 세션 메타데이터와 진행 상태.
- `session_logs`: AI/어르신 발화 전문, STT 수정 이력, TTS 오디오 URL.

## Access Model

대부분의 요청은 클라이언트가 **supabase-js로 직접** 수행한다. 인증된 사용자의 JWT가 자동 첨부되고, RLS가 각 행의 소유자(`user_id = auth.uid()`)를 검증한다.

```sql
-- 예시 정책 (모든 테이블 동일 패턴)
create policy profiles_select_own on profiles
  for select using (user_id = auth.uid());
```

AI 파이프라인(STT/LLM/TTS)처럼 provider 키 보호가 필요한 작업만 **Edge Function**이 처리한다. Edge Function은 호출자의 JWT를 검증한 뒤 service role로 결과를 기록한다.

권장 흐름(세션 응답):

1. 클라이언트가 어르신 발화 오디오와 함께 `session-respond` Edge Function 호출(JWT 포함).
2. 함수가 JWT 검증 → 세션 소유자 확인.
3. STT(gpt-4o-transcribe) → LLM(현행 프런티어, Structured Outputs) → TTS(Clova) 순차 처리.
4. `session_logs`에 AI 턴 기록, `audio_url` 반환.

## Apply to Supabase

Supabase CLI로 공식 마이그레이션 흐름을 사용한다.

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push          # 마이그레이션 적용
supabase functions deploy # Edge Functions 배포
```

로컬 개발은 `supabase start`로 로컬 스택을 띄워 마이그레이션·함수를 검증한 뒤 원격에 반영한다. CLI 없이 먼저 적용하려면 Supabase Dashboard의 SQL Editor에서 마이그레이션 SQL을 실행한다.

## Environment Variables

Supabase **publishable/secret 키 체계**를 사용한다(레거시 anon/service_role 키는 2026말 폐기 예정). 클라이언트(웹·모바일)는 공개 가능한 값만 사용한다.

```env
# 클라이언트 (웹: Vite / 모바일: Expo)
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<publishable-key>"   # 레거시 anon key 대체
```

Edge Functions 전용 비밀값은 Supabase secrets로 관리하고 클라이언트에 노출하지 않는다.

```env
# Edge Functions secrets (클라이언트 미노출)
SUPABASE_SECRET_KEY="<secret-key>"             # 레거시 service_role key 대체
OPENAI_API_KEY="<...>"
CLOVA_VOICE_KEY="<...>"
```

실제 값은 커밋하지 않는다.

## Notes

- v1에서는 별도 실시간 동기화 DB를 쓰지 않는다. 실시간 모니터링이 필요해지면 Supabase Realtime을 검토한다.
- 어르신 출생연도는 입력 검증 기준에 맞춰 `1900..2006`으로 제한한다.
- TTS 결과 오디오는 `session_logs.audio_url`과 `audio_expires_at`으로 추적한다. 24시간 만료 파일 삭제는 `pg_cron` 또는 스케줄 Edge Function으로 구현한다.
- API 응답의 `timestamp` 필드는 DB의 `session_logs.spoken_at`에서 매핑한다.
- 기존 마이그레이션이 `firebase_uid` / `app.user_id` 기반으로 작성돼 있다면, `auth.users` 연결 + `auth.uid()` 기반 RLS로 재작성한다.
