# structure.md

> ## ⚠️ 2026-09-23 기획 변경 — 이 문서보다 새 계획이 우선한다
>
> 제품 정의가 **"요양보호사 업무 보조 도구"** 에서
> **"인지활동 프로그램을 AI가 진행하고, 그 결과가 공단 형식 프로그램 일지 초안으로 자동으로
> 남는 도구"** 로 바뀌었다. 요양보호사는 계획하고 감독하며 확인한다.
>
> **"무엇을 만들지"의 SoT = [`docs/plans/pilot-development-plan.md`](../docs/plans/pilot-development-plan.md)**.
> 이 문서에서 **요양일지·per-caregiver 격리·규칙 기반 대화·직접 Gemini Live** 를 전제한 서술은
> 낡았다. 새 계획과 충돌하면 새 계획을 따른다.
>
> **이 문서 안에서는 §0(현재·파일럿 구조)이 새 기준이다.** §1~§12 는 MVP 당시 구조로 남겨 두었다.

> 🏢 **엔터프라이즈·정부심사 트랙(2026-07-03)**: 멀티테넌시 — `organizations` + `users.org_id` + 역할(RBAC: org_admin/caregiver/(guardian)), 전 테이블 조직 단위 격리. 상세: PLAN §2′ M14 · `docs/security.md`.

## 0. 현재·파일럿 구조 (2026-09-23 기획 변경 — 이 절이 §1~§12 보다 우선한다)

> §1~§12 는 2026-06 MVP 당시 구조다(`session-respond` Edge Function·`session/active.tsx`·RLS `auth.uid()` 등은
> 실제 코드와 이미 다르다). 무엇을 만들지는 [`pilot-development-plan.md`](plans/pilot-development-plan.md),
> 화면은 [`design.md`](design.md) §0, 요구는 [`requirements.md`](requirements.md) §0.

### 0-1. 전체 구조

```
┌───────────────────────────────┬──────────────────────────────────────┐
│ 웹 (apps/web · React + Vite)   │ 모바일 앱 (apps/mobile · Expo SDK 54) │
│ · 요양보호사 웹: 연대기·세션 설계 │ · 요양보호사 모드: 어르신 선택 →       │
│   ·프로그램 일지·감독 화면(반응형) │   설계 확인 → 시작                    │
│   ·공개 관리·기관 설정·권한       │ · 어르신 표시 모드: 사진·자막·         │
│ · 보호자 웹: 오늘의 이야기·      │   "말하는 중" (조작 요소 0)           │
│   대화 관찰 리포트              │                                      │
└──────────────┬────────────────┴─────────────┬────────────────────────┘
               │ 공유: packages/core · data · theme │ 음성(WSS)
               ▼                                   ▼
┌────────────────────────────────┐   ┌────────────────────────────────────┐
│ Supabase (서울)                 │   │ apps/voice-relay (Node + ws, Docker)│
│ PostgreSQL · RLS(기관 + 역할)    │◀──│ session_tick RPC(2초) — 권한·단계·   │
│ Auth · Storage · Realtime       │   │   원격 제어 · 위기 이벤트 즉시 기록   │
│ Edge Functions: live-token ·    │   │ Gemini Live(gemini-3.8-live)        │
│   session-report · naver-auth · │   │   → 출력 검증(screenAiUtterance)    │
│   [신규] 일지 초안 워커 ·         │   │   → Clova TTS → 앱                  │
│   [신규] 푸시 발송 워커           │   │ (Gemini 오디오 원본은 전달 안 함)    │
└──────────────┬─────────────────┘   └────────────────────────────────────┘
               │ Expo Push (FCM/APNs 자격증명은 EAS 가 관리)
               ▼
        요양보호사 휴대폰 — 위기 발화·세션 이상 종료 알림
```

⚠️ 음성 경로는 **중계 하나뿐**이다. 앱이 Gemini Live 에 직접 붙는 경로(직접 모드)는 폐기한다(파일럿 계획 M1·G).

