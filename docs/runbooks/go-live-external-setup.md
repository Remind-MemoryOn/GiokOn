# 런북 — 웹 1차 MVP 외부 연동·오픈 체크리스트 (외부 진행 대기 사항)

> ## ⚠️ 2026-09-23 기획 변경 — 이 문서보다 새 계획이 우선한다
>
> 제품 정의가 **"요양보호사 업무 보조 도구"** 에서
> **"인지활동 프로그램을 AI가 진행하고, 그 결과가 공단 형식 프로그램 일지 초안으로 자동으로
> 남는 도구"** 로 바뀌었다. 요양보호사는 계획하고 감독하며 확인한다.
>
> **"무엇을 만들지"의 SoT = [`docs/plans/pilot-development-plan.md`](../../docs/plans/pilot-development-plan.md)**.
> 이 문서에서 **요양일지·per-caregiver 격리·규칙 기반 대화·직접 Gemini Live** 를 전제한 서술은
> 낡았다. 새 계획과 충돌하면 새 계획을 따른다.
>
> **파일럿 외부 설정은 이 문서 §10 이 새 기준이다.** 요양일지·목업 전환·어르신 코드 합류를 전제한 항목에는 폐기 표시를 했다.

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

### 1-1. 마이그레이션 (총 **42개** · 파일명 순서 = 적용 순서)
> 실 Supabase에는 `auth.users`·`auth.uid()`·`authenticated`·`anon` 롤이 이미 존재하므로
> **로컬 테스트 심(`supabase/tests/_supabase_shims.sql`)은 적용하지 않는다.**

```bash
supabase link --project-ref ufkbzpdjomtmxjipmwub   # 운영 = 서울 MemoryOn
supabase db push          # supabase/migrations/ 전체를 파일명 순서대로 적용
```

- [ ] `supabase migration list` 로 로컬·원격이 같은지 확인한다.
- [ ] ⚠️ **MCP `apply_migration` 으로 적용했다면** 이력이 *적용 시각*으로 남는다 →
      `supabase_migrations.schema_migrations` 의 version 을 **저장소 파일명**으로 맞춰 준다.
      맞춰 두지 않으면 다음 `db push` 가 같은 파일을 다시 적용하려 한다.
- [ ] 개별 파일 목록은 저장소가 유일한 출처다(`ls supabase/migrations`). 여기에 표로
      옮겨 적지 않는다 — 마이그레이션이 늘 때마다 이 문서가 먼저 낡는다.

**대시보드 SQL Editor 로 붙일 때**는 `ls supabase/migrations` 순서 그대로 하나씩 끝까지
실행한다. Storage 버킷·정책을 만드는 파일이 섞여 있어 §6 과 연계된다.

#### 2026-09-06 웹 배포 준비로 추가된 것 (아직 라이브 미적용일 수 있음)
| 파일 | 없으면 생기는 일 |
|---|---|
| `20260906000000_guardian_shared_session_read` | 보호자 "대화 분석" 이 **항상 빈 화면** |
| `20260906010000_guardian_share_item_owner` | 다른 어르신 기록을 공개할 수 있다 |
| `20260906020000_care_journal_activity_time` | 일지 활동 시간 저장이 **실패** |
| `20260906030000_inquiries_pagination` | 문의 목록이 전량을 내려보낸다 |
| `20260906040000_security_advisor_hardening` | 트리거 함수가 RPC 로 열려 있다 |
| `20260906050000_realtime_and_storage_limits` | 승인·코드 회전이 실시간 반영 안 됨 · 업로드 무제한 |

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
- [ ] ~~**`stt-transcribe`(요양일지 음성 파일 인식)**~~ — ⚠️ 2026-09-23 **보류**(요양일지 음성 입력 폐기, 재검토 대상). 아래는 당시 절차: 이미 스캐폴드 있음
      (`supabase/functions/stt-transcribe/index.ts`, CLOVA CSR). CLOVA 키 등록 후 배포:
      ```bash
      supabase secrets set NCP_CLOVA_CLIENT_ID=... NCP_CLOVA_CLIENT_SECRET=...
      supabase functions deploy stt-transcribe
      ```
      배포 전에는 요양일지 "음성 파일 올리기"가 안내 메시지를 띄운다(브라우저 실시간 음성 입력은 무관하게 동작).

