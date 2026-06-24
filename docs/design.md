# design.md

## 1. 설계 개요

| 항목 | 내용 |
|---|---|
| 서비스명 | 기억온 (GiEok-On) |
| 설계 기준 | MVP Must 4개 + Should 6개 |
| 클라이언트 | React 관리자 웹(요양보호사) + React Native 모바일 앱(어르신) — 모노레포 |
| 서버 | Supabase (supabase-js 직접연동 + AI는 Edge Functions) |
| DB | Supabase PostgreSQL (RLS: `auth.uid()`) |
| AI 파이프라인 | gpt-4o-transcribe(STT) → LLM(현행 프런티어, Structured Outputs) → Clova Voice(TTS) — Edge Function |

**설계 원칙**
- 어르신 화면은 조작 최소화. 버튼 1개, 텍스트 18pt 이상
- AI 파이프라인은 스트리밍 우선. 체감 대기 3초 이하 목표
- 프로필·세션·로그의 source of truth는 Supabase. 클라이언트는 표시·입력 담당
- 오디오 원본은 STT 완료 즉시 삭제. 텍스트만 저장

---

## 2. 주요 화면 설계

### 화면 목록 전체

```
[모바일 앱]
  ├── SCR-01  로그인
  ├── SCR-02  어르신 목록
  ├── SCR-03  연대기 입력 (신규)
  ├── SCR-04  연대기 수정
  ├── SCR-05  세션 이력 목록
  ├── SCR-06  세션 로그 상세
  └── SCR-07  어르신 대화 화면 ← 핵심

[관리자 웹]
  ├── SCR-W01 로그인
  ├── SCR-W02 대시보드
  ├── SCR-W03 어르신 관리
  └── SCR-W04 세션 이력
```

---

### SCR-01 — 로그인

**목적:** 요양보호사 인증

**주요 요소:**
- 서비스 로고 + 이름 (기억온)
- 이메일 입력 필드
- 비밀번호 입력 필드 (마스킹)
- 로그인 버튼
- 회원가입 · 비밀번호 재설정 링크
- 오류 메시지 영역

**동작:**
1. 이메일·비밀번호 입력 → 로그인 버튼 탭
2. Supabase Auth 검증
3. 성공 → 세션(JWT) 저장 → SCR-02 이동
4. 실패 → "이메일 또는 비밀번호가 올바르지 않습니다" 표시

---

### SCR-02 — 어르신 목록

**목적:** 담당 어르신 현황 파악 및 세션 시작

**주요 요소:**
- 상단: 요양보호사 이름 + 로그아웃 버튼
- 어르신 카드 목록 (이름, 출생연도, 마지막 세션 날짜)
- 카드별 `세션 시작` 버튼
- 우측 하단: `+ 새 어르신` 플로팅 버튼

**동작:**
- 카드 탭 → SCR-05 (세션 이력)
- `세션 시작` 탭 → `session-start` Edge Function 호출 → SCR-07 이동
- `+ 새 어르신` 탭 → SCR-03 이동

---

### SCR-03 — 연대기 입력 (신규)

**목적:** 어르신 생애 정보 등록

**주요 요소:**

| 필드 | 입력 방식 | 필수 여부 |
|---|---|---|
| 이름 | 텍스트 | 필수 |
| 출생연도 | 숫자 (예: 1945) | 필수 |
| 출신지 | 텍스트 (예: 전북 전주) | 선택 |
| 직업 이력 | 텍스트 (예: 식당 운영, 30년) | 선택 |
| 가족 구성 | 텍스트 (예: 딸 둘, 사위 둘) | 선택 |
| 주요 기억 1~5 | 텍스트 + `+ 추가` 버튼 | 선택 |
| 취미 | 텍스트 | 선택 |

- 개인정보 수집 동의 체크(어르신/보호자 동의) — 저장 전 필수, 동의일 기록
- 하단: `저장` 버튼

**동작:**
1. 필수 항목 검증 → 미입력 시 해당 필드 빨간 테두리 + 안내 메시지
2. 저장 버튼 탭 → `profiles` insert (supabase-js)
3. 성공 → SCR-02 복귀 + 목록 갱신

---

### SCR-04 — 연대기 수정

**목적:** 기존 연대기 보완

**주요 요소:** SCR-03과 동일 구조. 저장된 데이터 자동 채워짐.

