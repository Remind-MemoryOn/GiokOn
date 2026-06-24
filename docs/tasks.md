# tasks.md

> 작업 분해는 `PLAN.md`(v2: 모노레포 · Supabase 중심 · 웹+모바일 하이브리드)를 단일 기준으로 한다. 이 문서는 PLAN.md의 모듈(M0~M8)·Phase(A~F)를 실행 작업으로 펼친 뷰다. (기존 8주 날짜 일정은 경과하여 의존성 순서 중심으로 대체)

## 1. 개발 목표 요약

| 항목 | 내용 |
|---|---|
| 최종 목표 | 연대기 입력 → LLM 회상 대화 → TTS 출력 → STT 입력 → 세션 로그 저장 핵심 루프 완성 + 현장 파일럿 |
| v1 범위 | 요양보호사 관리 웹(`apps/web`) + 어르신 대화 모바일앱(`apps/mobile`). 보호자=v2 |
| 아키텍처 | pnpm 모노레포, Supabase 직접연동(Auth+RLS)+Edge Functions(AI), Figma 디자인 토큰 |
| 팀 구성 | 팀장(풀스택·AI·Supabase) / 팀원 A(모바일 앱·음성) / 팀원 B(관리자 웹·기획·디자인) |
| 완성 기준 | Must 핵심 루프 + Should 핵심(세션 로그·STT 수정·오류 처리) 동작 확인 |

**원칙: 기능 욕심보다 완성도 우선** — 핵심 루프 먼저, Should는 그 다음. AI/STT/TTS는 전 구간 목업으로 개발하고 실 provider는 후반에 연결.

---

## 2. 작업 흐름 (Phase, 의존성 순서)

| Phase | 내용 | 포함 모듈 |
|---|---|---|
| **A. 기반** | 모노레포 셋업 + 로직 추출 + 토큰 정의 (+ 현 웹 정리) | M0, M1, M4.1, M5.1 |
| **A+. 실음성 수직 슬라이스** | 실 STT→LLM→TTS 1턴 실기기 실측 + Realtime 스파이크 비교(리스크 조기 검증) | M3.1~3.2 일부, T3.6 |
| **B. 데이터/인증** | 마이그레이션·RLS·Storage → data·auth → 스토어 연결 | M3.1~3.3, M2 |
| **C. 웹 v1** | 요양보호사 웹 인증·데이터 연결·재스킨·배포 | M5 |
| **D. 모바일 v1** | 어르신 Expo 앱·대화·오디오·접근성 | M6 |
| **E. 실 AI** | LLM/STT/TTS Edge Functions, 목업→실연동 전환 | M3.4~3.5, M7 |
| **F. 퍼블리싱** | CI·EAS·스토어·롤아웃 | M8 |

각 Phase는 별도 PR/커밋으로 분리한다. C·D는 B 위에서 병행 가능.

---

## 3. 작업 분해 (모듈별)

### M0 — 모노레포 기반 (Phase A)

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T0.1 | pnpm 워크스페이스 init (루트 package.json, pnpm-workspace.yaml) | — | 팀장 |
| T0.2 | 공용 tsconfig.base / ESLint / Prettier | T0.1 | 팀장 |
| T0.3 | `frontend/` → `apps/web` 이전, build·lint 통과 | T0.1 | 팀원 B |
| T0.4 | 빈 패키지 스캐폴드 `packages/core|data|theme` + `apps/mobile` placeholder | T0.1 | 팀장 |

### M1 — packages/core (Phase A)

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T1.1 | `types.ts` 이전 + DB 스키마 정합화(v2 필드 표기) | T0.4 | 팀장 |
| T1.2 | Zustand 도메인 스토어 이전 + 영속화 어댑터 추상화 | T1.1 | 팀장 |
| T1.3 | `AIProvider` 인터페이스 + `MockAIProvider`(기존 ai.ts) 이전 | T1.1 | 팀장 |
| T1.4 | 도메인 규칙 이전(연대기 추출·주제전환·리포트·utils) | T1.1 | 팀장 |
| T1.5 | 도메인 로직 단위테스트(vitest) | T1.3, T1.4 | 팀장 |

### M2 — packages/data (Phase B)

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T2.1 | supabase-js + TanStack Query 팩토리(웹/모바일 storage 어댑터, QueryClient) | T0.4 | 팀장 |
| T2.2 | 스키마→TS 타입 + TanStack Query 훅(useQuery/useMutation: profiles/chronicles/sessions/logs) | T2.1, M3 | 팀장 |
| T2.3 | 인증 모듈(Supabase Auth: signUp/signIn/signOut/비번재설정) + 계정 부트스트랩 트리거 | T2.1, M3 | 팀장 |
| T2.4 | 화면 ↔ data(TanStack Query) 연결, localStorage→Supabase | T1.2, T2.2 | 팀장 |

