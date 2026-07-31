# 런북 — 웹 1차 MVP 외부 연동·오픈 체크리스트 (외부 진행 대기 사항)

> **목적**: 코드/DB 스키마·RLS·프론트는 개발 완료 상태다. **실서비스로 띄우려면
> Claude(컨테이너)가 접근할 수 없는 외부 설정**(Supabase 콘솔·소셜 개발자센터·SMTP·
> 결제·AI 키·배포)이 필요하다. 이 문서는 그 **외부 진행 대기 사항을 순서대로** 정리한다.
> 컨테이너는 `*.supabase.co` egress가 차단돼 Claude가 직접 적용할 수 없으므로, **사용자가
> 대시보드/CLI로 이 체크리스트를 따라 적용**한다.
>
> 관련 문서: 리전 이전 세부는 [`seoul-region-migration.md`](./seoul-region-migration.md),
> 앱(모바일) 추출은 [`figma-app-extraction.md`](./figma-app-extraction.md).

**전체 순서**: ① Supabase 프로젝트(서울)+마이그레이션 → ② Auth·SMTP → ③ 소셜 OAuth 3종
→ ④ 본인인증(전화/실명) 스코프 → ⑤ Edge Functions(naver-auth) → ⑥ Storage → ⑦ 실 AI 키
→ ⑧ 앱 재배선·배포 → ⑨ 검증.

각 단계는 앞 단계가 끝나야 다음이 의미가 있다(예: OAuth 리다이렉트는 프로젝트 URL이 있어야 등록 가능).

---

## 0. 사전 준비
- [ ] Supabase 조직 접근 + 결제수단(백업/PITR 위해 **Pro 플랜 권장**).
- [ ] 소셜 개발자 계정: **Google Cloud Console**, **Kakao Developers**, **Naver Developers**.
- [ ] 이메일 발송용 **SMTP 자격증명**(SendGrid·AWS SES·Mailgun 등) — 비밀번호 찾기/가입 확인 메일에 필수.
- [ ] 서비스 도메인(예: `app.giokon.co.kr`)과 HTTPS(배포 시 Vercel 자동).
- [ ] 강력한 DB 비밀번호·시크릿은 **비밀번호 관리자**에 보관(레포 커밋 금지).

---

## 1. Supabase 서울 프로젝트 + 마이그레이션 적용
세부는 [`seoul-region-migration.md`](./seoul-region-migration.md). **리전은 반드시
`Northeast Asia (Seoul) = ap-northeast-2`**(데이터 국내보관).

### 1-1. 마이그레이션 (번호 순서 엄수 — 총 20개)
> 실 Supabase에는 `auth.users`·`auth.uid()`·`authenticated`·`anon` 롤이 이미 존재하므로
> **로컬 테스트 심(`supabase/tests/_supabase_shims.sql`)은 적용하지 않는다.**

**방법 A — CLI(권장, 자동 순서):**
```bash
supabase link --project-ref <서울_project_ref>
supabase db push          # supabase/migrations/ 전체를 순서대로 적용
```
**방법 B — 대시보드 SQL Editor:** 아래 순서대로 각 파일을 끝까지 실행.

| # | 파일 | 내용 |
|---|---|---|
| 1 | `20260521131723_initial_schema.sql` | 5테이블·인덱스·기본 RLS |
| 2 | `20260624090000_supabase_auth_rls.sql` | Auth 전환·가입 트리거·auth.uid() RLS |
| 3 | `20260703120000_organizations_rbac.sql` | 조직·RBAC·org_id·조직 RLS |
| 4 | `20260703130000_audit_log.sql` | 감사로그·2년 보관 |
| 5 | `20260703140000_consents.sql` | 동의(민감·국외이전·대리동의) |
| 6 | `20260703150000_consent_retention.sql` | 동의 증빙 보존 |
| 7 | `20260711100000_safety_events.sql` | 안전 이벤트(위기 에스컬레이션) |
| 8 | `20260718100000_safety_events_guardian_rls.sql` | safety_events guardian 배제 가드 |
| 9 | `20260718110000_auth_onboarding.sql` | 최소 가입 트리거 + complete_onboarding |
| 10 | `20260718120000_guardian_links.sql` | 보호자 연결(구 초대·감사 이력) |
| 11 | `20260718125000_realtime_publication.sql` | Realtime 퍼블리케이션 |
| 12 | `20260718130000_session_analyses.sql` | 세션 분석 |
| 13 | `20260718140000_care_journals.sql` | 요양일지 + Storage 정책 |
| 14 | `20260718150000_guardian_shares.sql` | 공개 커밋(보호자 노출) |
| 15 | `20260722100000_elder_codes_caregiver_assignment.sql` | 어르신 영속 코드·배정·9테이블 RLS 재작성 |
| 16 | `20260722110000_caregiver_assignment_pending.sql` | 배정 pending 상태 추가 |
| 17 | `20260722120000_caregiver_org_join_approval.sql` | 요양보호사 기관 합류 승인형 |
| 18 | `20260722130000_elder_code_generation_hardening.sql` | 코드 생성 CSPRNG·혼동문자 제거 |
| 19 | `20260722140000_email_auth_support.sql` | 이메일 인증 보조(find_login_email·전화 캡처) |
| 20 | `20260722150000_onboarding_caregiver_org_name.sql` | 온보딩 기관명 단순화(요양보호사 새 기관 생성) |

