# tasks.md

> **2026-09-13 실행 목록**: [DB 제외 개발 목록 N01~N35](plans/non-db-development-backlog.md)에 현재 코드 기반의 신규·보강·검증 작업과 인수 조건·의존성을 정리했다. 음성 중계·자동 턴·기록 출처 계약부터 정하고 기존 R013 이후 보안 과제는 유지한다. 아래 과거 모듈 작업과 중복 구현하지 않으며, 문서 반영을 기능 완료로 표시하지 않는다.

> ## ⚠️ 2026-09-23 기획 변경 — 이 문서보다 새 계획이 우선한다
>
> 제품 정의가 **"요양보호사 업무 보조 도구"** 에서
> **"인지활동 프로그램을 AI가 진행하고, 그 결과가 공단 형식 프로그램 일지 초안으로 자동으로
> 남는 도구"** 로 바뀌었다. 요양보호사는 계획하고 감독하며 확인한다.
>
> **"무엇을 만들지"의 SoT = [`docs/plans/pilot-development-plan.md`](../docs/plans/pilot-development-plan.md)**.
> 이 문서에서 **요양일지·per-caregiver 격리·규칙 기반 대화·직접 Gemini Live** 를 전제한 서술은
> 낡았다. 새 계획과 충돌하면 새 계획을 따른다.

> 🏢 **엔터프라이즈·정부심사 트랙(2026-07-03)**: M0~M8(핵심 루프·파일럿) 위에 상용 출시 기준을 얹는 신규 트랙 **M9~M15**(§3-2)와 **Phase G~N**(§2-2)를 추가. 근거·상세는 `PLAN.md` §2′/§3, `docs/{compliance,security,infrastructure,ai-safety,accessibility}.md`.

> 작업 분해는 `PLAN.md`(v2: 모노레포 · Supabase 중심 · 웹+모바일 하이브리드)를 단일 기준으로 한다. 이 문서는 PLAN.md의 모듈(M0~M8·M9~M15)·Phase(A~F·G~N)를 실행 작업으로 펼친 뷰다. (기존 8주 날짜 일정은 경과하여 의존성 순서 중심으로 대체)

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

### 2-2. 엔터프라이즈·상용 트랙 (Phase G~N, 데이터주권→기능→디자인→스케일 순)

| Phase | 내용 | 포함 모듈 |
|---|---|---|
| **G. 데이터주권·보안기반** | 서울 리전 이전 → 암호화·audit → organizations/RBAC + RLS 확장 + pgTAP 회귀 | M10.1~10.3, M14.1 |
| **H. 컴플라이언스** | 동의·대리동의·처리방침·파기·정보주체권리·비의료 락다운·CPO/PIA | M9 전체 |
| **I. AI 안전** | 위기발화 감지·에스컬레이션·가드레일·투명성 고지 | M12 |
| **J. 접근성·품질·CI** | KWCAG 2.2·E2E(Playwright)·axe·pgTAP CI 게이트 | M13 |
| **K. 확장성·신뢰성** | 커넥션 풀링·레이트리밋·부하테스트·백업/PITR/DR·SLO·비용 | M11 |
| **L. Claude Design 프론트** | 디자인시스템 → 웹 UI → 앱 UI → 외부업체 비교 | M15 |
| **M. 실 AI(강화)** | 기존 Phase E + 안전(M12)·투명성·국외이전 고지 통합 | M3.4~3.5, M7×M12 |
| **N. 퍼블리싱·인증** | 기존 Phase F + ISMS-P/웹접근성 인증·유권해석·스토어 건강정책 | M8 강화 |
| **W. 웹 1차 MVP(인터뷰 반영)** | 인증·접근통제 → 세션영속화+Realtime → 분석 → 요양일지 → 공개·보호자 → 에이전트 | M16~M19, T-E (§3-3 Phase W) |

> 순서 원칙: **데이터 주권·보안·컴플라이언스를 먼저 세우고 그 위에 기능/디자인/AI/스케일을 얹는다.** G는 다른 모든 Phase의 선행(리전·조직·RLS가 바뀌면 하위 전부 영향). 외부 법무·유권해석·CPO·인증 심사는 **외부 자문 처리**(제품/코드 산출물만 본 트랙 책임).

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
| T3.4 | `session-respond` 신규 계약: 오디오 이해→확인→생성→서버 안전 검증→TTS·로그 | T3.2 | 팀장 |
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
| T5.9 | 웹 배포(Vercel) | T5.3 | 팀원 B |

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
| T7.1 | Gemini Live 자동 진행·예외 재확인·개인화 정책 + 서버 검증 | T3.4, A0~A1 | 팀장 |
| T7.2 | Gemini 오디오 직접 입력·불명확 구간 확인·한국어 기준선 평가 → 장기 Whisper 특화 검증 | T3.4, A0~A3 | 팀장 |
| T7.3 | 검증된 텍스트만 Clova TTS → 공급자 계약에 맞는 음성 수명·재사용 제한 | T3.3, T3.4 | 팀장 |
| T7.4 | 문맥 위험 확인·행동 분리·중단 존중·안전 평가 후 기존 정책 전환 | T7.1, M12 | 팀장 |
| T7.5 | API 어댑터·교정/취소·재연결·한도 검증, 운영에서 목업 발화 금지 | T7.1 | 팀장 |
| T7.6 | Live 자동 진행·Clova 재생·연결 수명·누적 원가 종단 검증 | T3.6 | 팀장 |
| T7.7 | 지원 모드·개인 의미 사전·문맥 위험 확인·선택 학습 동의/계보 | A1~A2 | 팀장 |
| T7.8 | 외부 학습 Qwen3.5-9B → Ollama 추론, ASR/LLM 독립 평가·전환 | A3~A5 | 팀장 |