**동작:**
1. 화면 진입 시 `profiles` 조회 (supabase-js) → 기존 데이터 폼에 자동 입력
2. 수정 후 저장 → `profiles` update (supabase-js)
3. 성공 → SCR-02 복귀

---

### SCR-05 — 세션 이력 목록

**목적:** 어르신별 과거 세션 조회

**주요 요소:**
- 어르신 이름 + 연대기 수정 버튼 (상단)
- 세션 카드 목록 (날짜, 총 턴 수, 진행 시간)
- 날짜 내림차순 정렬

**동작:**
- 화면 진입 시 `sessions` 조회 (supabase-js)
- 세션 카드 탭 → SCR-06 이동

---

### SCR-06 — 세션 로그 상세

**목적:** 세션 대화 전문 확인

**주요 요소:**
- 세션 날짜·시간·턴 수 (상단 요약)
- 대화 말풍선 목록 (AI / 어르신 구분, 발화 시각 표시)
- 스크롤 가능

**동작:**
- 화면 진입 시 `session_logs` 조회 (supabase-js)
- AI 발화: 좌측 말풍선 (회색)
- 어르신 발화: 우측 말풍선 (파란색)

---

### SCR-07 — 어르신 대화 화면 ★ 핵심

**목적:** AI와 어르신의 1:1 음성 회상 대화

**주요 요소:**

```
┌────────────────────────────┐
│  [세션 종료]       기억온   │  ← 상단 바
├────────────────────────────┤
│                            │
│   AI: 전주에서 오래         │
│       사셨다고 하셨는데,    │  ← 최신 AI 질문 (18pt+)
│       거기서 제일           │
│       기억에 남는 게        │
│       뭐예요?               │
│                            │
│   어르신: 거기서 김치       │  ← 어르신 발화 텍스트
│           공장을 했지...   │
│                            │
│      🎙  말씀해 주세요      │  ← 마이크 버튼 (60px+)
│                            │
└────────────────────────────┘
```

**상태별 UI:**

| 상태 | 마이크 버튼 | 안내 텍스트 |
|---|---|---|
| AI 음성 재생 중 | 비활성 (회색) | "듣고 있어요..." |
| 마이크 활성 | 활성 (빨간 점) | "말씀해 주세요" |
| STT 처리 중 | 로딩 | "잠깐만요..." |
| 오류 | 재시도 아이콘 | "다시 말씀해 주세요" |

**동작:**
1. 화면 진입 → 서버에서 첫 질문 + 오디오 URL 수신
2. 오디오 자동 재생 (TTS)
3. 재생 완료 → 마이크 자동 활성화
4. 어르신 발화 → 오디오 파일 서버 전송
5. 서버: STT → LLM → TTS 순차 처리
6. 클라이언트: 다음 질문 텍스트 표시 + 오디오 재생

---

## 3. 화면별 핵심 UI 요소

| 화면 | 핵심 요소 | 특이사항 |
|---|---|---|
| SCR-01 | 이메일·비밀번호 폼 | 로딩 스피너 (로그인 중) |
| SCR-02 | 어르신 카드 + 세션 시작 버튼 | 빈 목록 시 "어르신을 추가해 주세요" |
| SCR-03 | 연대기 입력 폼 | 주요 기억 항목 동적 추가 (최대 5개) |
| SCR-07 | 마이크 버튼 (60px+) + 말풍선 | 텍스트 최소 18pt. 버튼 외 조작 최소화 |

---

## 4. 사용자 인터랙션 흐름

### 전체 Happy Path

```
[요양보호사]
로그인 (SCR-01)
    ↓
어르신 목록 (SCR-02)
    ↓  [+ 새 어르신]
연대기 입력 (SCR-03) → 저장 → 목록 복귀
    ↓  [세션 시작]
세션 초기화 → "어르신께 기기를 전달해 주세요" 핸드오프 안내
    ↓
[어르신] 대화 화면 진입 (SCR-07)
    ↓
AI 음성 자동 재생
    ↓
마이크 자동 활성화
    ↓
어르신 발화 → STT → LLM → TTS → 반복
    ↓  (3~5턴)
세션 자동 종료(턴 수 도달/침묵) — 요양보호사는 웹/복귀 시에도 종료 가능
    ↓
세션 로그 자동 저장
    ↓
세션 이력 목록 (SCR-05) 복귀
```

### STT 오인식 수정 흐름

