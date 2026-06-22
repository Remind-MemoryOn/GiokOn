# PLAN.md — 기억온 개발 계획 (v2: 모노레포 · Supabase 중심 · 웹+모바일 하이브리드)

## 0. 요약
- 제품 방향은 **"AI 기반 인지활동 보조 앱"**. 의료·치료 효과 단정 금지, 회상 대화·기록 보조가 핵심 가치.
- 구조를 **모노레포(웹+모바일 하이브리드)**로 전환한다: `apps/web`(요양보호사 관리 웹), `apps/mobile`(어르신 대화 Expo 앱), 공유 로직은 `packages/*`.
- 백엔드는 **Supabase 중심**으로 단순화: 클라이언트가 supabase-js로 직접 연동, **Supabase Auth + RLS(`auth.uid()`)**, AI/STT/TTS 키 보호는 **Supabase Edge Functions**. Firebase·Express 미사용.
- 전략은 **"로직 보존, UI 재구성"**: 머리 쓴 도메인 로직(타입·스토어·AI 규칙)은 `packages/core`로 살리고, UI는 **Figma 핸드오프 → 디자인 토큰** 기반으로 새로 입힌다.
- v1 범위 = **핵심 루프**: 요양보호사 관리 웹 + 어르신 대화 모바일앱. 보호자 화면·아바타 꾸미기·음악/미술/인지 치료는 **v2**.
- 최종 배포: 웹(Netlify/Vercel) + 모바일(EAS Build/Submit → TestFlight/Play 내부테스트 → 정식 심사).

## 1. 타깃 아키텍처

### 1.1 모노레포 구조
```
giokon/
├─ apps/
│  ├─ web/        ← 기존 frontend/ 이전. 요양보호사 관리 웹 (React19+Vite+Tailwind). 보호자 화면은 v2(목업 유지)
│  └─ mobile/     ← 신규 Expo 앱. 어르신 대화화면 (RN + NativeWind)
├─ packages/
│  ├─ core/       ← 도메인 타입 + Zustand 스토어(도메인) + AI 인터페이스(+목업) + 도메인 규칙(연대기 추출·주제전환·리포트) + utils
│  ├─ data/       ← supabase-js 클라이언트 + 데이터 액세스(엔티티 CRUD) + Supabase Auth + 생성된 DB 타입
│  └─ theme/      ← 디자인 토큰(색/타이포/간격/라운드) → 웹 Tailwind + 모바일 NativeWind 공용. Figma 변수와 1:1
├─ supabase/      ← migrations(RLS auth.uid 재작성) + Edge Functions(AI/STT/TTS) + Storage 정책
└─ docs/          ← 기존 설계 문서(database/tech/product/design/requirements/structure/tasks)
```
- 워크스페이스 도구: **pnpm workspaces**(기본). 빌드/스크립트 캐싱이 필요해지면 Turborepo 추가(선택).
- 웹·모바일은 **UI를 공유하지 않는다**(역할·화면이 다름). 공유하는 것은 `packages/core`·`data`·`theme`(로직·데이터·토큰)뿐.

### 1.2 데이터/인증 흐름 (Supabase 중심)
- 인증: **Supabase Auth(이메일/비밀번호)**. 정체성 = `auth.uid()`.
- CRUD(profiles/chronicles/sessions/logs): 클라이언트가 **supabase-js 직접 호출**, **RLS로 소유자 격리**(`user_id = auth.uid()`).
- AI 파이프라인(LLM/STT/TTS): **Edge Functions**가 provider 키를 보유·호출. 클라이언트는 JWT로 함수 호출 → 함수가 검증·실행·결과 기록.
- 오디오: **Supabase Storage** 임시 저장(`audio_expires_at` 24h, pg_cron/스케줄 함수로 정리).
- supabase-js·Supabase Auth는 **웹·RN 양쪽 동작** → `packages/data` 하나로 공유.

### 1.3 보존 vs 재구성
| 레이어 | 현재 | 처리 |
|---|---|---|
| 도메인 타입 `types.ts` | 풍부(일부 v2) | ✅ `core`로 보존 + DB와 정합화(v1/v2 필드 표기) |
| 상태 로직 `store/store.ts` | Zustand | ✅ `core`로 보존(영속화는 어댑터로 추상화: web=localStorage, RN=AsyncStorage→Supabase가 SoT) |
| AI `lib/ai.ts` | 목업, 교체형 시그니처 | ✅ `core`에 인터페이스+MockProvider로 보존 → 실연동은 Edge Function |
| `lib/speech.ts` | Web Speech(웹 전용) | ⚠️ 인터페이스 추상화 → web/mobile 각각 구현 |
| Supabase 스키마 | 5테이블+RLS(app.user_id) | ⚠️ 유지하되 RLS를 `auth.uid()`로 재작성 |
| 화면 `pages/`·`components/` | 목업 수준 | 🔄 Figma 나오면 토큰 기반 재구성 |