---

## 6. Storage 버킷 (요양일지 사진)

> ⚠️ 2026-09-23: 요양일지는 데이터째 삭제되고 프로그램 일지 사진(`program_journal_photos`)으로 바뀐다. 버킷 재사용 여부는 파일럿 계획 D5 에서 정한다. 기존 객체는 **Storage API 로** 지운다(SQL 로 `storage.objects` 행만 지우면 파일이 남는다).
- [ ] **Storage → Buckets → `journal-photos` (Private)** 생성. (마이그레이션 13이 정책을 깐다 —
      버킷 존재 필요.)
- [ ] 접근은 RLS/정책으로 제한(보호자 직접 접근 불가). 보관·파기 주기 확인.

---

## 7. Edge Function 배포 + 시크릿

키는 **서버에만** 둔다. 클라이언트 번들에 provider 키를 넣지 않는다.

### 7-1. `live-token` — 앱 음성 대화(Gemini Live)
- [ ] `supabase secrets set GEMINI_API_KEY=...`
- [ ] ⚠️ `supabase secrets set GEMINI_LIVE_MODEL=gemini-3.8-live` — **2026-09-23 확정 모델.** `.env`·`.env.example` 은 런타임에 읽히지 않는다. 안 하면 폴백 상수(3.1)로 조용히 돈다
- [ ] ⚠️ 파일럿: **중계 전용 자격**을 요구하도록 바꾼 뒤 배포한다(파일럿 계획 C4 — 지금은 JWT 만 있으면 누구나 토큰을 받는다)
- [ ] `supabase functions deploy live-token`  (JWT 검증 **켠 채** — 로그인한 앱만 부른다)
- [ ] ⚠️ 어르신 음성을 다루므로 **Gemini 유료 tier + DPA** 가 필요하다. 무료 tier 는
      약관상 학습에 쓰일 수 있어 쓸 수 없다.

### 7-2. `naver-auth` — 네이버 로그인 (웹 GET 경로가 2026-09-06 에 추가됨 → **재배포 필요**)
- [ ] `supabase secrets set NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=...`
- [ ] `supabase secrets set WEB_ORIGINS="https://<웹도메인>"` (쉼표로 여러 개)
      · 비어 있으면 `/authorize` 가 **400 으로 거절**한다(오픈 리다이렉트 차단).
- [ ] `supabase functions deploy naver-auth --no-verify-jwt`
      · ⚠️ 이 함수만 `--no-verify-jwt` 다 — **로그인 전** 호출이 정상 흐름이다.
- [ ] 네이버 개발자센터 **Callback URL** =
      `https://<project-ref>.supabase.co/functions/v1/naver-auth/callback`

### 7-3. `stt-transcribe` — 요양일지 음성 인식 (NCP CLOVA CSR)

> ⚠️ 2026-09-23 **보류** — 요양일지 음성 입력이 폐기됐다. 재검토 전까지 배포하지 않아도 파일럿에 지장 없다.
- [ ] `supabase secrets set NCP_CLOVA_CLIENT_ID=... NCP_CLOVA_CLIENT_SECRET=...`
      (헤더 `X-NCP-APIGW-API-KEY-ID`/`X-NCP-APIGW-API-KEY`)
- [ ] `supabase functions deploy stt-transcribe`
      · ⚠️ **`--no-verify-jwt` 를 쓰지 않는다.** 붙이면 누구나 쓰는 전사 API 가 되고
        호출마다 비용이 나간다.
- [ ] 미배포 상태에서도 웹은 깨지지 않는다 — "아직 서버에 배포되지 않았어요" 라고
      분명히 안내하고 원문을 직접 적게 한다(조용한 실패 없음).
- [ ] CSR 는 1분 이내 짧은 음성용이다. 장문이 필요해지면 CLOVA Speech(장문)로 교체한다
      (인증 방식이 다르다 — `supabase/.env.example` 주석 참조).