- [ ] 20개 전부 오류 없이 적용됐는지 확인. (`13`은 Storage 버킷 정책 포함 → §6과 연계.)

---

## 2. Auth·SMTP 설정 (이메일 로그인/찾기에 필수)
**Dashboard → Authentication**.

- [ ] **Providers → Email** 활성화. (이메일+비밀번호 로그인/회원가입에 필요.)
- [ ] **Confirm email** 정책 결정:
  - 켜기(권장): 가입 시 확인 메일 → 링크 클릭 후 로그인. (앱은 `needsConfirm` 안내 화면 지원.)
  - 끄기: 가입 즉시 세션(테스트 편의). 운영은 켜기 권장.
- [ ] **SMTP (Custom SMTP)** 설정 — **비밀번호 찾기·가입 확인 메일 발송에 필수**. 기본 내장
      메일러는 발송량 제한이 크므로 운영은 SendGrid/SES/Mailgun 등 연결.
- [ ] **URL Configuration → Redirect URLs** 에 아래 허용 등록:
  - `https://<서비스도메인>/onboarding` (가입 확인 후 복귀)
  - `https://<서비스도메인>/reset-password` (비밀번호 재설정 링크)
  - `https://<서비스도메인>/login` (소셜 로그인 복귀)
  - 로컬 개발용 `http://localhost:5173/*` 도 함께.
- [ ] **비밀번호 정책**(최소 길이 등) 확인 — 프론트는 8자 이상 검증. 운영 강화는 §9 이후.

> **아이디(이메일) 찾기 주의**: `find_login_email` 은 이름+전화 1건 일치 시 **마스킹
> 이메일**만 반환한다. 정부심사/개인정보 관점에서 **프로덕션은 본인인증(PASS/휴대폰 인증)
> 게이트를 앞단에 두는 것을 권장**한다(§4와 연계). 현재는 MVP용 이름+전화 매칭.

---

## 3. 소셜 OAuth 3종 등록 (구글·카카오·네이버)
각 provider에 앱을 만들고 **Redirect(콜백) URI** 를 등록한 뒤 Supabase에 키를 넣는다.
Supabase 콜백 URL은 보통 `https://<project-ref>.supabase.co/auth/v1/callback`.

### 3-1. Google (네이티브)
1. Google Cloud Console → **APIs & Services → Credentials → OAuth client ID (Web)**.
2. **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Providers → Google** → Client ID/Secret 입력, 활성화.
4. 스코프: 기본 `email profile`. (구글은 **전화번호 미제공** — 본인인증 전화는 카카오/네이버/PASS.)

### 3-2. Kakao (네이티브)
1. Kakao Developers → 앱 생성 → **카카오 로그인** 활성화.
2. **Redirect URI**: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **동의 항목**: 이메일·이름(닉네임)·**전화번호**·생일 등(전화·이름은 **비즈앱 전환+검수** 필요).
4. Supabase → **Providers → Kakao** → REST API 키/시크릿 입력, 활성화.

