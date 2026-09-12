# Database Setup

> **2026-09-12 현재 개발 기준**: [개발 실행안](plans/business-plan-development-delta.md)의 현재 구현/변경 목표/인수 조건을 적용한다. 앱은 Live 직접 입력·대화와 검증 Clova 출력, 담당자 시작·회수형 진행으로 변경할 계획이다. 웹 일지는 자유서술형이며 현재 초안은 규칙 기반이다. 사람의 최종 확인·선별 공개는 유지한다. 신규 LLM·과금·계측·학습 기능과 과거 구현/배포 이력을 구분한다.

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
- `app.complete_onboarding(p_name, p_phone, p_role, p_org_name, p_elder_code)`(RPC, SECURITY DEFINER): caregiver→기관 생성+role=org_admin / guardian→role=guardian, 어르신 코드 있으면 기관 합류+`profile_guardians`(pending). 원자적.
- Edge Function `naver-auth`(신규): **네이버=Supabase 비네이티브** → OAuth 콜백→프로필→Supabase Admin 사용자 매핑·세션. 구글·카카오는 네이티브 `signInWithOAuth`. 네이버 client secret 등 비밀값=서버(secrets) 보관.

어르신 영속 코드 + 요양보호사 배정 재설계(2026-07-22 — 담당 변경/추가 시 데이터 연속성. 마이그레이션 `20260722100000`, 로컬 PG16 검증):

- **핵심**: 어르신(profiles)의 단일 소유(user_id) → "최초 생성 actor"로 의미 축소(nullable·**ON DELETE SET NULL**). 접근은 **배정(profile_caregivers)** 기반으로 전환. 담당이 바뀌거나 늘어도 기존 어르신·연대기·세션·분석·일지를 그대로 인계받는다(신규 생성 없음).
- `elder_codes`: 어르신별 **영속·비소진** 코드(profile_id 1:1·unique). 어르신 생성 트리거가 자동 발급. **보호자 미열람**(별도 테이블·RLS로 권한 상승 차단) — 보호자는 코드를 link RPC 입력으로만 사용. 회전(rotate) 지원.
- `profile_caregivers`: 어르신↔요양보호사 **배정**(다대다·status active/removed·감사). 코드로 self-claim.
- **자식 FK 완화**: chronicle_entries/sessions/session_logs의 복합 FK `(profile_id,user_id)` → `profile_id`(자식은 session_id) 단독 + `user_id` nullable actor(SET NULL). → 새 담당자의 **쓰기 연속성** 확보.
- **RLS 재작성(배정 기반)**: profiles·chronicle_entries·sessions·session_logs·session_analyses·care_journals·guardian_shares(요양보호사 브랜치)·safety_events·consents 를 `org_id=현재기관 AND 비 guardian AND (배정 or org_admin)`으로. 같은 기관 org_id 격리 유지(타 기관 이관은 범위 밖). 보호자 경로(공개 커밋·연결 승인)는 유지.
- `app.is_assigned_caregiver(profile_id)`(security definer): 배정 판정 헬퍼(RLS 재귀 방지).
- `claim_elder_by_code(p_code)`(RPC): **활성 담당/관리자**만 같은 기관의 다른 어르신을 즉시 인계(멱등). 미승인 요양보호사의 자가 승격 우회는 가드로 차단.
- `link_guardian_by_elder_code(p_code)`(RPC): 보호자 연결(영속·비소진·멱등). 구 `redeem_guardian_invite`(1회성) 대체.
- 구 `guardian_invites`·`redeem_guardian_invite`는 **폐기**(감사 이력 보존 위해 테이블·함수는 잔존, 신규 발급 없음). QR/`/join` 경로 제거.

요양보호사 기관 합류(**승인형**) — `20260722110000`(enum `pending` 추가)·`20260722120000`:

- **온보딩(caregiver)**: 기관명 → 새 기관(org_admin) / 어르신 코드 → **기존 기관 합류 요청**(role=caregiver, org_id 확정, 배정 `status='pending'`). 코드만으로 즉시 권한을 얻지 못한다(보호자 연결과 대칭).
- `profile_caregivers.status='pending'` 신설: `is_assigned_caregiver`(status='active' 만 인정)에 걸리지 않아 **승인 전 어떤 데이터 접근도 없음**.
- `approve_caregiver_assignment(p_id)`(RPC): 그 어르신의 **활성 담당** 또는 **org_admin** 이 pending → active. **본인 자가승인 불가**.
- **자가승인 3중 차단**: (a) UPDATE 정책 강화(본인 행은 'removed' 로만), (b) approve RPC 본인 배제, (c) claim 가드(활성 담당/admin 만). + 본인 배정 self-select 정책(승인 대기 상태 확인용).
- `rotate_elder_code(p_profile_id)`(RPC): 코드 회전(서버 생성·매번 상이·배정/admin 게이트). 클라이언트 코드 생성 제거. profile_id 불변 → 보호자 연결 유지.
- **코드 생성 강화(`20260722130000`)**: `app.generate_invite_code()` 를 **암호학적 난수**(`gen_random_bytes`, pgcrypto CSPRNG — 예측 가능한 `random()` 대체) + **혼동문자 전면 제외 30자 알파벳**(`0/1/I/L/O/U` 제외) + **10자**로 개선. 승인 게이트와 함께 추측/열거 저항. 기존 8자 코드는 유효(check 6~32), 신규 발급·회전분부터 10자.

이메일 인증 병행 + 소셜 본인인증 캡처(`20260722140000`, 2026-07-23 — 이메일 로그인 재도입):

- 이메일(아이디)+비밀번호 로그인·회원가입·비밀번호 재설정은 **Supabase Auth 기본 제공**(데이터층 `signInWithEmail`/`signUpWithEmail`/`sendPasswordResetEmail`/`updatePassword`). 실 메일 발송은 프로젝트 **SMTP 설정 필요**(runbook).
- `find_login_email(p_name, p_phone)`(RPC, SECURITY DEFINER): **아이디(이메일) 찾기** — 이름+전화 정확히 1건 일치일 때만 **마스킹 이메일**(`ab***@dom`) 반환, 없음·중복은 null(존재 노출 최소화). 로그인 전 기능이라 `anon`+`authenticated` 에 grant. 프로덕션은 본인인증(PASS) 게이트 권장.
- `handle_new_user` 보강: provider 메타의 **전화(본인인증)** 를 형식 검증 후 `users.phone` 에 선반영 → 온보딩 프리필(구글은 전화 미제공, 카카오·네이버는 동의·검수 시 제공).

온보딩 단순화 + 음성 STT(`20260722150000` · Edge Function, 2026-07-25):

- `complete_onboarding` 개정: **요양보호사 = 소속 기관명 입력**(새 기관+org_admin)으로 되돌림(어르신 코드 합류 토글 제거 — 코드는 보호자용). 보호자 브랜치(어르신 코드 연결) 유지. 여러 요양보호사 같은 기관 합류(연속성)는 추후 기관 초대 메커니즘으로(런북).
- Edge Function **`stt-transcribe`**(신규): 요양일지 음성 파일 → CLOVA CSR 인식 → `{text}`. CLOVA 키는 서버 시크릿(`NCP_CLOVA_CLIENT_ID/SECRET`). 데이터층 `transcribeAudio(file)`. 미배포 시 UI 안내.

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
3. 변경 목표: Gemini Live 직접 음성·대화 → 출력 전사 수신 → 서버 검증 → Clova TTS. 현재 토큰 직접 연결과 새 중계/출력 계약을 구분하며 Live Structured Outputs를 전제하지 않는다.
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
OPENAI_API_KEY="sk-..."                        # 과거 공급자 예시; 초기 Live 필수 키가 아님
NCP_CLOVA_CLIENT_ID="<X-NCP-APIGW-API-KEY-ID>"     # CLOVA Voice(TTS)/Speech(STT) — Client ID
NCP_CLOVA_CLIENT_SECRET="<X-NCP-APIGW-API-KEY>"    # CLOVA — Client Secret (쌍으로 인증)
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

## 2026-09-12 사업 기획 반영 사항

현재 테이블을 변경한 것은 아니다. 신규 데이터 계약 후보: 회상/직접 관찰 출처, 입력 원문·생성 초안·최종본 연결, 공급자 모델·프롬프트 버전·청구 토큰·TTS 문자 수·기관/세션 귀속·멱등 키, 작성/수정/승인과 개입 이벤트, 학습 동의·독립 원음/전사·검수·철회 계보. 기존 컬럼으로 가능한 범위를 먼저 대조하고 필요한 마이그레이션만 설계한다. 공개 전환은 초안 승인과 별개이며 RLS·감사·철회 검증이 필요하다.