### M8 — 퍼블리싱·인프라 (Phase F)

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T8.1 | 시크릿 관리(Supabase 키·provider 키 Edge Function secrets) | — | 팀장 |
| T8.2 | CI(패키지별 lint/typecheck/test, web 자동배포, 모바일 EAS) | M5, M6 | 팀장 |
| T8.3 | EAS 설정(bundle id `kr.gieokon.app`, 프로필) → build/submit | T8.2 | 팀원 A |
| T8.4 | 스토어 메타데이터·개인정보처리방침·AI 음성 고지·권한 문구·스크린샷 | — | 팀원 B |
| T8.5 | 롤아웃: 내부 QA → TestFlight/Play 내부테스트 → 파일럿 → 심사 제출 | T8.3 | 전원 |

---

## 3-2. 엔터프라이즈·상용 트랙 작업 분해 (M9~M15)

> 상세 근거·기준은 각 신규 문서 참조. 여기서는 실행 태스크·의존성으로 펼친다.

### M9 — 컴플라이언스·개인정보 (Phase H) → `docs/compliance.md`

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T9.1 | `consents` 테이블(유형·버전·시점·주체·근거·철회) + 민감정보(건강·음성) **별도 동의** 마이그레이션 | M14.1 | 팀장 |
| T9.2 | 동의능력 판정 문항 + 대리동의 경로(성년후견/보호자 확인·위험고지·최소수집 폴백) | T9.1 | 팀장 |
| T9.3 | 개인정보 처리방침(제30조 8항목+위탁+국외이전)·이용약관·파기정책 문서 + 웹/앱 노출 | — | 팀원 B |
| T9.4 | 정보주체 권리(열람·정정·삭제·다운로드/이동) 인앱 구현 + 삭제 SLA (T5.8 확장) | T5.8, T9.1 | 팀원 B |
| T9.5 | 데이터 거버넌스: 음성 원본 즉시/N일 삭제, 로그 자동파기(pg_cron), 데이터 분류·ROPA | T3.3 | 팀장 |
| T9.6 | SaMD 비의료 락다운: 전 카피 표현 감사(grep) + 면책문구 상시 노출 + 진단성 배제 | — | 전원 |
| T9.7 | PIA 협조 산출물 + CPO 지정 표기 + 처리방침 공개 (외부 자문 연동) | T9.3 | 팀장 |

### M10 — 보안·데이터 인프라 (Phase G) → `docs/security.md`

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T10.1 | **Supabase 서울(ap-northeast-2) 신규 프로젝트** 생성 + 스키마/RLS/데이터 이전 + 앱 재배선 + 도쿄 폐기 | — | 팀장 |
| T10.2 | 안전성 확보조치 매핑: 민감 컬럼 저장암호화(pgcrypto/KMS)·TLS 강제·비번/세션 정책·MFA 옵션 | T10.1 | 팀장 |
| T10.3 | `audit_log` 테이블·트리거(접속·처리 기록 **2년** 보관) + 정기점검 뷰 | T10.1 | 팀장 |
| T10.4 | RLS·RBAC 강화 + **pgTAP RLS 회귀 테스트**(타 조직·타 사용자 차단 자동검증) + Edge Function JWT 검증 | M14.1 | 팀장 |
| T10.5 | 시크릿·키 관리(Supabase/GitHub Secrets, 로테이션·최소권한, provider 키 서버전용) | — | 팀장 |
| T10.6 | 보안 CI: SCA(의존성)·SAST·시크릿 스캔 + 외부 침투테스트·IR 플레이북·RD 창구 | T8.2 | 팀장 |
| T10.7 | 인증 로드맵 산출물(ISMS-P 자율취득·공공조달 시 CSAP 준비) — 외부 심사 연동 | — | 팀장 |