### 0-2. 사용자 유형과 역할

| 사용자 | `org_role` | 접근 환경 | 인증 |
|---|---|---|---|
| 요양보호사 | `caregiver` | 모바일 앱(요양보호사 모드) + 요양보호사 웹 | 이메일·소셜 로그인 |
| 사회복지사 (신규) | `social_worker` | 요양보호사 웹 | 〃 |
| 센터장 (신규) | `center_director` | 요양보호사 웹 | 〃 |
| 기관 관리자 | `org_admin` | 요양보호사 웹 | 〃 (기관을 만든 계정) |
| 보호자 | `guardian` | 보호자 웹 | 〃 + 어르신 코드 연결·승인 |
| 어르신 | — | 모바일 앱(어르신 표시 모드) | 없음 — 기기에 로그인된 요양보호사 세션으로 인가 |

역할은 `set_member_role` RPC 로만 바뀐다(`users.role` 직접 쓰기는 3중 차단 — `20260908000000`).

### 0-3. 권한 구조 (파일럿 목표)

```
[기관(tenant) 단위 격리] — 다른 기관 데이터는 0건
  │
  ├── 돌봄팀 = caregiver · social_worker · center_director · org_admin   (app.is_care_team())
  │     ├── 같은 기관 어르신의 연대기·세션·분석·일지 열람·기록 — 담당 여부와 무관(교대근무)
  │     ├── 삭제는 배정·관리자 기준 유지
  │     └── 위임 권한 3종 (org_capabilities · app.has_capability())
  │           ├── 프로그램 일지 확정
  │           ├── 공개 / 철회
  │           └── 보호자 연결 승인
  │         기본 허용 = social_worker · center_director · org_admin → 기관 설정으로 caregiver 에 위임
  │
  ├── 고정 권한 (위임 불가) — org_admin · center_director
  │     ├── 권한 매트릭스 편집
  │     ├── 구성원 역할 지정 (자기 자신 불가 · 보호자↔돌봄팀 전환 불가)
  │     └── 직원 초대 코드 발급·회수 · 합류 승인 (자기 요청 불가)
  │           합류 승인 전 = users.org_id NULL = 데이터 0건
  │
  ├── 설정으로 끌 수 없는 것 — 위기 대응 · 출력 검열 · 진단 표현 금지 · Clova 경유
  │
  └── 보호자 (guardian) — 지금과 같다
        └── 연결 승인된 어르신의 **공개된 항목**만 (guardian_shares 경유)

[서버 워커 (service_role)]
  └── 일지 초안은 확인 대기까지만 쓴다 — 확정은 DB 트리거가 물리적으로 막는다(auth.uid() is null)
```

현재(전환 전)는 기관 + **담당 배정** 격리다(`app.is_assigned_caregiver` — `20260722100000`). 전환 후에도 그 함수는
"내 담당" 필터·알림 대상 용도로 남는다.

### 0-4. 모듈 변경 지도

