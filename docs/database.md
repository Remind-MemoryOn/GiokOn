# Database Setup

> 🏢 **엔터프라이즈·정부심사 트랙(2026-07-03)**: 스키마 상향 — `organizations`/`consents`/`audit_log` + **조직 RBAC**(전 테이블 RLS를 조직+역할 기준으로 확장), 리전=**서울(ap-northeast-2)**, 보관/파기 정책. 상세: PLAN §2′(M9·M10·M14) · `docs/security.md` · `docs/compliance.md`.

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
- `organizations` / `consents` / `audit_log` / `safety_events`: 기관(테넌트)·동의·감사·위기 이벤트 — 적용 완료(마이그레이션 7종, PLAN §2′ M9·M10·M12·M14).

웹 1차 MVP 신규(2026-07-13 인터뷰 반영 — Phase W, 계획 확정·마이그레이션 예정):

- `session_analyses`: 세션 종료 시 AI 분석 결과(`core/analysis` SessionAnalysis JSON·버전). RLS 조직 범위(**guardian 제외**). 앱이 insert.
- `care_journals`: 요양일지(내용·source[photo/voice/typed/ai_draft]·사진 경로·draft/final). **민감정보 취급**(동의·보관파기). guardian 직접 접근 불가.
- `profile_guardians`: 어르신↔보호자 연결(status pending/approved/revoked·승인자).
- `guardian_invites`: 어르신별 1회성·72h 만료 초대 코드(QR=코드 URL).
- `guardian_shares`: 공개 커밋(항목 유형[일지/분석/세션요약/리포트]·승인자·시점·**철회**). **보호자는 승인된 연결+미철회 행만 SELECT**.
- Storage 버킷 `journal-photos`(private): 일지 사진 원본. RLS·보관 정책 적용.
- ⚠️ RLS 가드(필수 선행, T17.0): `safety_events` SELECT에 guardian 역할 배제 — 보호자 기관 합류 시 위기 발췌 노출 차단.

인증 개편 신규/변경(2026-07-16 — 소셜 로그인·회원가입·연결, 계획 확정·마이그레이션 예정):

- `users`(변경): `org_id` **NOT NULL → NULL 허용**(미온보딩·미연결 보호자), `phone text`·`onboarded_at timestamptz` 컬럼 추가.
- `handle_new_user`(재작업): 기관 자동생성·org_admin 강제 제거 → `(id, name, email)` **최소 insert(org_id NULL)**. 온보딩 완료 전까지 데이터 미노출.
- `app.complete_onboarding(p_name, p_phone, p_role, p_org_name, p_invite_code)`(신규 RPC, SECURITY DEFINER): caregiver→기관 생성+role=org_admin / guardian→role=guardian, 코드 유효 시 기관 합류+`profile_guardians`(pending)+코드 소진. org 생성·역할·전화·코드 소진을 **원자적**으로.
- `redeem_guardian_invite(p_code)`(신규 RPC): 로그인 후 보호자 어르신 연결(72h·1회성 검증→`profile_guardians` pending). 온보딩 코드 입력·보호자 대시보드 "어르신 연결" 공용.
- Edge Function `naver-auth`(신규): **네이버=Supabase 비네이티브** → OAuth 콜백→프로필→Supabase Admin 사용자 매핑·세션. 구글·카카오는 네이티브 `signInWithOAuth`. 네이버 client secret 등 비밀값=서버(secrets) 보관.

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
NAVER_CLIENT_ID="<...>"                         # 소셜 로그인(네이버, 커스텀 naver-auth)
NAVER_CLIENT_SECRET="<...>"                     # 서버에만 보관
```

실제 값은 커밋하지 않는다.

## Notes

- 실시간 동기화: 웹 1차 MVP(Phase W)부터 **Supabase Realtime 구독**을 사용한다 — `sessions`·`session_analyses`·`guardian_shares` 변경을 웹 대시보드/분석/보호자 화면에 실시간 반영(T-E3). 별도 실시간 DB는 두지 않는다.
- 어르신 출생연도는 입력 검증 기준에 맞춰 `1900..2006`으로 제한한다.
- TTS 결과 오디오는 `session_logs.audio_url`과 `audio_expires_at`으로 추적한다. 24시간 만료 파일 삭제는 `pg_cron` 또는 스케줄 Edge Function으로 구현한다.
- API 응답의 `timestamp` 필드는 DB의 `session_logs.spoken_at`에서 매핑한다.
- 기존 마이그레이션이 `firebase_uid` / `app.user_id` 기반으로 작성돼 있다면, `auth.users` 연결 + `auth.uid()` 기반 RLS로 재작성한다.
