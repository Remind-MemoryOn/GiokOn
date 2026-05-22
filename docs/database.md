# Database Setup

## Direction

기억온 v1 데이터베이스는 Supabase PostgreSQL을 사용한다. 인증은 기존 계획대로 Firebase Auth를 유지하고, Supabase는 장기 저장용 PostgreSQL 서비스로만 사용한다.

## Files

- `supabase/migrations/20260521131723_initial_schema.sql`: v1 초기 스키마, 인덱스, 트리거, RLS 정책.
- `docs/database.md`: Supabase 적용 절차와 백엔드 접근 모델.

## Tables

- `users`: Firebase UID와 연결되는 요양보호사 계정.
- `profiles`: 요양보호사가 담당하는 어르신 기본 연대기.
- `chronicle_entries`: 요양보호사 입력 및 AI 추출 연대기 항목.
- `sessions`: 세션 메타데이터와 진행 상태.
- `session_logs`: AI/어르신 발화 전문, STT 수정 이력, TTS 오디오 URL.

## Access Model

모든 앱 요청은 Node/Express API를 통과한다. 서버는 Firebase ID Token을 검증하고 `users.firebase_uid` 기준으로 내부 `users.id`를 찾거나 생성한다.

Supabase RLS는 `app.current_user_id()` 함수를 기준으로 작성되어 있다. 서버가 service role로만 접근하는 경우 RLS는 백엔드 검증을 보완하는 안전장치이며, 향후 일반 DB role을 사용할 경우 트랜잭션마다 다음 값을 설정해야 한다.

```sql
select set_config('app.user_id', '<users.id uuid>', true);
```

권장 백엔드 흐름:

1. Firebase ID Token 검증.
2. `users.firebase_uid`로 `users.id` 조회 또는 upsert.
3. 같은 트랜잭션에서 `app.user_id` 설정.
4. 프로필/세션/로그 쿼리 실행.

## Apply to Supabase

Supabase CLI가 있으면 공식 마이그레이션 흐름을 사용한다.

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

CLI 없이 먼저 적용하려면 Supabase Dashboard의 SQL Editor에서 `supabase/migrations/20260521131723_initial_schema.sql` 내용을 실행한다.

## Environment Variables for Backend

백엔드 구현 시 `.env.example`에 아래 값을 추가한다. 실제 값은 커밋하지 않는다.

```env
DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<database>"
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

## Notes

- v1에서는 Firebase Realtime DB를 쓰지 않는다.
- 어르신 출생연도는 현재 설계 문서의 입력 검증 기준에 맞춰 `1900..2006`으로 제한한다.
- TTS 결과 오디오는 `session_logs.audio_url`과 `audio_expires_at`으로 추적한다. 24시간 만료 파일 삭제는 백엔드 배치나 Supabase scheduled job 단계에서 구현한다.
- API 응답의 `timestamp` 필드는 DB의 `session_logs.spoken_at`에서 매핑한다.