| 위치 | 삭제 | 신규·확장 | 유지(절대) |
|---|---|---|---|
| `packages/core/src` | `ai.ts`·`ai.test.ts`(규칙 기반 대화) · `voice-flow.ts`(호출처 0) · `journal.ts` 의 `buildJournalDraft`(목업) · `prompt.ts` 의 `RESPONSE_JSON_SCHEMA` | `session-phase.ts` · `program-journal.ts` · `generated-session.ts` 확장(공단 필드·보호자 문장·금지어) · `conversation.ts` `respondToUserTurn` → `evaluateUserTurn` 축소 · `prompt.ts` 단계 지시·`PROMPT_VERSION` 저장 | `safety.ts` 전체 · `analysis.ts` 의 `detectTurnTopic`·`recommendNextTopics` |
| `packages/data/src/hooks` | `journals.ts`·`journalPhotos.ts`(→ 프로그램 일지 훅) · `analyses.ts` 의 `useUpsertSessionAnalysis`(dead code) | `programJournals.ts` · `supervision.ts` · `orgSettings.ts`(`useHasCapability` = UI 활성화의 단일 근거) · `pushTokens.ts` · `events.ts` · `realtime.ts` 등록 3곳 | 나머지 |
| `apps/mobile` | 직접 모드 분기(`RELAY_MODE`)와 직접 UI | `app/session/elder.tsx`(어르신 표시 모드) · `src/features/session/`(공용 로직 추출) · 복귀 게이트 · 원격 제어 수신 · 푸시 토큰 등록 | `SESSION_BUSY`(기기 1대 = 세션 1개) |
| `apps/web/src/pages` | `caregiver/Journal{List,Write,}Page.tsx`(요양일지) | `ProgramJournal{List,Detail}Page` · `SupervisionPage`(반응형) · 동의 부여·철회 라우트 · `OrgPage` 권한 매트릭스·역할 지정 · 보호자 페이지 표현 전환 | — |
| `apps/voice-relay/src` | — | `relay.ts` 2초 폴 → `session_tick` · 단계 지시 주입 · 원격 제어 · 위기 이벤트 즉시 기록 | 타이머·턴 상한·수명·재생 영수증 게이팅 |
| `supabase/functions` | — | 일지 초안 워커 · 푸시 발송 워커 · `session-report` 생성 로직 `_shared/` 추출 · 데모 허용목록 → 기관 게이트 · ⚠️ **`live-token` 중계 전용화**(지금은 JWT 만으로 토큰이 나가 중계를 건너뛸 수 있다) | `live-token` 의 DB 판정(`reserve_live_token`)·한도 |

⚠️ `packages/core` 삭제와 앱의 직접 모드 제거는 **반드시 같은 PR** 이다 — core 만 먼저 머지하면 앱이 깨진다.

---

## 1. 전체 서비스 구조 개요

```
┌──────────────────────────┬──────────────────────────┐
│   관리자 웹 (apps/web)     │   모바일 앱 (apps/mobile)  │
│   React + Vite           │   Expo / React Native    │
│   · 요양보호사 로그인       │   · 어르신 대화 화면        │
│   · 연대기 입력/수정        │   · 음성 입출력            │
│   · 세션 이력·로그 조회      │                          │
└────────────┬─────────────┴────────────┬─────────────┘
             │   공유: packages/core·data·theme        │
             │   (도메인 로직 · supabase-js · 토큰)      │
             ▼                          ▼
┌──────────────────────────────────────────────────────┐
│                      Supabase                         │
│  PostgreSQL(RLS) · Auth · Storage · Edge Functions    │
└────────────┬─────────────────────────────────────────┘
             │  Edge Functions (AI 파이프라인, 키 보호)
             ▼
┌───────────────┬───────────────┬──────────────────────┐
│ Gemini Live(직접 음성·대화) → 서버 검증 → Clova TTS(변경 목표) │
└───────────────┴───────────────┴──────────────────────┘
```

---

## 2. 사용자 유형 정의

> ⚠️ MVP 당시 표. 현재 역할(사회복지사·센터장·기관 관리자·보호자 포함)은 §0-2.

| 사용자 유형 | 설명 | 접근 환경 | 인증 여부 |
|---|---|---|---|
| **요양보호사** | 연대기 입력, 세션 시작·종료, 로그 확인 | 관리자 웹 + 모바일(세션 시작·전달) | 필요 (이메일+비밀번호) |
| **어르신** | AI와 음성 대화 진행 | 모바일 앱 (대화 화면) | 불필요 (기기에 저장된 요양보호사 세션으로 인가) |
| **관리자** | 계정 관리, 전체 현황 확인 (향후) | 관리자 웹 | 필요 (별도 권한) |

---

## 3. 권한 구조

> ⚠️ MVP 당시 트리. 파일럿 권한(기관 단위 + 역할 + 위임 3종)은 §0-3.