### 7-4. 분석·프롬프트
- [ ] ⚠️ 2026-09-23 낡음: 아래 `buildJournalDraft`(명시적 목업)는 **삭제 대상**이고, 일지 초안은 `session-report` 생성 로직을 공유하는 **워커가 세션 종료 때 자동 생성**한다(파일럿 계획 C4). 당시 서술: 대화 분석·요양일지 초안은 현재 **`@giokon/core` 의 규칙 기반 순수 함수**다
      (`analyzeSession`·`buildJournalDraft`). 비용 0이고 결정론적이라 같은 입력이면 같은
      결과가 나온다. 실 LLM 으로 바꿀 때 **같은 시그니처의 Edge Function 호출**로 교체하면
      화면 코드는 그대로다.

---

## 8. 앱 재배선 & 배포
### 8-1. 웹 (Vercel)
- [ ] `apps/web/.env`(또는 Vercel 환경변수):
  ```env
  VITE_SUPABASE_URL="https://<서울-project-ref>.supabase.co"
  VITE_SUPABASE_PUBLISHABLE_KEY="<publishable-key>"
  ```
- [ ] Vercel 프로젝트 연결 → 배포. 커스텀 도메인 연결(§2 Redirect URL과 일치).
- [ ] 키를 넣으면 `isSupabaseConfigured=true` 가 되어 실데이터로 연결된다. ⚠️ "목업→실데이터 전환"은 낡은 서술이다 — 목업 스토어는 없다.

### 8-2. 모바일 (EAS, 선택)
- [ ] `apps/mobile/.env`(예시 `apps/mobile/.env.example`) 또는 EAS 환경변수에 **동일 URL·키**:
  ```env
  EXPO_PUBLIC_SUPABASE_URL="https://<서울-project-ref>.supabase.co"
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<publishable-key>"
  ```
  (웹의 `VITE_*` 와 같은 값, 접두사만 `EXPO_PUBLIC_*`. 값은 번들 시점에 인라인되므로 EAS
  빌드는 `eas.json` 의 env 또는 `eas secret:create` 로도 넣어야 한다 — 로컬 `.env` 는
  Metro dev 서버에서만 읽힘.)
- [ ] 키를 넣으면 앱이 `isSupabaseConfigured=true` 가 되어 실데이터로 연결된다(없으면 설정 오류 화면 — 목업 모드는 2026-09-04 제거). EAS 빌드/제출.
- [ ] ⚠️ 파일럿: **`EXPO_PUBLIC_VOICE_RELAY_URL=wss://호스트/voice`** 를 EAS 환경에 넣는다(직접 모드 폐기 후 필수). 인증값을 넣지 않는다.

---

## 9. 검증 체크리스트 (오픈 전)
로그인·인증 흐름을 실제로 한 번씩 통과시켜 본다.

- [ ] **이메일 회원가입** → 확인메일(켰다면) → 로그인 → 온보딩(역할·기관) → 대시보드.
- [ ] **이메일 로그인**(기존 계정).
- [ ] **비밀번호 찾기** → 메일 링크 → `/reset-password` → 변경 → 재로그인.
- [ ] **아이디(이메일) 찾기** → 이름+전화 → 마스킹 이메일 표시.
- [ ] **소셜 로그인 3종**(구글·카카오·네이버) 각각 로그인 → 온보딩에 **이름·전화 프리필** 확인.
- [ ] **요양보호사 새 기관 생성** / ~~**기존 기관 합류(어르신 코드 → 승인 대기 → 승인)**~~ — ⚠️ 이 합류 경로는 2026-07-25 온보딩에서 제거돼 **지금은 없다**. 파일럿은 기관 초대 코드 합류(파일럿 계획 W9).
- [ ] **보호자 어르신 코드 연결 → 요양보호사 승인 → 공개 항목만 열람**.
- [ ] **RLS 격리**: 타 기관·미승인·보호자 권한 경계 확인(로컬 회귀와 동일 시나리오).
- [ ] Realtime(세션·분석·공개) 실시간 반영, ~~요양일지 사진 업로드/접근 제한~~(→ 프로그램 일지 사진).
- [ ] 처리방침·약관·동의 항목이 실제 수집 정보(전화·생일 등)와 일치.

---

