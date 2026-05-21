# tech.md

## 1. 기술 스택 개요

| 영역 | 선택 기술 | 선택 이유 | 대안 |
|---|---|---|---|
| 모바일 앱 | React Native | iOS·Android 동시 개발. 3인 팀 리소스 최적화 | Flutter |
| 관리자 웹 | React (Vite) | 팀 내 React 경험 보유. 빠른 프로토타이핑 | Next.js |
| 백엔드 | Node.js + Express | 팀 친숙도 높음. 빠른 REST API 구성 | FastAPI |
| DB (실시간) | Firebase Realtime DB | 실시간 대화 동기화, 무료 티어 충분 | Supabase Realtime |
| DB (장기) | PostgreSQL | 연대기·세션 로그 정형 저장 | MySQL |
| 인증 | Firebase Authentication | 소셜 로그인 10분 구현. 무료 | Supabase Auth |
| LLM | GPT-4o | 한국어 대화 품질 최상. API 접근 간편 | HyperCLOVA X |
| TTS | Clova Voice | 한국어 자연스러움. 노인 대상 적합한 발화 속도 | Google TTS |
| STT | Whisper API | 범용 인식률 우수. 무료 오픈소스 병행 가능 | Clova Speech |
| 배포 (프론트) | Vercel | GitHub 연동 자동 배포. 무료 티어 | Netlify |
| 배포 (백엔드) | Render | 무료 티어로 Node 서버 운영 가능 | Railway |
| 파일 저장 | Firebase Storage | 세션 오디오 임시 저장. 무료 5GB | AWS S3 |

---

## 2. 프론트엔드 기술

**모바일 앱 — React Native (Expo)**

어르신용 대화 화면과 요양보호사용 연대기 입력·세션 관리 화면을 단일 코드베이스로 개발한다. Expo를 사용하여 빌드 환경 구성 시간을 최소화하고, TestFlight(iOS) / APK 직접 설치(Android)로 파일럿을 진행한다.

- 어르신 대화 화면: 글자 크기 최소 18pt, 버튼 최소 60px, 조작 최소화
- 요양보호사 화면: 연대기 입력 폼, 세션 시작·종료, 로그 조회
- 상태 관리: Zustand (Redux 대비 보일러플레이트 적음)
- 네비게이션: React Navigation v6

**관리자 웹 — React + Vite**

요양보호사가 PC·태블릿 브라우저에서 접근하는 반응형 관리 화면. 모바일 앱과 동일한 API 서버를 공유한다.

---

## 3. 백엔드 기술

**Node.js + Express**

REST API 구조로 핵심 로직을 담당한다. LLM 호출, STT/TTS 연동, 세션 로그 저장 등 AI 파이프라인의 중간 조율자 역할을 한다.

```
클라이언트 → Express API 서버
                ↓
        GPT-4o / Clova Voice / Whisper
                ↓
        Firebase DB / PostgreSQL
```

**핵심 엔드포인트 (예정)**

| 엔드포인트 | 설명 |
|---|---|
| `POST /session/start` | 연대기 기반 세션 초기화 + 첫 질문 생성 |
| `POST /session/respond` | 어르신 발화 수신 → LLM 다음 질문 생성 |
| `POST /session/end` | 세션 종료 + 로그 저장 |
| `GET /profile/:id` | 어르신 연대기 조회 |
| `POST /profile` | 어르신 연대기 저장·수정 |

---

## 4. 데이터베이스

**Firebase Realtime Database — 실시간 대화 동기화**

세션 진행 중 대화 턴을 실시간으로 저장·동기화한다. 어르신 화면과 요양보호사 모니터링 화면이 같은 데이터를 실시간으로 바라본다. 무료 티어(1GB 저장, 10GB 전송/월)로 MVP 단계 충분.

**PostgreSQL — 연대기 및 세션 로그 장기 저장**

어르신 프로필(연대기), 세션 메타데이터(날짜·턴 수·발화 시간), 세션 전문 텍스트를 정형 데이터로 저장한다. Render의 PostgreSQL 무료 인스턴스(90일 유지)를 개발·파일럿 단계에 활용한다.