```
[모바일 기기 = 요양보호사 세션 보유]
  └── 어르신 대화 화면 (어르신 무로그인, 기기에 저장된 요양보호사 세션으로 인가)

[요양보호사 로그인]
  ├── 어르신 프로필 목록 조회·생성·수정
  ├── 세션 시작·종료
  ├── 세션 로그 조회 (담당 어르신만)
  └── 본인 계정 정보 관리

[관리자 - 향후]
  ├── 전체 요양보호사 계정 관리
  ├── 전체 어르신 프로필 조회
  └── 기관 단위 통계 조회
```

---

## 4. 화면 목록

> ⚠️ MVP 당시 목록. 현재 웹 라우트는 `apps/web/src/App.tsx`, 파일럿 화면 변경분은 [`design.md`](design.md) §0-1.

### 모바일 앱 (apps/mobile — 어르신)

| 화면명 | 접근 주체 | 주요 기능 |
|---|---|---|
| 어르신 홈/선택 | 어르신 | 세션 진입 (요양보호사가 시작) |
| 어르신 대화 화면 | 어르신 | AI 음성 출력 + 마이크 입력 |

### 관리자 웹 (apps/web — 요양보호사)

| 화면명 | 경로 | 주요 기능 |
|---|---|---|
| 로그인 | `/login` | 이메일+비밀번호 로그인 |
| 대시보드 | `/` | 담당 어르신 현황 요약 |
| 어르신 목록 | `/profiles` | 등록 어르신 목록, 세션 시작 |
| 연대기 입력 | `/profiles/new` | 신규 어르신 프로필 등록 |
| 연대기 수정 | `/profiles/:id/edit` | 기존 연대기 수정 |
| 세션 이력 | `/profiles/:id/logs` | 어르신별 세션 이력 |
| 세션 로그 상세 | `/sessions/:id` | 대화 전문·턴 수·발화 시간 |

---

## 5. 사용자 흐름 (요양보호사)

**① 최초 등록 흐름**
1. 앱 실행 → 로그인 화면
2. 이메일 + 비밀번호 입력 → 로그인
3. 어르신 목록 화면 진입
4. `+ 새 어르신` 버튼 탭
5. 연대기 입력 폼 작성 (이름·출생연도·출신지·직업·가족·주요 기억·취미)
6. 저장 → 어르신 목록에 추가 확인

**② 세션 진행 흐름**
1. 어르신 목록에서 대상 어르신 선택
2. `세션 시작` 버튼 탭
3. 어르신 대화 화면으로 전환 (어르신에게 기기 전달)
4. AI가 자동으로 첫 질문 음성 출력
5. 요양보호사는 다른 어르신 케어 (백그라운드 진행)
6. 세션 종료 시 `종료` 버튼 탭 → 세션 로그 자동 저장

**③ 로그 확인 흐름**
1. 어르신 목록 → 어르신 선택 → `세션 이력` 탭
2. 날짜별 세션 목록 조회
3. 세션 선택 → 대화 전문·턴 수 확인
4. 연대기 보완 필요 시 `수정` 버튼으로 프로필 업데이트

---

## 6. 어르신 대화 흐름

> ⚠️ MVP 직접 모드 흐름. 파일럿은 중계 단일 + 단계형(도입 → 회상 → 마무리·의견수렴) — [`design.md`](design.md) §0-3.

1. 요양보호사가 모바일(로그인된 기기)에서 어르신 선택·세션 시작 → "기기 전달" 안내 → 어르신 대화 화면
2. AI 첫 질문 TTS 자동 재생 (버튼 조작 불필요)
3. 재생 완료 → 마이크 자동 활성화
4. 어르신 발화 → STT 변환 → 화면에 텍스트 표시
5. 텍스트 → LLM → 다음 질문 생성
6. 다음 질문 TTS 재생 → 반복
7. 침묵 10초 이상 감지 → 힌트 제공 또는 주제 전환
8. 세션 종료 → `세션을 마쳤어요` 안내 음성 재생

---

## 7. 주요 데이터 엔티티

