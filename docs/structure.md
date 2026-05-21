# structure.md

## 1. 전체 서비스 구조 개요

```
┌─────────────────────────────────────────────────────────┐
│                    기억온 (GiEok-On)                      │
├──────────────────┬──────────────────┬────────────────────┤
│  모바일 앱        │   관리자 웹        │    백엔드 API       │
│  (React Native)  │   (React + Vite) │  (Node.js+Express) │
│                  │                  │                    │
│ · 어르신 대화 화면 │ · 연대기 입력     │ · 세션 관리         │
│ · 요양보호사 화면  │ · 세션 로그 조회  │ · AI 파이프라인     │
│                  │                  │ · 데이터 저장       │
└──────────────────┴──────────────────┴────────────────────┤
                                                           │
           ┌───────────────────────────────────────────────┤
           │               외부 서비스                       │
           ├───────────────┬───────────────┬───────────────┤
           │  GPT-4o       │  Clova Voice  │    Whisper    │
           │  (대화 생성)   │  (TTS)        │    (STT)      │
           └───────────────┴───────────────┴───────────────┤
                                                           │
           ┌───────────────────────────────────────────────┤
           │               데이터베이스                       │
           ├──────────────────────┬────────────────────────┤
           │  Firebase Realtime   │      PostgreSQL        │
           │  (세션 실시간 동기화)   │  (연대기·세션 로그 저장) │
           └──────────────────────┴────────────────────────┘
```

---

## 2. 사용자 유형 정의

| 사용자 유형 | 설명 | 접근 환경 | 인증 여부 |
|---|---|---|---|
| **요양보호사** | 연대기 입력, 세션 시작·종료, 로그 확인 | 모바일 앱 + 관리자 웹 | 필요 (이메일+비밀번호) |
| **어르신** | AI와 음성 대화 진행 | 모바일 앱 (대화 화면) | 불필요 (요양보호사가 세션 시작) |
| **관리자** | 계정 관리, 전체 현황 확인 (향후) | 관리자 웹 | 필요 (별도 권한) |

---

## 3. 권한 구조

```
[비로그인]
  └── 어르신 대화 화면 (세션 링크로 진입)

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

### 모바일 앱

| 화면명 | 경로 | 접근 주체 | 주요 기능 |
|---|---|---|---|
| 로그인 | `/login` | 요양보호사 | 이메일+비밀번호 로그인 |
| 어르신 목록 | `/profiles` | 요양보호사 | 등록 어르신 목록, 세션 시작 버튼 |
| 연대기 입력 | `/profiles/new` | 요양보호사 | 신규 어르신 프로필 등록 |
| 연대기 수정 | `/profiles/:id/edit` | 요양보호사 | 기존 연대기 수정 |
| 세션 로그 목록 | `/profiles/:id/logs` | 요양보호사 | 어르신별 세션 이력 |
| 세션 로그 상세 | `/sessions/:id` | 요양보호사 | 대화 전문·턴 수·발화 시간 |
| 어르신 대화 화면 | `/session/active` | 어르신 | AI 음성 출력 + 마이크 입력 |

### 관리자 웹

| 화면명 | 경로 | 주요 기능 |
|---|---|---|
| 로그인 | `/login` | 요양보호사 웹 로그인 |
| 대시보드 | `/` | 담당 어르신 현황 요약 |
| 어르신 관리 | `/profiles` | 목록·등록·수정 |
| 세션 이력 | `/sessions` | 전체 세션 로그 조회 |

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

1. 요양보호사가 세션 시작 → 어르신 대화 화면 자동 전환
2. AI 첫 질문 TTS 자동 재생 (버튼 조작 불필요)
3. 재생 완료 → 마이크 자동 활성화
4. 어르신 발화 → STT 변환 → 화면에 텍스트 표시
5. 텍스트 → GPT-4o → 다음 질문 생성
6. 다음 질문 TTS 재생 → 반복
7. 침묵 10초 이상 감지 → 힌트 제공 또는 주제 전환
8. 세션 종료 → `세션을 마쳤어요` 안내 음성 재생

---

## 7. 주요 데이터 엔티티

### users (요양보호사 계정)
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | UUID | PK |
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
| `role` | ENUM | `ai` / `user` |
| `content` | TEXT | 발화 텍스트 |
| `timestamp` | TIMESTAMP | 발화 시각 |
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

### 모바일 앱 (React Native + Expo)

```
gieok-on-app/
├── app/                          # Expo Router 기반 화면
│   ├── (auth)/
│   │   └── login.tsx             # 로그인 화면
│   ├── (tabs)/
│   │   ├── profiles/
│   │   │   ├── index.tsx         # 어르신 목록
│   │   │   ├── new.tsx           # 연대기 입력
│   │   │   └── [id]/
│   │   │       ├── edit.tsx      # 연대기 수정
│   │   │       └── logs.tsx      # 세션 이력
│   │   └── sessions/
│   │       └── [id].tsx          # 세션 로그 상세
│   └── session/
│       └── active.tsx            # 어르신 대화 화면
├── components/
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── LoadingSpinner.tsx
│   ├── profile/
│   │   ├── ProfileCard.tsx       # 어르신 목록 카드
│   │   └── ChronicleForm.tsx     # 연대기 입력 폼
│   └── session/
│       ├── ChatBubble.tsx        # 대화 말풍선
│       ├── MicButton.tsx         # 마이크 버튼
│       └── VoiceWave.tsx         # 음성 재생 시각화
├── hooks/
│   ├── useSession.ts             # 세션 상태 관리
│   ├── useTTS.ts                 # TTS 재생 훅
│   └── useSTT.ts                 # STT 녹음 훅
├── services/
│   ├── api.ts                    # Axios 인스턴스 + 기본 설정
│   ├── sessionService.ts         # 세션 API 호출
│   └── profileService.ts         # 프로필 API 호출
├── store/
│   └── useSessionStore.ts        # Zustand 세션 상태
├── constants/
│   └── typography.ts             # 글자 크기 상수 (최소 18pt)
└── app.json
```

### 백엔드 (Node.js + Express)

```
gieok-on-server/
├── src/
│   ├── routes/
│   │   ├── profile.routes.ts     # /profile CRUD
│   │   └── session.routes.ts     # /session 시작·응답·종료
│   ├── controllers/
│   │   ├── profile.controller.ts
│   │   └── session.controller.ts
│   ├── services/
│   │   ├── llm.service.ts        # GPT-4o 호출·프롬프트 관리
│   │   ├── tts.service.ts        # Clova Voice 호출
│   │   ├── stt.service.ts        # Whisper / Clova Speech 호출
│   │   └── session.service.ts    # 세션 비즈니스 로직
│   ├── models/
│   │   ├── profile.model.ts      # PostgreSQL 쿼리
│   │   └── session.model.ts
│   ├── middlewares/
│   │   ├── auth.middleware.ts    # Firebase 토큰 검증
│   │   └── error.middleware.ts
│   ├── config/
│   │   ├── firebase.ts           # Firebase Admin SDK 초기화
│   │   └── db.ts                 # PostgreSQL 연결
│   └── app.ts                    # Express 앱 진입점
├── .env                          # API 키 환경변수
└── package.json
```

### 관리자 웹 (React + Vite)

```
gieok-on-web/
├── src/
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Profiles.tsx
│   │   └── Sessions.tsx
│   ├── components/
│   │   ├── ProfileTable.tsx
│   │   └── SessionLogViewer.tsx
│   ├── services/
│   │   └── api.ts                # 앱과 동일한 API 엔드포인트 공유
│   └── main.tsx
└── vite.config.ts
```

---

## 10. 주요 컴포넌트·모듈 구조

### AI 파이프라인 모듈 (백엔드)

```
session.routes.ts
  └── POST /session/respond
        ↓
  session.controller.ts
        ↓
  session.service.ts
    ├── stt.service.ts         어르신 발화 오디오 → 텍스트
    ├── llm.service.ts         텍스트 + 연대기 → 다음 질문 JSON
    └── tts.service.ts         다음 질문 텍스트 → 오디오 URL
        ↓
  클라이언트로 { question, audioUrl, switchTopic } 반환