### M11 — 확장성·신뢰성 (Phase K) → `docs/infrastructure.md`

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T11.1 | 인덱스 점검·N+1 제거·**커넥션 풀링(Supavisor)** + 읽기 캐싱(staleTime/CDN) | T2.2 | 팀장 |
| T11.2 | 음성 파이프라인: Edge Function 동시성·타임아웃·재시도·백프레셔 + **레이트리밋/쿼터**(세션·사용자·기관) | T3.4 | 팀장 |
| T11.3 | **k6 부하테스트**(로그인·CRUD·세션응답) + 용량계획·오토스케일 + 성능 SLO 부하검증 | T11.2 | 팀장 |
| T11.4 | 백업·DR: PITR·정기 백업·**복구 리허설** + 다중 AZ + RTO/RPO 정의 | T10.1 | 팀장 |
| T11.5 | 릴리스 안전: 스테이징 환경·카나리/피처 플래그·무중단 마이그레이션·롤백 절차 | T8.2 | 팀장 |
| T11.6 | 비용 가드레일: AI/STT/TTS 사용량 상한·알림·서킷브레이커 | T11.2 | 팀장 |

### M12 — AI 안전·신뢰성 (Phase I) → `docs/ai-safety.md`

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T12.1 | 위기발화(자살·자해·학대·응급) 감지 → **사람 에스컬레이션** + 안전안내 + 로깅 | T7.1 | 팀장 |
| T12.2 | 입출력 가드레일(유해·부적절·환각 필터, 의학조언 회피, 주제 안전규칙 T7.4 확장, 거절·종료) | T7.4 | 팀장 |
| T12.3 | 투명성(AI기본법 2026): "AI가 응답합니다" 사전고지 + 생성물 표시 + 국외 LLM 처리 고지 | — | 팀원 B |
| T12.4 | 검수·평가: 로그 human-in-the-loop 검수 + 안전 평가셋·레드팀 + 모델 교체 회귀평가 | T12.1 | 팀장 |

### M13 — 접근성·품질 (Phase J) → `docs/accessibility.md`

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T13.1 | KWCAG 2.2(33 검사항목) 준수 — 웹·모바일 + 어르신 UX(≥18pt·≥60px·고대비·음성우선) 강제 | T6.7 | 팀원 A/B |
| T13.2 | 접근성 테스트: axe CI 게이트 + 스크린리더/키보드/명도대비 수동 점검 + 웹접근성 품질인증 로드맵 | T13.1 | 팀원 B |
| T13.3 | 테스트 파이프라인: 단위(vitest)+통합+**E2E(Playwright)**+RLS(pgTAP)+접근성(axe) CI 필수 게이트 | T10.4, T8.2 | 팀장 |

### M14 — 조직·멀티테넌시·RBAC (Phase G) → `PLAN.md` §8 / `docs/database.md`

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T14.1 | `organizations` + `users.org_id` + 역할(`org_admin`/`caregiver`/`guardian`) 스키마 + 가입 시 기본 조직 자동생성 트리거 | T10.1 | 팀장 |
| T14.2 | 전 테이블 RLS를 **본인+동일조직(역할범위)** 로 확장(다른 기관 접근 차단) | T14.1 | 팀장 |
| T14.3 | 기관 온보딩·요양보호사 초대·권한 + 기관 단위 통계(A-01~03 상향) + DPA/MOU 기록 화면 | T14.2 | 팀원 B |
| T14.4 | 보호자(guardian) 접근 범위 결정(v1.x: 동의·권한 모델 선반영, 화면 후속) | T14.2 | 팀장 |

### M15 — Claude Design 프론트엔드 (Phase L) → `docs/design.md`

| ID | 작업 | 의존 | 담당 |
|---|---|---|---|
| T15.1 | 디자인시스템: `packages/theme` 토큰(색/타이포[어르신 스케일]/간격/라운드/모션) + 접근성 내장 컴포넌트(웹 Tailwind·모바일 NativeWind 패리티) | T4.1 | Claude Design |
| T15.2 | 웹 UI 전면 구현(SCR-W01~W04 + 동의·삭제·회원가입/비번재설정·기관관리·AI고지, 반응형·KWCAG) | T15.1 | Claude Design |
| T15.3 | 모바일 UI 전면 구현(SCR-01~07, 핵심=대화화면, 어르신 접근성 최우선) | T15.1 | Claude Design |
| T15.4 | 비교 산출물: 프리뷰 배포(Vercel 웹/EAS preview 앱) + 비교기준표(KWCAG·Lighthouse/CWV·일관성·충실도·코드품질)로 외부업체본 side-by-side | T15.2, T15.3 | Claude Design |

---

## 3-3. 앱·웹 아키텍처 확정 트랙 (M16~M19) — 2026-07-12 · 인터뷰 반영 2026-07-13