**주요 테이블 구조 (예정)**

```sql
-- 어르신 프로필
profiles (id, name, birth_year, hometown, job, family, memories, hobbies, created_at)

-- 세션 메타
sessions (id, profile_id, started_at, ended_at, turn_count)

-- 세션 로그 (대화 전문)
session_logs (id, session_id, role, content, timestamp)
```

---

## 5. 인증·로그인 방식

**Firebase Authentication**

요양보호사 계정 관리에 사용한다. 이메일+비밀번호 로그인을 기본으로 적용한다. 소셜 로그인(Google)은 필요 시 추가한다. Firebase SDK로 10분 내 구현 가능하며, 무료 티어로 충분하다.

어르신 대화 화면은 로그인 없이 요양보호사가 세션을 시작하면 자동으로 진입하는 구조로 설계한다. 어르신이 직접 인증 절차를 거치지 않도록 UX를 단순화한다.

---

## 6. 파일 업로드 및 저장 방식

**Firebase Storage — 오디오 임시 저장**

STT 처리 전 어르신 발화 오디오를 임시 저장한다. Whisper API에 파일을 전송하고 텍스트 변환 완료 후 오디오는 삭제한다. 무료 5GB 저장 공간으로 MVP 단계 충분.

세션 로그(텍스트)는 Firebase Storage가 아닌 PostgreSQL에 저장한다. 오디오 원본을 장기 보관하지 않아 개인정보 처리 부담을 최소화한다.

---

## 7. 외부 API 연동 계획

**AI 파이프라인 흐름**

```
[어르신 발화]
      ↓
Whisper API (STT: 음성 → 텍스트)
      ↓
GPT-4o (LLM: 다음 질문 생성)
      ↓
Clova Voice (TTS: 텍스트 → 음성)
      ↓
[어르신 청취]
```

**API별 상세**

| API | 용도 | 과금 기준 | 비고 |
|---|---|---|---|
| OpenAI GPT-4o | 회상 대화 생성, 주제 전환 판단 | 토큰당 | 프롬프트 최적화로 비용 통제 |
| OpenAI Whisper | 어르신 발화 STT | 오디오 분당 | 로컬 Whisper 병행 검토 |
| Clova Voice (NAVER) | TTS 음성 출력 | 글자 수당 | 한국어 노인 발화 자연스러움 우선 |
| Clova Speech (NAVER) | 사투리·노인 발화 STT 보완 | 초당 | Whisper 오인식 보정용 |

**LLM 프롬프트 설계 방향**

시스템 프롬프트에 어르신 연대기 전체를 삽입하고, 회상치료 진행 원칙(긍정적 기억 우선, 고통 주제 전환, 반복 질문 금지)을 명시한다. 응답 포맷은 JSON으로 고정하여 다음 질문 텍스트와 주제 전환 여부를 분리 파싱한다.

```json
{
  "question": "식당은 어디서 하셨어요? 전주 시내였나요?",
  "topic": "직업",
  "switch_topic": false
}
```

---

## 8. 배포 환경

**개발 단계**

| 환경 | 도구 | 비고 |
|---|---|---|
| 로컬 개발 | Node.js 로컬 서버 + Expo Go | 팀원 각자 로컬 실행 |
| API 테스트 | Postman | 엔드포인트 단위 검증 |
| 모바일 테스트 | Expo Go 앱 | 실기기 즉시 테스트 |

**파일럿 단계**

| 영역 | 도구 | 비고 |
|---|---|---|
| 백엔드 | Render (무료 인스턴스) | Node.js 서버 배포 |
| 프론트 웹 | Vercel | GitHub push 시 자동 배포 |
| 모바일 앱 | TestFlight (iOS) / APK 직접 설치 (Android) | 앱스토어 심사 우회 |
| DB | Render PostgreSQL + Firebase | 무료 티어 활용 |

앱스토어 정식 출시는 파일럿 검증 이후로 미룬다. 파일럿 기간에는 TestFlight 초대 링크로 배포한다.

---

## 9. 개발 도구 및 협업 도구