## 2. 모듈 설계 + 태스크

### M0. 모노레포 기반 (Foundation)
설계: 워크스페이스 셋업, 공용 tooling(TS base/ESLint/Prettier), `frontend`→`apps/web` 이전, 빈 패키지 스캐폴드.
- T0.1 pnpm 워크스페이스 init(루트 package.json, pnpm-workspace.yaml).
- T0.2 공용 `tsconfig.base.json`, ESLint/Prettier 설정.
- T0.3 `frontend/`→`apps/web` 이전, import/경로 정리, `build`·`lint` 통과 확인. (의존: T0.1)
- T0.4 빈 패키지 스캐폴드 `packages/core|data|theme` + `apps/mobile` placeholder. (의존: T0.1)

### M1. packages/core (도메인·로직, 플랫폼 무관)
설계: 타입·스토어·AI 인터페이스·도메인 규칙·utils를 web/mobile 공유 가능한 순수 TS로 추출. DOM·RN 의존 제거.
- T1.1 `types.ts`→`core`; DB 스키마와 정합화(공통: name/birthYear/hometown/job/family/hobbies/memories/guardian). **v2 표기**: appearance·avatarColor(꾸미기), therapyType의 cognitive/music/art.
- T1.2 Zustand 도메인 스토어→`core`; UI 전용 상태(toast) 분리; **영속화 어댑터 인터페이스**(web/RN/Supabase 교체 가능)로 추상화. (의존: T1.1)
- T1.3 `AIProvider` 인터페이스 정의 + 기존 `lib/ai.ts`를 `MockAIProvider`로 이전(시그니처 유지: generateOpener/generateReply/extractChronicle/generateGuardianReport). (의존: T1.1)
- T1.4 순수 도메인 규칙 이전: 연대기 추출 규칙(RULES), 주제전환 로직, 감정/리포트 생성, utils(uid·날짜·아바타색). (의존: T1.1)
- T1.5 도메인 로직 단위테스트(vitest): 추출 규칙, 주제 3회 반복 방지, 고통 키워드 전환, 리포트 생성. (의존: T1.3, T1.4)

### M2. packages/data (Supabase 데이터·인증)
설계: supabase-js 클라이언트(플랫폼별 storage 어댑터), 엔티티 CRUD, Supabase Auth, 생성 DB 타입. core 스토어를 repository로 연결.
- T2.1 `@supabase/supabase-js` 추가; 클라이언트 팩토리(web=Vite env/localStorage, mobile=Expo env/SecureStore-AsyncStorage). (의존: T0.4)
- T2.2 스키마→TS 타입 생성; 엔티티별 데이터 액세스 함수(profiles/chronicles/sessions/logs CRUD). (의존: T2.1, M3)
- T2.3 인증 모듈(signUp/signIn/signOut/session) Supabase Auth; 요양보호사 계정 부트스트랩(가입 트리거로 `users` row). (의존: T2.1, M3)
- T2.4 core 스토어를 data 레이어에 연결(repository 패턴) — localStorage 영속화를 Supabase(SoT)로 교체. (의존: T1.2, T2.2)

### M3. supabase (DB 마이그레이션 재작업 · Edge Functions · Storage)
설계: RLS를 `auth.uid()`로 재작성, `users`↔`auth.users` 연결, AI Edge Functions, Storage 버킷+만료 정리.
- T3.1 신규 마이그레이션: `users.id`↔`auth.users(id)`, `firebase_uid` 제거, 가입 시 `users` row 생성 트리거.
- T3.2 RLS 정책 전부 `app.current_user_id()`→`auth.uid()` 재작성; `app.user_id` 함수 제거. (의존: T3.1)
- T3.3 세션 오디오용 Storage 버킷 + RLS; `audio_expires_at` 정리(pg_cron 또는 스케줄 Edge Function).
- T3.4 Edge Function `session-respond`: STT→LLM→TTS 오케스트레이션, AI 턴 `session_logs` 기록, 다음 질문+`audio_url` 반환(키 보호). (의존: T3.2)
- T3.5 보조 Edge Functions(session-start/end, chronicle-extract) — 필요 범위만(respond에 통합 가능). (의존: T3.4)