> 확정 구조: 앱(Expo)=요양보호사 세션 실행(환자는 대화만) → 종료 시 AI 요약·분석 →
> Supabase Realtime → 웹 관리·분석 허브(조회·세션설계·요양일지·보호자 커밋·AI 에이전트) →
> 보호자 웹(커밋된 것만). 백엔드는 앱·웹 공용. 상세: `PLAN.md` §2′ M16–M19 · "웹 1차 MVP 재정의".
> 🗣️ 2026-07-13 현직자 인터뷰 반영: M17 확장(T17.0·T17.4)·M18 개정(보호자 설명)·**M19 신설(요양일지)**·Phase W 실행 순서. 입력: `docs/interview-findings.md`.
> 🔐 2026-07-16 인증 개편(계획): 소셜 로그인 3종(구글·카카오·네이버)·이메일 로그인 제거·온보딩 회원가입·보호자 어르신 연결(가입+로그인 후) — T17.4 개정·**T17.5~T17.7 신설**.
> ✅ **2026-07-19 웹 1차 MVP 구현 완료(Phase W1~W6)**: 인증·접근통제(W1) → 세션 DB+Realtime(W2) →
> 분석 페이지(W3) → 요양일지(W4) → 공개 체크리스트·보호자 타임라인(W5) → AI 에이전트 mock(W6).
> 검증: typecheck·lint·test(core 135+data 12)·build·check:copy·RLS 회귀(로컬 PG16)·라우트 스모크
> 17/17(`apps/web/scripts/route-smoke.mjs`). 잔여=실 AI·서울 리전 연동(사용자 외부 작업, 절단선 참조).
> 🔑 **2026-07-22 어르신 영속 코드 + 요양보호사 배정 재설계**: 담당 변경/추가 시 기존 기록 인계.
> `elder_codes`(영속·비소진, 보호자 미열람)·`profile_caregivers`(배정) 신설, 자식 복합 FK 완화,
> 코어+파생 9테이블 RLS 배정 기반 재작성(같은 기관 격리 유지), `claim_elder_by_code`/
> `link_guardian_by_elder_code`(구 1회성 redeem 대체). QR·`/join`·qrcode.react 제거. 마이그레이션
> `20260722100000`, 회귀 §5.7 재작성·§5.7b(연속성) 신설, 라우트 스모크 16/16.
> 🔑 **2026-07-22 후속(적대적 리뷰·기관 합류 승인형)**: 마이그레이션 `20260722110000`(enum
> `pending`)·`20260722120000`. (1) 코드 회전 결정성 버그 → 서버 `rotate_elder_code` RPC·잔여 QR
> 카피 정리. (2) **요양보호사 기관 합류 승인형**: 온보딩에서 어르신 코드로 기존 기관 합류 요청
> (`status='pending'`)·`approve_caregiver_assignment`(활성 담당/admin 승인·자가승인 3중 차단)·
> claim 활성멤버 가드·pending 배너/승인 UI. §5.7b 실제 온보딩→승인 경로 재작성·§5.7c(회전) 신설.
> 전 게이트 재통과.

### 선행 — 세션 영속화 + Realtime (Phase E 갭 해소)

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T-E1 | 세션 설계 CRUD 훅(`useCreateSession`/`useUpdateSession`/`useDeleteSession`) — 웹 세션 설계를 store→Supabase | T10.1 | ✅ (2026-07-19 웹 MVP) |
| T-E2 | 세션 런타임 쓰기(start/append-turn/end) 경로 — 앱→Edge Function(provider 보호), 로그 DB 적재 | T16.2 | ⏳ 실AI |
| T-E3 | 웹 Realtime 구독 훅(sessions·session_logs·session_analyses) — 앱 종료 시 대시보드 실시간 반영 | T-E1 | ✅ (2026-07-19 웹 MVP) |

### M16 — 대화 분석·요약 파이프라인 → `core/analysis`

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T16.1 | `session_analyses` 마이그레이션(`core/analysis` SessionAnalysis JSON·버전, RLS 조직범위 **guardian 제외**·감사) — 앱이 종료 시 insert | T14.1 | ✅ (2026-07-19 웹 MVP) |
| T16.2 | 분석 엔진 `core/analysis`(관찰 지표·주제 호응/저조·추천) + Structured Outputs 스키마 | — | ✅ mock 완료 |
| T16.3 | 주제 추천 `recommendNextTopics`(연대기+과거 분석 기반) — 앱·웹 공용 | T16.2 | ✅ mock 완료 |
| T16.4 | **웹 분석 페이지(SCR-W07)**: 개인/전체(관찰 지표) + Realtime 실시간 반영·새 분석 배지 | T16.1, T-E3 | ✅ (2026-07-19 웹 MVP) |
| T16.5 | Edge Function `analyze-session`(대화 종료 트리거, mock→실 전환) | T16.1, 실AI | ⏳ |