### M3 — supabase (Phase B + E)

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T3.1 | 마이그레이션: `users`↔`auth.users`, `firebase_uid` 제거, 가입 트리거 | — | 팀장 |
| T3.2 | RLS 전부 `auth.uid()`로 재작성, `app.user_id` 제거 | T3.1 | 팀장 |
| T3.3 | 오디오 Storage 버킷+RLS, `audio_expires_at` 정리(pg_cron) | — | 팀장 |
| T3.4 | Edge Function `session-respond` (STT→LLM[Structured Outputs]→TTS, 로그 기록) | T3.2 | 팀장 |
| T3.5 | 보조 Edge Functions(session-start/end, chronicle-extract) | T3.4 | 팀장 |
| T3.6 | Realtime 스파이크: gpt-realtime ephemeral token 발급 함수 + 모바일 PoC 실측 비교 | T3.2 | 팀장 |

### M4 — packages/theme (Phase A→C/D)

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T4.1 | 디자인 토큰 정의(색·타이포·간격), Figma 변수명과 1:1 | — | 팀원 B |
| T4.2 | 웹 어댑터(`tailwind.config.js`가 토큰 소비) | T4.1 | 팀원 B |
| T4.3 | 모바일 어댑터(NativeWind preset) | T4.1 | 팀원 A |
| T4.4 | 공용 프리미티브 계약(Button/Card/Input…) + 접근성 기본값 | T4.1 | 팀원 B |

### M5 — apps/web 요양보호사 (Phase A/C)

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T5.1 | 현 코드 baseline 정리(lint·`ChronicleView` state 버그) → build·lint 통과 | — | 팀원 B |
| T5.2 | Supabase 인증 + 라우트 가드(목업 로그인 교체) | T2.3 | 팀원 B |
| T5.3 | 요양보호사 화면 데이터 연결(대시보드·어르신·연대기·로그) | T2.4 | 팀원 B |
| T5.4 | Figma 토큰 기반 재스킨 | T4.2 | 팀원 B |
| T5.5 | 보호자 화면 목업 유지/플래그(v2) | T5.3 | 팀원 B |
| T5.6 | 회원가입·비밀번호 재설정 화면 | T2.3 | 팀원 B |
| T5.7 | 프로필 생성 시 개인정보 수집 동의 기록 | T5.3 | 팀원 B |
| T5.8 | 인앱 계정·데이터 삭제 흐름 | T5.3 | 팀원 B |
| T5.9 | 웹 배포(Netlify/Vercel) | T5.3 | 팀원 B |

### M6 — apps/mobile 어르신 (Phase D)

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T6.1 | Expo 스캐폴드 + NativeWind + theme 토큰 | T0.4, T4.3 | 팀원 A |
| T6.2 | 모바일 요양보호사 로그인(세션 지속) + 어르신 선택 화면 | T2.3, T6.1 | 팀원 A |
| T6.3 | 세션 시작 + 핸드오프 화면("어르신께 기기를 전달") | T6.2 | 팀원 A |
| T6.4 | 대화 상태머신(ai_speaking→mic_ready→processing→ended), core 재사용 | T1.3, T6.3 | 팀원 A |
| T6.5 | 오디오: Expo AV 녹음(≤60s) + `audio_url` 재생, SpeechProvider(Realtime 호환 심) | T6.4 | 팀원 A |
| T6.6 | 세션 파이프라인(start/respond/correct/end) + STT 수정 UI + 자동 종료(턴/침묵) + 오류 상태 | T3.4, T6.5 | 팀원 A |
| T6.7 | 접근성 패스(텍스트≥18pt, 터치≥60px, TTS 자동재생, 고대비) | T6.6 | 팀원 A |

### M7 — AI/STT/TTS 실연동 (Phase E)

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T7.1 | LLM(현행 프런티어 벤치마크) Edge Function: Structured Outputs(JSON schema) | T3.4 | 팀장 |
| T7.2 | STT(gpt-4o-transcribe, Clova Speech 보완) Edge Function | T3.4 | 팀장 |
| T7.3 | TTS(Clova Voice 기본/OpenAI·ElevenLabs 대체) → Storage → `audio_url` | T3.3, T3.4 | 팀장 |
| T7.4 | 프롬프트 안전 규칙(주제 3회+ 금지, 고통 키워드 전환, 짧은 답변 힌트) | T7.1 | 팀장 |
| T7.5 | core `AIProvider` env로 mock↔real 전환 | T7.1 | 팀장 |
| T7.6 | Realtime 평가(T3.6 결과) → v1 채택 여부 결정 | T3.6 | 팀장 |