```
어르신 발화 → STT 변환 → 텍스트 화면 표시
    ↓  [요양보호사 개입]
텍스트 탭 → 수정 모달 팝업
    ↓
수정 완료 → 수정된 텍스트로 LLM 재요청
    ↓
다음 질문 생성 → 정상 흐름 복귀
```

---

## 5. 주요 기능 동작 방식

### 5-1. AI 파이프라인 (핵심)

```
클라이언트
  session-respond Edge Function 호출 { session_id, audio: File }
        ↓
  [STT]
  audio → Supabase Storage 임시 업로드
         → STT(gpt-4o-transcribe) 호출 → transcript 텍스트 반환
         → Supabase Storage 오디오 즉시 삭제
        ↓
  [LLM]
  system_prompt = buildPrompt(profile, history)
  messages = [...history, { role: "user", content: transcript }]
  LLM streaming 호출 (현행 프런티어 · Structured Outputs)
  → JSON: { question, topic, switch_topic }
        ↓
  [TTS]
  question → Clova Voice API → 오디오 스트림 → Supabase Storage
        ↓
클라이언트
  응답: { question, audioUrl, topic, switch_topic, transcript }
```

### 5-2. LLM 프롬프트 구조

```
[system]
당신은 회상 대화 전문 AI입니다.
아래 어르신의 연대기를 바탕으로 자연스러운 회상 대화를 이끌어 주세요.

[어르신 정보]
이름: {name} / 출생: {birth_year}년 / 출신지: {hometown}
직업: {job} / 가족: {family}
주요 기억: {memories}
취미: {hobbies}

[대화 원칙]
- 어르신의 실제 연대기에 기반한 질문만 한다
- 동일한 주제를 3회 이상 연속 반복하지 않는다
- 어르신이 짧게 답하거나 침묵하면 더 쉬운 질문으로 전환한다
- 사별, 전쟁, 고통스러운 기억이 언급되면 즉시 긍정적 주제로 전환한다
- 반드시 아래 JSON 형식으로만 응답한다

[응답 형식]
{
  "question": "다음 질문 텍스트",
  "topic": "현재 주제 (고향 | 직업 | 가족 | 취미 | 기억)",
  "switch_topic": false
}

[대화 이력]
{conversation_history}
```

### 5-3. 세션 상태 관리

```
세션 상태: idle → active → ended

idle:   세션 시작 전
active: 세션 진행 중 (Supabase sessions/session_logs에 기록)
ended:  세션 종료 후 (status='ended'로 마감)
```

### 5-4. TTS 스트리밍 처리

```
LLM 스트리밍 응답 수신
    ↓
문장 단위 감지 (마침표, 물음표, 느낌표)
    ↓
문장 완성 시 즉시 Clova Voice TTS 요청
    ↓
오디오 청크 클라이언트 전송 (순차 재생)
    ↓
전체 질문 완성 후 다음 입력 대기
```

---

## 6. API 초안

아래 계약은 **논리적 요청/응답 형태**를 정의한다. 실제 전송은 두 가지로 나뉜다. 프로필·세션 이력·로그 같은 **CRUD는 클라이언트가 supabase-js로 직접** 수행하고(RLS로 소유자 격리), **세션 AI 단계(start/respond/correct/end)는 Edge Functions**가 처리한다.

### 인증

| 항목 | 내용 |
|---|---|
| 방식 | Supabase Auth (JWT) — supabase-js가 자동 첨부 |
| 헤더 | `Authorization: Bearer {supabase access token}` |
| 미인증 응답 | `401 Unauthorized` |

---

### 프로필 API

#### `POST /api/profile` — 연대기 등록

```json
// Request
{
  "name": "이순자",
  "birth_year": 1945,
  "hometown": "전북 전주",
  "job": "식당 운영, 30년",
  "family": "딸 둘, 사위 둘, 손자 셋",
  "memories": ["남편과 처음 만난 장터", "첫째 딸 결혼식"],
  "hobbies": "텃밭 가꾸기"
}

// Response 201
{
  "id": "uuid",
  "created_at": "2026-04-20T09:00:00Z"
}

// Error 400
{
  "error": "MISSING_REQUIRED_FIELD",
  "fields": ["name", "birth_year"]
}
```

#### `GET /api/profile/:id` — 연대기 조회