### M17 — 보호자 연결·공개 커밋 → `docs/compliance.md`

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T17.0 | **보안 RLS 가드(필수 선행)**: `safety_events_select_org`에 guardian 배제(`current_org_role() <> 'guardian'`) — 보호자 기관 합류 시 위기 발췌 열람 차단 | T14.1 | ✅ (2026-07-19 웹 MVP) |
| T17.1 | `profile_guardians`(연결·pending/approved/revoked·승인자) + `guardian_invites`(**어르신별 1회성·72h 초대 코드**, QR=코드 URL) 마이그레이션 + RLS·감사 | T14.1, T9.1 | ✅ (2026-07-19 웹 MVP) |
| T17.2 | **공개 체크리스트(SCR-W08)**: `guardian_shares`(유형[일지/분석/세션요약/리포트]·철회) + 일일 체크리스트 UI(체크→미리보기→공개) + RLS(보호자=승인 연결+미철회만) + 감사 | T17.0, T17.1 | ✅ (2026-07-19 웹 MVP) |
| T17.3 | **보호자 대시보드 재작성(SCR-W09)**: 커밋 데이터 타임라인만. 시연용 GuardianLogin/Home **삭제**, 보호자=Supabase Auth(role=guardian)+GuardianGuard | T17.2 | ✅ (2026-07-19 웹 MVP) |
| T17.4 | **가입·라우팅 개편(2026-07-16)**: `handle_new_user` 최소 row 재작업(org_admin 강제 폐지)·`users.org_id` NULL 허용+`phone`·`onboarded_at` + 통합 로그인·**온보딩 게이트**·역할 자동 라우팅 + 랜딩 재작성(SCR-W05, 소개+소셜 로그인 CTA) | T17.1 | ✅ (2026-07-19 웹 MVP) |
| T17.5 | **소셜 로그인·이메일 로그인 제거**: `auth.ts` 이메일 4함수 제거→`signInWithProvider(google/kakao)`, **네이버=커스텀 Edge Function `naver-auth`**(비네이티브). `/caregiver/reset`·비번찾기·설정 비번변경 삭제. 소셜 3버튼 UI(SCR-W05) | T17.4 | ✅ (2026-07-19 웹 MVP) |
| T17.6 | **온보딩 회원가입(SCR-W12)**: `/onboarding` 폼(이름·전화·역할·기관명 또는 어르신 코드[합류]·동의) + `app.complete_onboarding` RPC + `AuthProvider` users(role·org_id·onboarded_at) 노출·`useCurrentUser()` | T17.4, T17.5 | ✅ (2026-07-19 웹 MVP · 07-22 합류 승인형) |
| T17.7 | **보호자 어르신 연결(재사용)**: `redeem_guardian_invite(p_code)` RPC(72h·1회성→pending) — 온보딩 코드 입력 + 보호자 대시보드 "**어르신 연결**"(SCR-W10 확장) 공용 | T17.1, T17.6 | ✅ (2026-07-19 웹 MVP) |

### M18 — AI 에이전트(웹) → 요양보호사 보조 + 보호자 설명

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T18.1 | 도구화 3종: **일지 초안**(M19)·**공개 실행**(M17.2 대행)·**데이터 설명**(보호자용) — 서버 검증 + **실행 전 사람 확인 게이트** | T16, T17, T19 | ✅ (2026-07-19 웹 MVP) |
| T18.2 | 작업 지향 대화 에이전트(SCR-W11): 요양보호사=초안·공개 대행·요약 / 보호자=**커밋 데이터만 근거** 설명(관찰 지표 언어·진단 표현 금지). MVP=mock, 실 LLM 무변경 전환 | T18.1 | ✅ (2026-07-19 웹 MVP) |

### ~~M19 — 요양일지 (현직자 1순위 요청, 2026-07-13 신설)~~ → **폐기, M20 프로그램 일지로 대체(2026-09-23)**

> ⚠️ 아래 T19.x 는 당시 기록이다. **T19.3(실 AI 파이프라인, ⏳)은 착수하지 않고 폐기한다** —
> 음성 입력 경로는 "요양보호사 음성 자가기록"(기획서 §5-1 삭제 대상)에 해당하고, 일지 자체가
> 공단 형식 프로그램 일지로 바뀐다. 기존 `care_journals` 데이터는 삭제(사용자 확정).

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T19.1 | `care_journals` 마이그레이션(내용·source[photo/voice/typed/ai_draft]·사진 경로·draft/final) + Storage `journal-photos`(private) + RLS 조직 패턴(guardian 직접 접근 불가) + **민감정보 취급**(동의·보관파기)·감사 | T14.1 | ✅ (2026-07-19 웹 MVP) |
| T19.2 | 작성 UI(SCR-W06): 사진 업로드 / 타이핑 / 음성 입력 3경로 + AI 초안 → **요양보호사 확인 후 저장** | T19.1 | ✅ (2026-07-19 웹 MVP) |
| T19.3 | 실 AI 파이프라인: 사진→LLM 비전·음성→STT Edge Function(그 전 mock) | T19.1, 실AI | ❌ 폐기(2026-09-23) |
| T19.4 | 일지 → 공개 체크리스트(M17.2) 항목 연동 | T19.2, T17.2 | ✅ (2026-07-19 웹 MVP) |