### users (요양보호사 계정)
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | PK (auth.users.id와 1:1) |
| `email` | STRING | 로그인 이메일 |
| `name` | STRING | 요양보호사 이름 |
| `created_at` | TIMESTAMP | 가입일 |

### profiles (어르신 연대기)
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users |
| `name` | STRING | 어르신 이름 |
| `birth_year` | INTEGER | 출생연도 |
| `hometown` | STRING | 출신지 |
| `job` | STRING | 직업 이력 |
| `family` | TEXT | 가족 구성 |
| `memories` | TEXT | 주요 기억 (3~5개) |
| `hobbies` | STRING | 취미 |
| `created_at` | TIMESTAMP | 등록일 |
| `updated_at` | TIMESTAMP | 최종 수정일 |

### sessions (세션 메타)
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | PK |
| `profile_id` | UUID | FK → profiles |
| `user_id` | UUID | FK → users |
| `started_at` | TIMESTAMP | 세션 시작 시각 |
| `ended_at` | TIMESTAMP | 세션 종료 시각 |
| `turn_count` | INTEGER | 총 대화 턴 수 |
| `status` | ENUM | `active` / `ended` |

### session_logs (세션 대화 전문)
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | PK |
| `session_id` | UUID | FK → sessions |
| `profile_id` | UUID | FK → profiles (RLS 격리용) |
| `user_id` | UUID | FK → users (RLS 격리용) |
| `role` | ENUM | `ai` / `user` |
| `content` | TEXT | 발화 텍스트 |
| `topic` | STRING | 주제 (ai 발화에만 기록) |
| `audio_url` | TEXT | TTS 결과 오디오 URL (ai 발화) |
| `audio_expires_at` | TIMESTAMP | 오디오 만료 시각 (24h) |
| `spoken_at` | TIMESTAMP | 발화 시각 |
| `duration_ms` | INTEGER | 발화 소요 시간 (STT 측정) |

---

## 8. 엔티티 간 관계 요약

```
users (요양보호사)
  │
  ├── 1:N → profiles (담당 어르신 연대기)
  │             │
  │             └── 1:N → sessions (세션 이력)
  │                           │
  │                           └── 1:N → session_logs (대화 전문)
  │
  └── 1:N → sessions (세션 시작 주체)
```

---

## 9. 프로젝트 폴더 구조

> ⚠️ MVP 당시 트리(`session/active.tsx`·`repositories/` 등은 실제와 다르다). 현재 워크스페이스는 7개 — `apps/{web,mobile,voice-relay}` · `packages/{core,data,theme}` · `supabase`. 파일럿 변경은 §0-4.

기억온은 pnpm 모노레포로 구성한다. 웹·모바일은 UI를 공유하지 않고, 도메인 로직·데이터·디자인 토큰만 `packages/*`로 공유한다.

```
giokon/
├── apps/
│   ├── web/                       # 요양보호사 관리 웹 (React + Vite)
│   │   └── src/
│   │       ├── pages/             # Dashboard, Elders, ElderDetail, Logs, LogDetail ...
│   │       ├── components/        # Layout, ChronicleView, *FormDialog, ui/ ...
│   │       └── App.tsx            # 라우터 + 인증 가드
│   └── mobile/                    # 어르신 대화 앱 (Expo / React Native)
│       └── app/
│           ├── index.tsx          # 어르신 홈/선택
│           └── session/active.tsx # 어르신 대화 화면 (TTS·STT)
├── packages/
│   ├── core/                      # 도메인 타입 · Zustand 스토어 · AIProvider(+목업) · 도메인 규칙
│   │   ├── types.ts
│   │   ├── store/
│   │   └── ai/                    # generateOpener/generateReply/extractChronicle ...
│   ├── data/                      # supabase-js + TanStack Query 훅 · Supabase Auth
│   │   ├── client.ts
│   │   └── repositories/          # profiles / chronicles / sessions / logs
│   └── theme/                     # 디자인 토큰 (웹 Tailwind + 모바일 NativeWind 공용)
├── supabase/
│   ├── migrations/                # 스키마 · RLS(auth.uid()) · 인덱스 · 트리거
│   └── functions/                 # Edge Functions (session-respond 등 AI 파이프라인)
└── docs/
```