```json
// Response 200
{
  "id": "uuid",
  "name": "이순자",
  "birth_year": 1945,
  "hometown": "전북 전주",
  "job": "식당 운영, 30년",
  "family": "딸 둘, 사위 둘, 손자 셋",
  "memories": ["남편과 처음 만난 장터", "첫째 딸 결혼식"],
  "hobbies": "텃밭 가꾸기",
  "updated_at": "2026-04-20T09:00:00Z"
}
```

#### `PATCH /api/profile/:id` — 연대기 수정

```json
// Request (변경 필드만 포함)
{
  "hobbies": "텃밭 가꾸기, 화투"
}

// Response 200
{
  "id": "uuid",
  "updated_at": "2026-04-21T10:00:00Z"
}
```

#### `GET /api/profiles` — 어르신 목록 조회

```json
// Response 200
{
  "profiles": [
    {
      "id": "uuid",
      "name": "이순자",
      "birth_year": 1945,
      "last_session_at": "2026-04-20T09:30:00Z"
    }
  ]
}
```

---

### 세션 API

#### `POST /api/session/start` — 세션 시작

```json
// Request
{
  "profile_id": "uuid"
}

// Response 200
{
  "session_id": "uuid",
  "question": "어르신, 전주에서 오래 사셨다고 하셨는데, 거기서 제일 기억에 남는 게 뭐예요?",
  "audio_url": "https://storage.../tts_001.mp3",
  "topic": "고향"
}
```

#### `POST /api/session/respond` — 어르신 응답 처리

```
// Request (multipart/form-data)
session_id: "uuid"
audio: File (wav/mp3, 최대 60초)

// Response 200
{
  "transcript": "거기서 김치 공장을 했지. 전국에서 사람들이 왔어.",
  "question": "김치 공장이요? 얼마나 오래 하셨어요?",
  "audio_url": "https://storage.../tts_002.mp3",
  "topic": "직업",
  "switch_topic": false,
  "turn": 2
}

// Error 422 (STT 실패)
{
  "error": "STT_FAILED",
  "message": "음성을 인식하지 못했습니다. 다시 말씀해 주세요."
}
```

#### `PATCH /api/session/respond/correct` — STT 오인식 수정

```json
// Request
{
  "session_id": "uuid",
  "turn": 2,
  "corrected_text": "거기서 김치 공장을 했지"
}

// Response 200
{
  "question": "김치 공장이요? 얼마나 오래 하셨어요?",
  "audio_url": "https://storage.../tts_002c.mp3",
  "topic": "직업"
}
```

#### `POST /api/session/end` — 세션 종료

```json
// Request
{
  "session_id": "uuid"
}

// Response 200
{
  "session_id": "uuid",
  "turn_count": 4,
  "duration_seconds": 623,
  "ended_at": "2026-04-20T09:40:23Z"
}
```

#### `GET /api/profile/:id/sessions` — 세션 이력 목록

```json
// Response 200
{
  "sessions": [
    {
      "id": "uuid",
      "started_at": "2026-04-20T09:30:00Z",
      "ended_at": "2026-04-20T09:40:23Z",
      "turn_count": 4,
      "duration_seconds": 623
    }
  ]
}
```

#### `GET /api/session/:id/logs` — 세션 로그 상세

```json
// Response 200
{
  "session_id": "uuid",
  "logs": [
    {
      "role": "ai",
      "content": "전주에서 오래 사셨다고 하셨는데, 거기서 제일 기억에 남는 게 뭐예요?",
      "timestamp": "2026-04-20T09:30:05Z"
    },
    {
      "role": "user",
      "content": "거기서 김치 공장을 했지.",
      "timestamp": "2026-04-20T09:30:42Z",
      "duration_ms": 4200
    }
  ]
}
```

---

## 7. 데이터베이스 스키마 초안

### PostgreSQL