## 3-4. 파일럿 트랙 (M20~M23) — 2026-09-23 기획 변경

> **실행 계획의 SoT = [`docs/plans/pilot-development-plan.md`](plans/pilot-development-plan.md)**.
> 아래 태스크의 "계획" 열은 그 문서의 항목 ID(D=DB · M=앱 · W=웹 · C=연동)다.
> 순서는 계획 §10 의 머지 단위 ①~⑤ 를 따른다 — **①(권한 재설계)이 나머지 전부의 선행**.

### M22 — 권한 재설계 (머지 단위 ①) → `PLAN.md` M22.2
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T22.1 | `org_role` 에 `social_worker`·`center_director` 추가 — ⚠️ **단독 마이그레이션**(같은 트랜잭션에서 신규 enum 값 사용 불가) | D1 | — | ⏳ |
| T22.2 | `org_settings`·`org_capabilities` + 조직 생성 시드(행 없으면 기본집합 폴백) | D3 | T22.1 | ⏳ |
| T22.3 | `app.is_care_team()`·`app.has_capability()` + **9테이블 RLS 기관 단위 전환**(보호자 브랜치 무변경) | D4 | T22.2 | ⏳ |
| T22.4 | `= 'caregiver'` 비교 전면 grep → `is_care_team()` 치환(새 역할이 조용히 빠지는 것 방지) | §11-6 | T22.3 | ⏳ |
| T22.5 | 권한 매트릭스 UI(3종 × 역할) + 기관 설정 | W6 | T22.3 | ⏳ |
| T22.6 | RLS 회귀 단언: 같은 기관 다른 담당자 열람 성공 · 타 기관·guardian 0건 · 신규 역할 동작 · 위임 on/off | §12 | T22.3 | ⏳ |

### M20 — 프로그램 일지 자동 생성 (머지 단위 ②) → `PLAN.md` M20
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T20.1 | `care_journals`·`journal_photos` DROP → `program_journals`(공단 12필드 개별 컬럼)·`program_journal_photos`·`program_journal_revisions`·`journal_generation_jobs` + `care_grade` | D5 | T22.3 | ⏳ |
| T20.2 | 트리거 4종: **확정 가드(`auth.uid() is null` 이면 `final` 불가)** · 확정 후 수정 이력 · 세션 종료 enqueue · 공개 게이트 | D5 | T20.1 | ⏳ |
| T20.3 | `generated-session.ts` 확장 — 공단 필드·보호자 문장 스키마, 금지어 `인지 저하`·`우울`·`정서 불안`·`병원 진료 권장` 추가 | C2 | — | ⏳ |
| T20.4 | `program-journal.ts` 신규 — `mapAnalysisToJournalFields`·`screenJournalDraft`(적중 필드만 비움)·`buildGuardianText` | C2 | T20.3 | ⏳ |
| T20.5 | ⚠️ `session-report` 의 `REPORT_ALLOWED_USER_IDS` 데모 허용목록 → org 게이트(안 하면 파일럿 전원 403) | C4 | — | ⏳ |
| T20.6 | 워커 `program-journal-draft`(큐 소비·지수 백오프·`attempts>5` 실패) — **`pending_review` 까지만** | C4 | T20.2, T20.5 | ⏳ |
| T20.7 | 앱 폴백 저장 순서 정리(세션 생성 → 턴·분석 → `ended`) | M7 | — | ⏳ |
| T20.8 | 웹 프로그램 일지 목록·상세·확정·이력·재시도 + 네비 이름 변경 | W1, W3 | T20.6 | ⏳ |
| T20.9 | 보호자 표현 전환(판정형→기술형·고정 문구·`guardian_text` 만 렌더) + `session_summary` 미렌더 버그 | W4 | T20.8 | ⏳ |

### M21 — 감독 화면 + 대화 단계 (머지 단위 ③) → `PLAN.md` M21·M22.1
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T21.1 | `session_phase` + `sessions` 컬럼 8개 + `session_interventions` + RPC `session_tick`·`advance_session_phase`·`request_session_control` | D6 | T22.3 | ⏳ |
| T21.2 | `session-phase.ts` 신규(`buildPhaseDirective`·`shouldAdvancePhase`) + `prompt.ts` `PROMPT_VERSION='v2.0'` persist | C2 | — | ⏳ |
| T21.3 | 중계: 2초 폴 → `session_tick` · 단계 지시 주입(`resumeContext` 와 같은 경로) · 원격 제어 처리 | C3 | T21.1, T21.2 | ⏳ |
| T21.4 | ⚠️ 중계: `assessUtterance` 적중 시 **`safety_events` 즉시 INSERT**(실시간 푸시의 선결) | C3 | T21.3 | ⏳ |
| T21.5 | 웹 감독 화면(반응형) + 원격 일시정지·재개·종료 | W2 | T21.3 | ⏳ |
| T21.6 | 앱 원격 제어 수신("잠시 쉬어요" + 마이크 중단) | M5 | T21.3 | ⏳ |
| T21.7 | 세션 설계에 목표 시간·단계 미리보기·기관 기본 피할 주제 | W5 | T21.1 | ⏳ |