### M4. packages/theme (디자인 토큰 · Figma 핸드오프)
설계: 토큰 단일 소스(색/타이포[어르신 스케일]/간격/라운드/elevation) → 웹 Tailwind + 모바일 NativeWind 공급. Figma 변수명과 1:1. 접근성 기본값(텍스트≥18pt, 터치≥60px) 내장.
- T4.1 토큰 정의(TS/JSON 단일 소스); 네이밍을 Figma Variables와 일치.
- T4.2 웹 어댑터: `tailwind.config.js`가 토큰 소비. (의존: T4.1)
- T4.3 모바일 어댑터: NativeWind preset이 동일 토큰 소비. (의존: T4.1)
- T4.4 공용 프리미티브 계약(Button/Card/Input…) 네이밍 패리티 + 접근성 기본값. (의존: T4.1)

### M5. apps/web (요양보호사 관리 웹)
설계: 현 코드 품질 정리 후 Figma 기반 재구성, core/data 연결, 실인증. 보호자 화면은 목업으로 두고 v2 표기.
- T5.1 **현 코드 baseline 정리**: lint 실패(React Hooks 규칙, `any`, 빈 catch), `ChronicleView` 편집/신규 state 잔존 버그 수정 → `build`·`lint` 통과. (현 코드에서 선행 가능, 의존 없음)
- T5.2 Supabase 인증 + 라우트 가드 연결(목업 로그인 교체). (의존: T2.3)
- T5.3 요양보호사 화면 데이터 연결(대시보드·어르신 CRUD·연대기 CRUD·로그 조회) → data 레이어. (의존: T2.4)
- T5.4 Figma 디자인 도착 시 토큰 기반 재스킨(Tailwind). (의존: T4.2)
- T5.5 보호자 화면은 플래그 뒤로/목업 유지(v2). (의존: T5.3)
- T5.6 웹 배포(Netlify 우선, `netlify.toml` 존재; 팀이 원하면 Vercel).

### M6. apps/mobile (어르신 대화 Expo 앱)
설계: 신규 Expo+NativeWind, 어르신 화면, expo-av 녹음/오디오 재생, core/data/Edge Function 연결, 접근성 강제.
- T6.1 Expo 스캐폴드(expo-router/내비) + NativeWind + theme 토큰. (의존: T0.4, T4.3)
- T6.2 어르신 홈/선택 화면(대형 UI). (의존: T6.1)
- T6.3 대화 화면 상태머신(starting→ai_speaking→mic_ready→listening→processing→ended) — `ConversePage` 로직을 core에서 재사용. (의존: T1.3, T6.1)
- T6.4 오디오: expo-av 녹음(≤60s, m4a/wav) + `audio_url` 재생; `SpeechProvider` 모바일 구현. (의존: T6.3)
- T6.5 세션 파이프라인 연결(start/respond/correct/end) + STT 수정 UI + 오류 상태(마이크 거부·네트워크·STT/TTS 실패·세션 복구). (의존: T3.4, T6.4)
- T6.6 접근성 패스(텍스트≥18pt, 터치≥60px, TTS 자동재생, 고대비). (의존: T6.5)

### M7. AI/STT/TTS 실연동 (목업→실연동)
설계: MockAIProvider→실 provider 교체. 전부 Edge Functions 서버사이드. 프롬프트 설계 + JSON 검증.
- T7.1 LLM(GPT-4o) in Edge Function: 연대기+이력→`{question, topic, switch_topic}` JSON + 검증/1회 재시도. (의존: T3.4)
- T7.2 STT(Whisper/OpenAI transcribe) in Edge Function. (의존: T3.4)
- T7.3 TTS(Clova Voice 기본, OpenAI 대체) → 오디오 Storage 업로드 → `audio_url`. (의존: T3.3, T3.4)
- T7.4 프롬프트 안전 규칙(동일 주제 3회+ 금지, 고통 키워드 부드러운 전환, 짧은 답변 시 쉬운 질문). (의존: T7.1)
- T7.5 core `AIProvider`를 env로 mock↔real 전환; dev/테스트는 mock 유지. (의존: T7.1)

### M8. 퍼블리싱 · 인프라
설계: 시크릿 관리, CI, EAS 빌드/제출, 스토어 메타데이터, 단계적 롤아웃.
- T8.1 시크릿 관리(Supabase 키, provider 키는 Edge Function secrets).
- T8.2 CI: 패키지별 lint/typecheck/test; web 자동배포; 모바일 release 브랜치에서 EAS build.
- T8.3 EAS 설정(bundle id `kr.gieokon.app`, dev/preview/production 프로필) → build/submit.
- T8.4 스토어 메타데이터: 앱명 "기억온", 설명("요양보호사 입력 연대기 기반 AI 회상 대화·기록 보조"), **금지 문구**(치매 치료/의료효과/진단/임상), 개인정보처리방침·이용약관·삭제요청, **AI 음성 고지**, 마이크 권한 문구, 스크린샷(로그인·어르신목록·연대기·대화·로그).
- T8.5 롤아웃: 내부 QA → TestFlight/Play 내부테스트 → 파일럿 기관 → 심사 제출.