```sql
-- 요양보호사 계정 (auth.users와 1:1 연결)
CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        VARCHAR(50) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 어르신 연대기
CREATE TABLE profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(50) NOT NULL,
  birth_year  SMALLINT NOT NULL CHECK (birth_year BETWEEN 1900 AND 2006),
  hometown    VARCHAR(100),
  job         VARCHAR(200),
  family      TEXT,
  memories    TEXT[],              -- 배열로 저장 (최대 5개)
  hobbies     VARCHAR(200),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 세션 메타
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(10) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'ended')),
  turn_count      SMALLINT DEFAULT 0,
  duration_seconds INTEGER,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

-- 세션 대화 전문
CREATE TABLE session_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  profile_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             VARCHAR(5) NOT NULL CHECK (role IN ('ai', 'user')),
  content          TEXT NOT NULL,
  topic            VARCHAR(20),        -- ai 발화에만 기록
  audio_url        TEXT,               -- TTS 결과 오디오 (ai 발화)
  audio_expires_at TIMESTAMPTZ,        -- 오디오 만료 (24h 후 정리)
  spoken_at        TIMESTAMPTZ DEFAULT NOW(),
  duration_ms      INTEGER             -- user 발화 길이 (ms)
);

-- 인덱스
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_sessions_profile_id ON sessions(profile_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_session_logs_session_id ON session_logs(session_id);
```

### 세션 진행 중 상태

v1에서는 별도 실시간 DB 없이 진행 중 세션도 Supabase의 `sessions`(`status='active'`, `current_topic`, `turn_count`)와 `session_logs`에 직접 기록한다. 세션 종료 시 `sessions.status='ended'`로 마감한다. 실시간 모니터링이 필요해지면 Supabase Realtime을 검토한다.

---

## 8. 입력값 검증 규칙

### 연대기 입력 (POST/PATCH /api/profile)

| 필드 | 타입 | 필수 | 규칙 |
|---|---|---|---|
| name | string | ✅ | 1~50자. 공백만 입력 불가 |
| birth_year | integer | ✅ | 1900 이상 2006 이하 |
| hometown | string | ❌ | 최대 100자 |
| job | string | ❌ | 최대 200자 |
| family | string | ❌ | 최대 500자 |
| memories | string[] | ❌ | 최대 5개. 항목당 최대 200자 |
| hobbies | string | ❌ | 최대 200자 |

### 세션 응답 (POST /api/session/respond)

| 필드 | 타입 | 필수 | 규칙 |
|---|---|---|---|
| session_id | UUID | ✅ | 존재하는 active 세션 |
| audio | File | ✅ | wav/mp3/m4a. 최대 10MB. 최대 60초 |

### STT 수정 (PATCH /api/session/respond/correct)

| 필드 | 타입 | 규칙 |
|---|---|---|
| corrected_text | string | 1~500자. 공백만 입력 불가 |
| turn | integer | 1 이상. 현재 세션 턴 수 이하 |

---

## 9. 오류 처리 방식

### 공통 오류 응답 형식

```json
{
  "error": "ERROR_CODE",
  "message": "사용자 친화적 메시지 (한국어)",
  "detail": "개발자용 상세 메시지 (영어, 선택)"
}
```

### 오류 코드 정의

| HTTP | 코드 | 상황 | 클라이언트 처리 |
|---|---|---|---|
| 400 | `MISSING_REQUIRED_FIELD` | 필수 항목 누락 | 해당 필드 빨간 테두리 + 안내 |
| 400 | `INVALID_AUDIO_FORMAT` | 지원하지 않는 오디오 형식 | "지원하지 않는 형식입니다" |
| 401 | `UNAUTHORIZED` | 미인증 요청 | 로그인 화면으로 이동 |
| 403 | `FORBIDDEN` | 타인 데이터 접근 | "접근 권한이 없습니다" |
| 404 | `PROFILE_NOT_FOUND` | 존재하지 않는 프로필 | 목록 화면으로 이동 |
| 404 | `SESSION_NOT_FOUND` | 존재하지 않는 세션 | 목록 화면으로 이동 |
| 409 | `SESSION_ALREADY_ACTIVE` | 이미 진행 중인 세션 | 진행 중 세션으로 이동 |
| 422 | `STT_FAILED` | 음성 인식 실패 | "다시 말씀해 주세요" + 재시도 |
| 422 | `LLM_PARSE_FAILED` | LLM 응답 형식 오류(Structured Outputs로 사실상 제거) | 재시도 1회 후 안내 |
| 429 | `RATE_LIMIT_EXCEEDED` | API 호출 한도 초과 | "잠시 후 다시 시도해 주세요" |
| 500 | `INTERNAL_SERVER_ERROR` | 서버 오류 | "일시적 오류입니다. 잠시 후 다시 시도해 주세요" |
| 503 | `AI_SERVICE_UNAVAILABLE` | LLM / Clova 불가 | 재시도 1회 → 실패 시 세션 일시 중단 안내 |