## 완료 기준 (Go-Live)
- [ ] §1~§8 전 항목 적용, §9 검증 전부 통과.
- [ ] 데이터 **서울 리전** 보관 확인, 백업/PITR 활성.
- [ ] 소셜 3종 + 이메일 로그인/찾기 정상, 본인인증 전화·이름 프리필 동작.
- [ ] 실 AI 연동은 별도 마일스톤(§7) — ~~미연동 시 mock 동작(사람 확인 게이트)~~ ⚠️ 목업 동작은 없다. 미연동이면 해당 기능이 명확한 오류로 멈춘다.

> 이 체크리스트의 항목은 **코드가 아니라 외부 콘솔/배포 설정**이다. 코드·스키마·RLS·프론트는
> 로컬 게이트(typecheck·lint·test·check:copy·build)와 PG16 RLS 회귀·라우트 스모크로 검증 완료.

---

## 10. 파일럿 외부 설정 (2026-09-23 기획 변경)

> 계획 SoT: [`pilot-development-plan.md`](../plans/pilot-development-plan.md). 파일럿은 **1기관 · 기기 2~4대 내부 배포**라
> 스토어 제출 항목은 선행 조건이 아니다. 코드로 끝낼 수 없는 것만 적는다.

**음성 중계 (없으면 세션이 시작되지 않는다 — 직접 모드 폐기 후)**
- [ ] `apps/voice-relay` 컨테이너 호스팅 결정 · TLS 인증서 · 공개 주소 `wss://호스트/voice` ([운영 런북](voice-relay-operations.md))
- [ ] 중계 환경변수: `SUPABASE_URL` · `SUPABASE_PUBLISHABLE_KEY` · `NCP_CLOVA_VOICE_CLIENT_ID/SECRET` · **중계 전용 자격**(C4 — 이름은 구현 때 확정)
- [ ] `live-token` 에 `GEMINI_LIVE_MODEL=gemini-3.8-live` · 중계 전용 자격 검사 배포 → **요양보호사 JWT 만으로 호출하면 403** 인지 확인
- [ ] EAS 환경 `EXPO_PUBLIC_VOICE_RELAY_URL` 등록 후 **개발/내부 빌드**(Expo Go 불가 — 마이크 모듈)

**푸시 (위기 발화 알림)**
- [ ] EAS 프로젝트에 FCM(Android)·APNs(iOS) 자격증명 등록 — `expo-notifications` 추가로 **재빌드 필요**
- [ ] 알림 본문에 어르신 성함·발화가 들어가지 않는지 실기기 잠금화면에서 확인

**워커 스케줄**
- [ ] 일지 초안 워커·푸시 발송 워커를 **30초 간격**으로 부르는 스케줄 설정(`pg_cron` 등)
- [ ] `session-report` 의 `REPORT_ALLOWED_USER_IDS` 시연 허용목록을 기관 게이트로 바꾼 코드 배포 — **안 하면 파일럿 전원 403**

**Supabase**
- [ ] 파일럿 마이그레이션(D1~D10) 적용 — ⚠️ enum 추가 파일(D1·D2)은 **각각 한 건씩** 적용(같은 트랜잭션 금지). 운영 적용은 사용자 승인 후 한 건씩
- [ ] `care_journals`·`journal_photos` DROP 직전 라이브 행 수 실측·기록(2026-09-07 기준 0건) + Storage 객체 정리

**계정·운영 (기획 결정 필요)**
- [ ] 파일럿 기관 계정: 기관 관리자 1 + 직원 초대 코드로 요양보호사·사회복지사 합류 → 역할 지정
- [ ] 기기·계정 운영 방식(요양보호사 1명이 기기 여러 대를 시작하면 `live-token` 사용자 한도 분당 3·일 20 에 닿는다)
- [ ] 파일럿 기기 종류 — iPad 면 `supportsTablet:false` 호환 모드 화면을 보고 결정
- [ ] 동의 문구 법률 검토(AI 대화·음성 처리 · 법정대리인 · **국외 이전**: Gemini·Expo Push · 녹음 미저장 고지)
- [ ] Gemini **유료 tier + DPA**(§7-1) — 어르신 음성·가족사에 무료 tier 불가