### 3-3. Naver (커스텀 — 네이티브 미지원)
네이버는 Supabase 기본 provider가 아니므로 **커스텀 Edge Function `naver-auth`** 로 처리(§5).
1. Naver Developers → 애플리케이션 등록 → **네이버 아이디로 로그인**.
2. **Callback URL**: `https://<project-ref>.supabase.co/functions/v1/naver-auth/callback`.
3. 제공정보(스코프): 이메일·이름·**휴대전화번호**·생일·성별 등 필요한 항목 선택(항목별 검수).
4. Client ID/Secret 은 **서버 시크릿**으로만 보관(§5).

- [ ] 3사 모두 콘솔 등록 + Supabase/시크릿 반영 완료.

---

## 4. 본인인증(전화·실명) 정보 연동
> 요청사항: "소셜 회원가입 시 해당 API의 본인인증 정보를 가져올 것."

동작 방식(이미 코드 반영됨): provider가 콜백에서 넘겨준 사용자 메타(`name`·`phone`·
`phone_number`·`birthday` 등)를 가입 트리거 `handle_new_user`가 읽어 **`users.name`·
`users.phone`에 선반영** → 온보딩 화면에서 **자동 프리필**된다.

외부에서 할 일:
- [ ] **Kakao/Naver 동의 항목에 전화번호(및 이름)를 포함**하고, 해당 항목은 대개
      **비즈니스 전환·검수(심사)** 가 필요하다 → 각 콘솔에서 신청.
- [ ] provider가 실제로 전화/이름을 반환하도록 스코프·검수 완료 확인(테스트 계정으로 로그인 →
      Supabase `auth.users.raw_user_meta_data`에 값이 들어오는지 확인).
- [ ] **강한 실명 본인인증(CI/DI)** 이 정부심사상 필요하면 **PASS/통신사 본인확인 또는
      휴대폰 인증(외부 본인확인기관)** 을 별도 도입(현재 범위 밖 — 후속 과제).
- [ ] 개인정보: 전화·생일 등 **수집 항목을 처리방침·동의서에 반영**(민감/필수 구분). 코드의
      동의 흐름(consents)과 정합 맞추기.

> **주의**: 구글은 전화번호를 주지 않는다. 전화 프리필은 카카오/네이버 로그인 또는
> 온보딩 직접 입력으로 채워진다(코드가 둘 다 지원).

---

## 5. Edge Functions 배포 (naver-auth 등)
- [ ] Supabase 시크릿 등록:
  ```bash
  supabase secrets set NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=...
  supabase secrets set SUPABASE_SECRET_KEY=...   # service_role 대체 secret 키
  ```
- [ ] `naver-auth` 함수 구현·배포(스캐폴드는 계획대로; OAuth 인가→토큰교환→사용자 매핑→세션).
  ```bash
  supabase functions deploy naver-auth
  ```
- [ ] 앱의 네이버 버튼이 `.../functions/v1/naver-auth/authorize` 로 이동하는지 확인
      (`buildNaverAuthUrl`). 콜백 URL은 §3-3과 일치.
- [ ] **`stt-transcribe`(요양일지 음성 파일 인식)**: 이미 스캐폴드 있음
      (`supabase/functions/stt-transcribe/index.ts`, CLOVA CSR). CLOVA 키 등록 후 배포:
      ```bash
      supabase secrets set NCP_CLOVA_CLIENT_ID=... NCP_CLOVA_CLIENT_SECRET=...
      supabase functions deploy stt-transcribe
      ```
      배포 전에는 요양일지 "음성 파일 올리기"가 안내 메시지를 띄운다(브라우저 실시간 음성 입력은 무관하게 동작).

---

## 6. Storage 버킷 (요양일지 사진)
- [ ] **Storage → Buckets → `journal-photos` (Private)** 생성. (마이그레이션 13이 정책을 깐다 —
      버킷 존재 필요.)
- [ ] 접근은 RLS/정책으로 제한(보호자 직접 접근 불가). 보관·파기 주기 확인.

---

## 7. 실 AI 키·STT/TTS (앱 음성·분석 실연동 시)
> 현재 AI는 mock(사람 확인 게이트). 실연동은 서버 Edge Function으로 키를 보호한다.
- [ ] `supabase secrets set OPENAI_API_KEY=sk-...` (LLM·STT gpt-4o-transcribe — Bearer 단일 키).
- [ ] CLOVA(TTS=Voice, STT 보완=Speech)는 **Client ID+Secret 한 쌍**(NCP AI·NAVER API):
      `supabase secrets set NCP_CLOVA_CLIENT_ID=... NCP_CLOVA_CLIENT_SECRET=...`
      (헤더 `X-NCP-APIGW-API-KEY-ID`/`X-NCP-APIGW-API-KEY`. 서비스별 애플리케이션을 따로
      등록했다면 `CLOVA_VOICE_*`/`CLOVA_SPEECH_*` 로 분리 — `supabase/.env.example` 참조.)