### M23 — core 정리 + 어르신 표시 모드 (머지 단위 ④, **반드시 한 PR**) → `PLAN.md` M22.1·M23
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T23.1 | `ai.ts`·`voice-flow.ts`·`buildJournalDraft` 삭제 · `respondToUserTurn` → `evaluateUserTurn` 축소 · **안전 계층 유지** | C1 | — | ⏳ |
| T23.2 | 직접 모드 제거 — `RELAY_MODE` 분기 삭제, `EXPO_PUBLIC_VOICE_RELAY_URL` 필수화 | M1 | T23.1 | ⏳ |
| T23.3 | 어르신 표시 모드 분리(`elder.tsx`) + 어르신 화면에서 요양보호사 UI 제거 | M2, M3 | T23.2 | ⏳ |
| T23.4 | 복귀 게이트(숨김 제스처 또는 PIN) | M4 | T23.3 | ⏳ |

### 푸시 (머지 단위 ⑤)
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T21.8 | `push_tokens` + `notifications.pushed_at` + `notification_kind` 확장(단독 파일) | D2, D7 | — | ⏳ |
| T21.9 | 워커 `push-dispatch`(Expo Push) — ⚠️ 본문에 어르신 성함·발화 금지 | C4 | T21.8, T21.4 | ⏳ |
| T21.10 | 앱 푸시 토큰 등록 — ⚠️ EAS 재빌드 필요 | M6 | T21.8 | ⏳ |

### 공통·선결
| ID | 작업 | 계획 | 의존 | 상태 |
|---|---|---|---|---|
| T24.1 | ⚠️ **어르신 동의 부여/철회 UI** — `ElderDetailPage.tsx:434` 가 없는 라우트를 가리킨다. **파일럿 블로커** | W7 | — | ⏳ |
| T24.2 | `product_events` + 삽입 함수 — "시간 절감"의 유일한 증거. **1주차에 넣는다** | D8 | — | ⏳ |
| T24.3 | 어르신 `care_grade` 입력(주간보호 필수) | W8 | T20.1 | ⏳ |
| T24.4 | 동의 버전 단일화(`app.current_consent_version()`) | D10 | — | ⏳ |
| T24.5 | gemini-3.8-live 기준 재검증 — 폴백 상수 2곳·`client.ts` 설계 근거 주석(3.1에서 도출한 제약) | — | — | ⏳ |

### 웹 1차 MVP 실행 순서 (Phase W)

| 순서 | 내용 | 태스크 |
|---|---|---|
| W1 | 인증·접근통제(보안 필수) | T17.0 → T17.4 → **T17.5·T17.6(소셜/온보딩)** → T17.1 → T17.7 |
| W2 | 세션 영속화 + Realtime (+ LogsPage/LogDetail store 잔존 제거) | T-E1 → T-E3 (T-E2는 실AI) |
| W3 | 분석 저장·페이지 | T16.1 → T16.4 |
| W4 | 요양일지 | T19.1 → T19.2 → T19.4 |
| W5 | 공개 체크리스트 + 보호자 대시보드 | T17.2 → T17.3 |
| W6 | AI 에이전트(mock) | T18.1 → T18.2 |

> MVP 절단선(후속): 실 LLM/STT/비전(T16.5·T19.3·T-E2 — 사용자 API 키), 푸시 알림, 강한 본인확인, 에이전트 자율 실행.

### 앱(Expo) 프론트 — Figma 19화면

| ID | 작업 | 의존 | 상태 |
|---|---|---|---|
| T-APP1 | Expo 스캐폴드 + `packages/theme` NativeWind 토큰(Figma 추출) | Figma | ✅ (2026-07-13) Expo SDK 53·expo-router·NativeWind 4, theme `figma` 토큰 추가 |
| T-APP2 | 화면 구현: 스플래쉬·로그인 / 환자 목록·등록·프로필 / 대화 시작 전·대화·수정·저장 / 기록·분석 | T-APP1 | ✅ (2026-07-13) 19화면 구현, core/data 재사용, Metro 번들 검증 |
| T-APP3 | 컴플라이언스 화면 **추가**(동의 게이팅·AI 이용 고지·위기 안내 배너 — Figma 미포함분) | T-APP2 | ✅ (2026-07-13) `consent/[id]`·AI 고지 배너·위기 배너(core escalate) |

---

## 4. 우선순위

| 우선순위 | 작업 그룹 | Phase |
|---|---|---|
| 🔴 Must | 모노레포·core·data/인증·웹 핵심·모바일 대화 루프 | A~D |
| 🟡 Should | 세션 로그·STT 수정·오류 처리·재스킨·실 AI | C~E |
| 🟢 Could | 보호자(v2)·인지자극(v2)·Clova Speech 보완·모니터링 | 이후 |