---

## 10. 주요 컴포넌트·모듈 구조

> ⚠️ `session-respond` 는 지금 저장소에 없다. 음성은 `apps/voice-relay`, 모듈 변경은 §0-4.

### AI 파이프라인 모듈 (Edge Function)

```
session-respond  (supabase/functions)
  ├── [STT]   초기 Live 직접 음성 입력·대화 / 장기 Whisper 특화 평가
  ├── [LLM]   텍스트 + 연대기 → 다음 질문 JSON (현행 프런티어 · Structured Outputs)
  └── [TTS]   검증된 다음 질문 → Clova Voice → 앱 재생 (영구 저장·재사용 미확정)
        ↓
  session_logs 기록 + 클라이언트로 { question, audioUrl, switchTopic } 반환
```

### 어르신 대화 화면 (apps/mobile)

```
session/active.tsx
  ├── core 스토어             세션 ID, 대화 이력 상태 (packages/core)
  ├── SpeechProvider(모바일)  audio_url 자동 재생 + 마이크 녹음(Expo AV)
  ├── ChatBubble              발화 텍스트 표시
  └── MicButton               마이크 활성화 버튼 (대형, 60px+)
```

---

## 11. 클라이언트–데이터 연결 포인트

> ⚠️ `session-start`·`session-respond`·`session-end` Edge Function 은 MVP 설계이며 지금 저장소에 없다. 현재 Edge Functions 는 `live-token`·`session-report`·`naver-auth`·`stt-transcribe`.

CRUD는 supabase-js로 직접, 세션 AI 단계는 Edge Function으로 처리한다.

| 기능 | 방식 | 대상 | 응답 |
|---|---|---|---|
| 연대기 저장/조회 | supabase-js | `profiles` 테이블 (RLS) | 행 데이터 |
| 연대기 항목 | supabase-js | `chronicle_entries` 테이블 (RLS) | 행 데이터 |
| 세션 시작 | Edge Function | `session-start` | `{ session_id, question, audioUrl }` |
| 어르신 응답 처리 | Edge Function | `session-respond` | `{ question, audioUrl, switchTopic }` |
| 세션 종료 | Edge Function | `session-end` | `{ turn_count, duration }` |
| 세션 이력/로그 조회 | supabase-js | `sessions` / `session_logs` (RLS) | 행 배열 |

**인증:** supabase-js가 Supabase JWT를 자동 첨부한다. Edge Function은 호출자의 JWT를 검증한다.

---

## 12. 향후 구조 확장 방향

> ⚠️ 당시 로드맵. 보호자 연동·세션 자동 요약·기관 어드민은 이미 구현됐거나 파일럿에서 재정의됐고, "음성 전환"은 중계 단일로 확정됐다(§0-1).

| 항목 | 현재 구조 | 확장 시 |
|---|---|---|
| 보호자 연동 | 미구현 (v2) | `guardians` 테이블 추가, 세션 종료 시 푸시 알림 발송 |
| 세션 자동 요약 | 미구현 | `session-respond/end` Edge Function에 LLM 요약 추가 → `sessions.summary` 컬럼 저장 |
| 인지자극 모듈 | 미구현 (v2) | `session_type` ENUM 컬럼 추가 (`reminiscence` / `cognitive`), 프롬프트 분기 |
| 연대기 자동 축적 | 요양보호사 직접 입력 | 세션 로그 분석 → `profiles` 자동 업데이트 배치 |
| 기관 어드민 | 미구현 | `organizations` 테이블 추가, `users.org_id` FK 연결 |
| 음성 전환 | 초기 Gemini Live 직접 입력·대화 | 장기 Whisper·Qwen3.5-9B를 독립 평가 후 전환 |
| 모니터링 | 없음 | Sentry(에러) + Edge Function 로깅 추가 |