- [ ] STT=gpt-4o-transcribe(+Clova 보완), TTS=Clova Voice, LLM=현행 프런티어(Structured Outputs).
- [ ] AI 파이프라인 Edge Function 구현·배포 후, 앱/웹의 mock 자리에 배선(코드 변경 최소).

---

## 8. 앱 재배선 & 배포
### 8-1. 웹 (Vercel)
- [ ] `apps/web/.env`(또는 Vercel 환경변수):
  ```env
  VITE_SUPABASE_URL="https://<서울-project-ref>.supabase.co"
  VITE_SUPABASE_PUBLISHABLE_KEY="<publishable-key>"
  ```
- [ ] Vercel 프로젝트 연결 → 배포. 커스텀 도메인 연결(§2 Redirect URL과 일치).
- [ ] 키를 넣으면 `isSupabaseConfigured=true` 가 되어 목업→실데이터로 전환(코드 변경 불필요).

### 8-2. 모바일 (EAS, 선택)
- [ ] `apps/mobile/.env`(예시 `apps/mobile/.env.example`) 또는 EAS 환경변수에 **동일 URL·키**:
  ```env
  EXPO_PUBLIC_SUPABASE_URL="https://<서울-project-ref>.supabase.co"
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<publishable-key>"
  ```
  (웹의 `VITE_*` 와 같은 값, 접두사만 `EXPO_PUBLIC_*`. 값은 번들 시점에 인라인되므로 EAS
  빌드는 `eas.json` 의 env 또는 `eas secret:create` 로도 넣어야 한다 — 로컬 `.env` 는
  Metro dev 서버에서만 읽힘.)
- [ ] 키를 넣으면 앱이 `isSupabaseConfigured=true` 가 되어 목업→실데이터로 전환(코드 변경
      불필요 — 인증·읽기/쓰기 어댑터·세션 영속화가 자동 라이브). EAS 빌드/제출.

---

## 9. 검증 체크리스트 (오픈 전)
로그인·인증 흐름을 실제로 한 번씩 통과시켜 본다.

- [ ] **이메일 회원가입** → 확인메일(켰다면) → 로그인 → 온보딩(역할·기관) → 대시보드.
- [ ] **이메일 로그인**(기존 계정).
- [ ] **비밀번호 찾기** → 메일 링크 → `/reset-password` → 변경 → 재로그인.
- [ ] **아이디(이메일) 찾기** → 이름+전화 → 마스킹 이메일 표시.
- [ ] **소셜 로그인 3종**(구글·카카오·네이버) 각각 로그인 → 온보딩에 **이름·전화 프리필** 확인.
- [ ] **요양보호사 새 기관 생성** / **기존 기관 합류(어르신 코드 → 승인 대기 → 승인)**.
- [ ] **보호자 어르신 코드 연결 → 요양보호사 승인 → 공개 항목만 열람**.
- [ ] **RLS 격리**: 타 기관·미승인·보호자 권한 경계 확인(로컬 회귀와 동일 시나리오).
- [ ] Realtime(세션·분석·공개) 실시간 반영, 요양일지 사진 업로드/접근 제한.
- [ ] 처리방침·약관·동의 항목이 실제 수집 정보(전화·생일 등)와 일치.

---

## 완료 기준 (Go-Live)
- [ ] §1~§8 전 항목 적용, §9 검증 전부 통과.
- [ ] 데이터 **서울 리전** 보관 확인, 백업/PITR 활성.
- [ ] 소셜 3종 + 이메일 로그인/찾기 정상, 본인인증 전화·이름 프리필 동작.
- [ ] 실 AI 연동은 별도 마일스톤(§7) — 미연동 시 mock 동작(사람 확인 게이트).

> 이 체크리스트의 항목은 **코드가 아니라 외부 콘솔/배포 설정**이다. 코드·스키마·RLS·프론트는
> 로컬 게이트(typecheck·lint·test·check:copy·build)와 PG16 RLS 회귀·라우트 스모크로 검증 완료.