```

### 어르신 대화 화면 (앱)

```
active.tsx
  ├── useSessionStore         세션 ID, 대화 이력 상태
  ├── useTTS                  오디오 URL 받아 자동 재생
  ├── useSTT                  마이크 활성화·녹음·업로드
  ├── VoiceWave               재생 중 시각 피드백
  ├── ChatBubble              발화 텍스트 표시
  └── MicButton               마이크 활성화 버튼 (대형)
```

---

## 11. 프론트와 백 간 연결 포인트

| 기능 | 메서드 | 엔드포인트 | 요청 | 응답 |
|---|---|---|---|---|
| 연대기 저장 | POST | `/api/profile` | 연대기 필드 전체 | `{ id, created_at }` |
| 연대기 조회 | GET | `/api/profile/:id` | — | 연대기 전체 필드 |
| 세션 시작 | POST | `/api/session/start` | `profile_id` | `{ session_id, question, audioUrl }` |
| 어르신 응답 처리 | POST | `/api/session/respond` | `session_id`, 오디오 파일 | `{ question, audioUrl, switchTopic }` |
| 세션 종료 | POST | `/api/session/end` | `session_id` | `{ turn_count, duration }` |
| 세션 로그 조회 | GET | `/api/session/:id/logs` | — | 대화 전문 배열 |
| 세션 이력 목록 | GET | `/api/profile/:id/sessions` | — | 세션 메타 목록 |

**인증 헤더:** 모든 요청에 `Authorization: Bearer {firebaseIdToken}` 포함

---

## 12. 향후 구조 확장 방향

| 항목 | 현재 구조 | 확장 시 |
|---|---|---|
| 보호자 연동 | 미구현 | `guardians` 테이블 추가, 세션 종료 시 FCM 푸시 알림 발송 |
| 세션 자동 요약 | 미구현 | `session.service.ts`에 GPT-4o 요약 호출 추가 → `sessions.summary` 컬럼 저장 |
| 인지자극 모듈 | 미구현 | `session_type` ENUM 컬럼 추가 (`reminiscence` / `cognitive`), 프롬프트 분기 |
| 연대기 자동 축적 | 요양보호사 직접 입력 | 세션 로그 분석 → `profiles` 자동 업데이트 배치 |
| 기관 어드민 | 미구현 | `organizations` 테이블 추가, `users.org_id` FK 연결 |
| 다중 STT | Whisper 단일 | `stt.service.ts` 내 Whisper / Clova Speech 전략 패턴으로 교체 |
| 모니터링 | 없음 | Sentry(에러) + API 응답 시간 로깅 미들웨어 추가 |
