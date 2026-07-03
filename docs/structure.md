# structure.md

> 🏢 **엔터프라이즈·정부심사 트랙(2026-07-03)**: 멀티테넌시 — `organizations` + `users.org_id` + 역할(RBAC: org_admin/caregiver/(guardian)), 전 테이블 조직 단위 격리. 상세: PLAN §2′ M14 · `docs/security.md`.

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
│ gpt-4o-transcribe(STT) │ LLM(현행 프런티어) │ Clova Voice(TTS) │
└───────────────┴───────────────┴──────────────────────┘
```

---

## 2. 사용자 유형 정의

| 사용자 유형 | 설명 | 접근 환경 | 인증 여부 |
|---|---|---|---|
| **요양보호사** | 연대기 입력, 세션 시작·종료, 로그 확인 | 관리자 웹 + 모바일(세션 시작·전달) | 필요 (이메일+비밀번호) |
| **어르신** | AI와 음성 대화 진행 | 모바일 앱 (대화 화면) | 불필요 (기기에 저장된 요양보호사 세션으로 인가) |
| **관리자** | 계정 관리, 전체 현황 확인 (향후) | 관리자 웹 | 필요 (별도 권한) |

---

## 3. 권한 구조

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

### AI 파이프라인 모듈 (Edge Function)

```
session-respond  (supabase/functions)
  ├── [STT]   어르신 발화 오디오 → 텍스트 (gpt-4o-transcribe / Clova Speech)
  ├── [LLM]   텍스트 + 연대기 → 다음 질문 JSON (현행 프런티어 · Structured Outputs)
  └── [TTS]   다음 질문 텍스트 → 오디오 URL (Clova Voice → Supabase Storage)
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

| 항목 | 현재 구조 | 확장 시 |
|---|---|---|
| 보호자 연동 | 미구현 (v2) | `guardians` 테이블 추가, 세션 종료 시 푸시 알림 발송 |
| 세션 자동 요약 | 미구현 | `session-respond/end` Edge Function에 LLM 요약 추가 → `sessions.summary` 컬럼 저장 |
| 인지자극 모듈 | 미구현 (v2) | `session_type` ENUM 컬럼 추가 (`reminiscence` / `cognitive`), 프롬프트 분기 |
| 연대기 자동 축적 | 요양보호사 직접 입력 | 세션 로그 분석 → `profiles` 자동 업데이트 배치 |
| 기관 어드민 | 미구현 | `organizations` 테이블 추가, `users.org_id` FK 연결 |
| 다중 STT | gpt-4o-transcribe 단일 | Edge Function 내 gpt-4o-transcribe / Clova Speech 교체 가능 구조 |
| 모니터링 | 없음 | Sentry(에러) + Edge Function 로깅 추가 |