### 재시도 정책

```
LLM / TTS / STT 오류 발생
    ↓
1회 자동 재시도 (1초 후)
    ↓ 실패
클라이언트에 오류 응답 전달
    ↓
화면: 안내 메시지 표시 + 수동 재시도 버튼
```

---

## 10. 상태 변화 및 알림 처리

### 세션 상태 흐름

```
[idle]
  → 세션 시작 버튼 탭
[active]
  → AI 재생 중 / 마이크 대기 중 / STT 처리 중 반복
  → 세션 종료 버튼 탭
[ended]
  → 로그 저장 완료 → 세션 이력 목록으로 이동
```

### 대화 화면 내 상태

| 상태 | 마이크 | 안내 텍스트 | 비고 |
|---|---|---|---|
| `ai_speaking` | 비활성 | "듣고 있어요..." | TTS 재생 중 |
| `mic_ready` | 활성 (빨간 점) | "말씀해 주세요" | 입력 대기 |
| `processing` | 로딩 | "잠깐만요..." | STT+LLM+TTS 처리 중 |
| `error` | 재시도 아이콘 | "다시 말씀해 주세요" | 오류 발생 |
| `session_ended` | 없음 | "오늘 대화 잘 하셨어요!" | 종료 |

### 침묵 감지 처리

```
마이크 활성화 후
    ↓ 10초 경과, 발화 없음
"어르신, 잘 들리시나요?" 음성 재생
    ↓ 추가 10초 경과, 발화 없음
더 쉬운 질문으로 주제 전환 (switch_topic: true)
    ↓ 추가 10초 경과
세션 일시 중단 안내 후 대기
```

---

## 11. 보안 고려사항

| 항목 | 적용 방식 |
|---|---|
| API 인증 | Supabase Auth (JWT) 검증. CRUD는 RLS, AI는 Edge Function에서 JWT 검증 |
| 데이터 접근 제어 | RLS `user_id = auth.uid()` 정책. 타인 데이터는 조회 0건/거부 |
| API 키 관리 | Edge Function secrets에서만 관리. 클라이언트 미노출 |
| 오디오 처리 | Supabase Storage 임시 업로드 → STT 완료 즉시 삭제 |
| HTTPS | 모든 통신 TLS 1.2 이상 강제 |
| 입력값 검증 | 서버 사이드에서 타입·길이·형식 검증 (클라이언트 검증은 UX 보조 용도) |
| 로그 보안 | 세션 로그에 오디오 원본 미저장. 텍스트만 보관 |
| RLS | 모든 테이블에 `user_id = auth.uid()` 정책으로 소유자만 접근 |

---

## 12. 테스트 포인트

### 기능 테스트

| ID | 테스트 항목 | 확인 방법 |
|---|---|---|
| T-01 | 연대기 저장 후 LLM 첫 질문에 연대기 정보 포함 여부 | LLM 응답 텍스트 수동 확인 |
| T-02 | 동일 주제 3회 연속 반복 방지 | 10턴 세션 진행 후 로그 검토 |
| T-03 | 침묵 10초 후 주제 전환 | 10초 침묵 유지 → 응답 확인 |
| T-04 | STT 변환 후 텍스트 3초 이내 표시 | 스톱워치 수동 측정 |
| T-05 | TTS 첫 청크 재생 2초 이내 시작 | 스톱워치 수동 측정 |
| T-06 | 세션 종료 후 로그 Supabase 저장 | DB 직접 조회 |
| T-07 | STT 오인식 수정 후 LLM 재요청 | 수정 텍스트 기반 다음 질문 확인 |
| T-08 | 타인 프로필 접근 차단 | 다른 계정 토큰으로 조회 시 RLS로 0건/거부 |

### 파일럿 전 필수 확인

| ID | 항목 | 기준 |
|---|---|---|
| P-01 | 노인 발화 STT 인식률 | 일상 발화 5문장 테스트, 3문장 이상 정확 인식 |
| P-02 | 전체 파이프라인 응답 시간 | STT+LLM+TTS 합산 5초 이내 |
| P-03 | 연속 5턴 오류 없이 진행 | 내부 시나리오 테스트 3회 이상 |
| P-04 | Edge Function 웜업 확인 | 파일럿 30분 전 호출로 활성화 |
| P-05 | TestFlight 배포 설치 확인 | 파일럿 참가자 기기에 사전 설치 완료 |