**상용 출시 기준(엔터프라이즈·정부심사) — 별도 우선순위축.** 파일럿 후 실서비스 전 필수:

| 우선순위 | 작업 그룹 | Phase |
|---|---|---|
| 🔴 출시필수 | 데이터주권(서울 리전)·조직/RBAC·RLS pgTAP·암호화·audit·핵심 동의·비의료 락다운·AI 위기 에스컬레이션·접근성 KWCAG | G, H, I, J, M14 |
| 🟡 출시직후 | 부하테스트·백업/DR·SLO·비용 가드레일·정보주체 권리·Claude Design 비교본 | K, L |
| 🟢 인증·심사 | ISMS-P·웹접근성 품질인증·식약처/복지부 유권해석·CSAP(공공조달) — 외부 자문 연동 | N |

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

### 6-2. 엔터프라이즈·상용 검증 (Phase G~N)

| 단계 | 내용 |
|---|---|
| 데이터 주권 | 서울 프로젝트에 스키마·데이터 이전 완료, 앱이 ap-northeast-2 연결(`get_project` 리전 확인), 도쿄 폐기 |
| RLS/RBAC | pgTAP로 타 조직·타 사용자 접근 0건, 역할별 권한 회귀 통과 |
| 보안 | 민감 컬럼 암호화·audit_log 적재 확인, SCA/SAST/secret-scan CI 통과, 침투테스트 리포트 |
| 컴플라이언스 | 동의 플로우(민감·국외이전·대리) E2E, 처리방침/약관 노출, 삭제/열람 동작, 비의료 카피 잔존 0(grep) |
| AI 안전 | 위기표현 테스트셋 → 에스컬레이션·안전응답, "AI가 응답합니다" 고지 노출 |
| 접근성 | axe 0 violations(핵심 화면), KWCAG 2.2 체크리스트, 스크린리더 스팟체크 |
| 스케일 | k6 목표 부하에서 SLO 충족, 백업 복구 리허설 성공 |
| Claude Design | 웹/앱 프리뷰 배포 + 외부업체 비교표 산출 |

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
- [ ] 웹(Vercel) 배포 확인
- [ ] EAS 최신 빌드 시연 기기 설치 완료
- [ ] Edge Function 웜업 완료(시연 30분 전)

### 발표 준비
- [ ] 시연 시나리오 3회 연속 오류 없이 완료
- [ ] 시연 백업 영상 준비 완료
- [ ] 발표 슬라이드 최종본 확인
- [ ] 시연 기기 화면 밝기 최대 설정

### 엔터프라이즈·상용 출시 (Phase G~N)
- [ ] 전 개인정보 서울 리전(ap-northeast-2) 저장, 도쿄 프로젝트 폐기
- [ ] `organizations`/`org_id`/역할 선반영 + RLS 조직 격리(타 기관 접근 0건, pgTAP 통과)
- [ ] 민감 컬럼 저장암호화 + `audit_log` 2년 보관·트리거 동작
- [ ] 민감정보(건강·음성) **별도 동의** + 대리동의(성년후견/보호자) 경로
- [ ] 개인정보 처리방침(위탁·국외이전 포함)·약관·파기정책 웹/앱 노출
- [ ] 정보주체 권리(열람·정정·삭제·다운로드) 인앱 동작
- [ ] 비의료 카피 잔존 0 + 면책문구 상시 노출
- [ ] AI 위기발화 감지 → 사람 에스컬레이션 + "AI가 응답합니다" 고지
- [ ] KWCAG 2.2 준수 + axe CI 0 violations
- [ ] SCA/SAST/secret-scan/E2E/pgTAP/axe CI 게이트 통과
- [ ] k6 부하테스트 SLO 충족 + 백업/PITR 복구 리허설 성공
- [ ] Claude Design 웹·앱 프리뷰 + 외부업체 비교표

## 2026-09-12 사업 기획 반영 사항 (당시 기록)

현재 우선순위는 개발 실행안 D1~D5(현장 테스트 전), D6~D8(첫 유료 도입 전), D9~D11(독립 데이터·특화 모델·양식/연동)이다. 아래 과거 팀장/팀원 A·B 표기는 당시 분담이며 새 팀 실명으로 임의 치환하지 않는다. 신규 분담 제안은 실행안의 임성훈·박진우·고서연 책임을 사용한다.

## 2026-09-23 기획 변경 반영 사항

**D1~D11 우선순위는 대체됐다** — [`pilot-development-plan.md`](plans/pilot-development-plan.md) §10 머지 단위 5개를 따른다.
M19(요양일지) 계열 태스크는 프로그램 일지(계획 W1·D5)로 대체된다.
팀 표기 규칙(과거 팀장/팀원 A·B 표기는 당시 분담이며 실명으로 치환하지 않음)은 **유지**한다.