## 3. 실행 단계 (의존성 순서 마일스톤)
- **Phase A — 기반**: M0 전체 → M1(core 추출) + M4.1(토큰 정의). 병행 가능: M5.1(현 웹 lint/버그 정리).
- **Phase B — 데이터/인증**: M3.1~3.3(마이그레이션·RLS·Storage) → M2(data·auth) → T2.4(스토어 연결).
- **Phase C — 웹 v1**: M5.2~5.6(인증·데이터 연결·재스킨·배포). [M4.2 웹 토큰 어댑터 선행]
- **Phase D — 모바일 v1**: M6 전체(Expo·대화·오디오·접근성). [M4.3 모바일 토큰 어댑터 선행]
- **Phase E — 실 AI**: M3.4~3.5 + M7(LLM/STT/TTS Edge Functions, mock→real 전환).
- **Phase F — 퍼블리싱**: M8(CI·EAS·스토어·롤아웃).
- 비고: 각 Phase는 별도 PR/커밋으로 분리. Phase C·D는 데이터/인증(B) 위에서 병행 가능. 실 AI(E)는 늦게 붙여도 mock으로 전 구간 개발 가능.

## 4. 검증 / 테스트 계획
- 공통: `pnpm -r build`·`pnpm -r lint`·`pnpm -r test` 통과. 패키지별 typecheck.
- core(M1): 단위테스트 — 첫 질문에 출신지/직업/가족 중 ≥1 반영, 동일 주제 3회+ 없음, 고통 키워드 전환, LLM JSON parse 실패 시 1회 재시도 후 오류.
- data/RLS(M2,M3): 토큰 없음/타인 데이터 접근이 RLS로 차단(다른 user_id 조회 0건), 본인 데이터만 CRUD. Supabase CLI 로컬 적용 후 검증.
- 세션 통합(M6,M7): start→respond→correct→end→logs 조회, 오디오 원본이 STT 후 만료/삭제.
- 모바일 UX: 실기기에서 마이크 권한 거부·네트워크 끊김·STT/TTS 실패 시 사용자 친화 메시지. 텍스트 겹침 없음.
- 성능: STT≤3s, TTS 첫재생≤2s, STT+LLM+TTS≤5s, 프로필 저장≤2s.
- 퍼블리싱: EAS production build 성공, TestFlight/Play 내부테스트 설치, 개인정보·권한·AI 고지 포함.

## 5. 이전 PLAN.md(v1) 대비 변경점
- 백엔드: Node/Express + Firebase Auth → **Supabase-direct + Supabase Auth + Edge Functions**.
- 구조: 단일 Expo 앱(웹은 throwaway) → **웹+모바일 모노레포**, `frontend`는 `apps/web`로 **보존·재사용**.
- 공유 전략 신설: `packages/core|data|theme` — 로직/데이터/토큰 공유.
- 디자인: **Figma 핸드오프 + 디자인 토큰** 추가.
- DB: RLS `app.user_id`→`auth.uid()` 재작성, `firebase_uid` 제거(코드 인증은 아직 목업이라 폐기 손실 없음).
- 인프라: Render(Express)·Firebase 제거; 오디오/실시간은 Supabase Storage/Realtime로.
- 유지: 보호자=v2, 인지활동 보조 포지셔닝, 접근성/성능 제약, 금지 문구, 퍼블리싱 체크리스트.

## 6. 결정 로그
- 2026-05-21: 운영 PostgreSQL은 Supabase로 고정.
- 2026-06-22: **(1) 웹+모바일 하이브리드 모노레포** 채택(웹=요양보호사, 모바일=어르신). **(2) 백엔드 Supabase 중심 단순화**(supabase-js 직접연동 + Supabase Auth + RLS auth.uid() + AI는 Edge Functions; Firebase·Express 폐기). **(3) Figma 핸드오프 + 디자인 토큰 단일 소스**. **(4) 로직 보존(core)·UI 재구성 전략**. **(5) v1=핵심 루프만, 보호자=v2 유지.**

## 7. 가정 / 기본값
- 워크스페이스=pnpm, 모바일 스타일=NativeWind, 단위테스트=vitest를 기본값으로 가정(팀 합의 시 변경).
- Apple Developer·Google Play Console 계정은 퍼블리싱 전 준비.
- v1은 보호자 앱·아바타 꾸미기·음악/미술/인지 치료 미출시(데이터·구조는 호환 유지).
- AI/STT/TTS는 개발 전 구간 mock으로 진행 가능, 실 provider는 Edge Function에서 후반 연결.