| 구분 | 도구 | 용도 |
|---|---|---|
| 버전 관리 | GitHub | 코드 저장·PR 리뷰 |
| 협업 | Notion | 회의록·스펙 문서 관리 |
| 디자인 | Figma | 와이어프레임·UI 목업 |
| API 문서 | Postman | API 스펙 공유·테스트 |
| 커뮤니케이션 | KakaoTalk | 팀 일상 소통 |
| 환경변수 관리 | .env + GitHub Secrets | API 키 보안 관리 |
| 패키지 관리 | npm | Node.js 의존성 관리 |

---

## 10. 기술 선택 이유

**React Native를 선택한 이유**
iOS·Android를 별도로 개발하면 3인 팀의 리소스가 분산된다. React Native + Expo로 단일 코드베이스를 유지하면서 두 플랫폼에 동시 배포할 수 있다. 팀 내 React 경험을 그대로 활용할 수 있어 러닝커브도 낮다.

**Firebase를 선택한 이유**
실시간 대화 동기화와 인증을 별도 서버 없이 처리할 수 있다. MVP 단계에서 무료 티어로 충분하며, SDK 설정 이후 코드 작성량이 적다. PostgreSQL과 역할을 분리하여 실시간성과 정형 저장을 각각 처리한다.

**GPT-4o를 선택한 이유**
한국어 대화 품질이 현재 상용 LLM 중 가장 높다. API 접근이 간편하고 문서화가 잘 되어 있다. 프롬프트 수준에서 회상치료 프로토콜을 제어할 수 있어 별도 파인튜닝 없이 적용 가능하다.

**Clova Voice를 선택한 이유**
한국어 TTS 중 노인이 듣기에 가장 자연스러운 발화 속도와 억양을 제공한다. Google TTS 대비 한국어 특화 품질이 높고, 발화 속도 조절 API를 지원한다.

---

## 11. 기술적 제약사항

| 제약 | 내용 | 대응 |
|---|---|---|
| STT 정확도 | 노인 발화(사투리, 어눌함, 짧은 응답)에서 Whisper 오인식 빈발 | Clova Speech 병행. 요양보호사 수동 수정 UI 제공 |
| LLM 응답 지연 | GPT-4o 평균 응답 1~3초 + TTS 변환 시간 = 체감 대기 3~5초 | 스트리밍 응답 + TTS 청크 분할 재생으로 체감 지연 최소화 |
| API 비용 | GPT-4o + Clova Voice + STT 세션당 과금 | 프롬프트 토큰 최적화. 파일럿 세션 수 제한(일 5~10회) |
| Render 무료 인스턴스 | 15분 비활성 시 슬립. 첫 요청 응답 30초 소요 | 파일럿 전 서버 웜업 스크립트 실행 |
| Expo 빌드 제한 | Expo Go에서 일부 네이티브 모듈 미지원 | 오디오 녹음 관련 모듈은 Expo AV 사용. 필요 시 EAS Build 전환 |
| Firebase 무료 티어 | Spark 플랜: 동시 접속 100, 저장 1GB | 파일럿 규모(5~10명) 내에서 충분. 초과 시 Blaze 전환 |

---

## 12. 추후 확장 시 고려사항

| 항목 | 현재 | 확장 시 |
|---|---|---|
| LLM | GPT-4o 단일 | HyperCLOVA X 병행 (사투리·한국어 특화 보완) |
| STT | Whisper + Clova Speech | 노인 발화 특화 파인튜닝 모델 도입 |
| 백엔드 배포 | Render 무료 | AWS EC2 또는 Google Cloud Run (트래픽 증가 시) |
| DB | Firebase + Render PostgreSQL | AWS RDS + 읽기 복제본 (다중 기관 운영 시) |
| 보호자 연동 | 미구현 | Firebase Cloud Messaging으로 푸시 알림 추가 |
| 연대기 축적 | 요양보호사 직접 입력 | 세션 로그 기반 AI 자동 연대기 보완 (v3) |
| 인지자극 모듈 | 미구현 | 별도 프롬프트 + 세션 타입 분기로 추가 |
| 모니터링 | 없음 | Sentry (에러 추적) + Datadog (API 지연 모니터링) |