### M8 — 퍼블리싱·인프라 (Phase F)

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T8.1 | 시크릿 관리(Supabase 키·provider 키 Edge Function secrets) | — | 팀장 |
| T8.2 | CI(패키지별 lint/typecheck/test, web 자동배포, 모바일 EAS) | M5, M6 | 팀장 |
| T8.3 | EAS 설정(bundle id `kr.gieokon.app`, 프로필) → build/submit | T8.2 | 팀원 A |
| T8.4 | 스토어 메타데이터·개인정보처리방침·AI 음성 고지·권한 문구·스크린샷 | — | 팀원 B |
| T8.5 | 롤아웃: 내부 QA → TestFlight/Play 내부테스트 → 파일럿 → 심사 제출 | T8.3 | 전원 |

---

## 4. 우선순위

| 우선순위 | 작업 그룹 | Phase |
|---|---|---|
| 🔴 Must | 모노레포·core·data/인증·웹 핵심·모바일 대화 루프 | A~D |
| 🟡 Should | 세션 로그·STT 수정·오류 처리·재스킨·실 AI | C~E |
| 🟢 Could | 보호자(v2)·인지자극(v2)·Clova Speech 보완·모니터링 | 이후 |

---

## 5. 담당 역할

| 담당 | 주요 책임 | 핵심 작업 |
|---|---|---|
| **팀장 (풀스택·AI·Supabase)** | 모노레포 기반, core/data, 마이그레이션·RLS, Edge Functions(AI) | T0.1~0.4, M1, M2, M3, M7, T8.1~8.2 |
| **팀원 A (모바일·음성)** | 어르신 Expo 앱, 음성 입출력, 접근성, EAS | T4.3, M6, T8.3 |
| **팀원 B (웹·기획·디자인)** | 요양보호사 웹, 디자인 토큰/Figma 핸드오프, 스토어 메타 | T0.3, M4(웹), M5, T8.4 |

> 팀장·팀원 A는 Phase D~E 기간 중 세션 파이프라인 연동 이슈 조기 발견을 위해 정기 싱크 권장.

---

## 6. 검증·QA

| 단계 | 내용 |
|---|---|
| 공통 | `pnpm -r build` · `pnpm -r lint` · `pnpm -r test` 통과, 패키지별 typecheck |
| core 단위테스트 | 첫 질문에 연대기 반영, 동일 주제 3회+ 없음, 고통 키워드 전환, LLM JSON 실패 1회 재시도 |
| data/RLS | 타인 데이터 조회 0건/거부, 본인 데이터만 CRUD (Supabase CLI 로컬 검증) |
| 세션 통합 | start→respond→correct→end→logs, 오디오 STT 후 만료/삭제 |
| 모바일 UX | 실기기에서 마이크 거부·네트워크 끊김·STT/TTS 실패 시 친화 메시지 |
| 성능 | STT≤3s, TTS 첫재생≤2s, STT+LLM+TTS≤5s, 프로필 저장≤2s |
| 퍼블리싱 | EAS production build, TestFlight/Play 내부테스트 설치, 개인정보·권한·AI 고지 |

---

## 7. 최종 점검 체크리스트

### 기능
- [ ] 요양보호사 로그인(Supabase Auth) 정상 동작
- [ ] 연대기 입력·저장·수정 정상 동작
- [ ] 세션 시작 후 첫 AI 질문에 연대기 정보(출신지·직업 중 1개 이상) 포함
- [ ] TTS 음성 자동 재생 (별도 버튼 조작 없이)
- [ ] STT 음성 입력 → 3초 이내 텍스트 표시
- [ ] 다음 AI 질문 자동 생성 → TTS 재생
- [ ] 동일 주제 3회 이상 연속 반복 없음
- [ ] 세션 종료 후 대화 로그 저장 확인
- [ ] 세션 이력 목록 조회 정상 동작
- [ ] STT 오인식 수동 수정 후 다음 질문 정상 생성

### 오류 처리
- [ ] STT 실패 시 "다시 말씀해 주세요" 안내
- [ ] 네트워크 끊김 시 안내 화면
- [ ] 필수 항목 미입력 시 저장 차단 + 안내

### 보안
- [ ] RLS로 타인 데이터 접근 차단 확인
- [ ] provider 키가 클라이언트 번들에 미포함(Edge Function secrets만)

### 배포
- [ ] Supabase 마이그레이션·Edge Functions 배포 확인
- [ ] 웹(Netlify/Vercel) 배포 확인
- [ ] EAS 최신 빌드 시연 기기 설치 완료
- [ ] Edge Function 웜업 완료(시연 30분 전)

### 발표 준비
- [ ] 시연 시나리오 3회 연속 오류 없이 완료
- [ ] 시연 백업 영상 준비 완료
- [ ] 발표 슬라이드 최종본 확인
- [ ] 시연 기기 화면 밝기 최대 설정
