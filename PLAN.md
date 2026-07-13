# PLAN.md — 기억온 개발 계획 (v2: 모노레포 · Supabase 중심 · 웹+모바일 하이브리드)

## 0. 요약
- 제품 방향은 **"AI 기반 인지활동 보조 앱"**. 의료·치료 효과 단정 금지, 회상 대화·기록 보조가 핵심 가치.
- 구조를 **모노레포(웹+모바일 하이브리드)**로 전환한다: `apps/web`(요양보호사 관리 웹), `apps/mobile`(어르신 대화 Expo 앱), 공유 로직은 `packages/*`.
- 백엔드는 **Supabase 중심**으로 단순화: 클라이언트가 supabase-js로 직접 연동, **Supabase Auth + RLS(`auth.uid()`)**, AI/STT/TTS 키 보호는 **Supabase Edge Functions**. Firebase·Express 미사용.
- 전략은 **"로직 보존, UI 재구성"**: 머리 쓴 도메인 로직(타입·스토어·AI 규칙)은 `packages/core`로 살리고, UI는 **Figma 핸드오프 → 디자인 토큰** 기반으로 새로 입힌다.
- v1 범위 = **핵심 루프**: 요양보호사 관리 웹 + 어르신 대화 모바일앱. 보호자 화면·아바타 꾸미기·음악/미술/인지 치료는 **v2**.
- 최종 배포: 웹(Vercel) + 모바일(EAS Build/Submit → TestFlight/Play 내부테스트 → 정식 심사).

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
- **상태 관리**: 서버 상태(profiles/sessions/logs)는 **TanStack Query**가 패칭·캐싱(supabase-js queryFn) → source of truth. **Zustand는 UI/클라이언트 상태만**.
- **키 체계**: Supabase **publishable/secret 키** 사용(레거시 anon/service 키는 2026말 폐기 예정).

### 1.3 보존 vs 재구성
| 레이어 | 현재 | 처리 |
|---|---|---|
| 도메인 타입 `types.ts` | 풍부(일부 v2) | ✅ `core`로 보존 + DB와 정합화(v1/v2 필드 표기) |
| 상태 로직 `store/store.ts` | Zustand | ✅ `core`로 보존하되 **UI/클라이언트 상태 전용**으로 축소. 서버 상태(profiles/sessions/logs)는 **TanStack Query**가 SoT |
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
- T1.2 Zustand는 **UI/클라이언트 상태**(toast·대화 화면 상태 등)만 담당하도록 정리; 서버 데이터는 스토어에서 분리(→`packages/data`의 TanStack Query). (의존: T1.1)
- T1.3 `AIProvider` 인터페이스 정의 + 기존 `lib/ai.ts`를 `MockAIProvider`로 이전(시그니처 유지: generateOpener/generateReply/extractChronicle/generateGuardianReport). (의존: T1.1)
- T1.4 순수 도메인 규칙 이전: 연대기 추출 규칙(RULES), 주제전환 로직, 감정/리포트 생성, utils(uid·날짜·아바타색). (의존: T1.1)
- T1.5 도메인 로직 단위테스트(vitest): 추출 규칙, 주제 3회 반복 방지, 고통 키워드 전환, 리포트 생성. (의존: T1.3, T1.4)

### M2. packages/data (Supabase 데이터·인증)
설계: supabase-js 클라이언트(플랫폼별 storage 어댑터) + **TanStack Query 훅**, Supabase Auth, 생성 DB 타입.
- T2.1 `@supabase/supabase-js` + `@tanstack/react-query` 추가; 클라이언트 팩토리(web=Vite env/localStorage, mobile=Expo env/SecureStore-AsyncStorage), QueryClient/Provider. (의존: T0.4)
- T2.2 스키마→TS 타입 생성; 엔티티별 **TanStack Query 훅(useQuery/useMutation, supabase-js queryFn)** 노출(profiles/chronicles/sessions/logs). 변이 후 관련 쿼리 invalidate. (의존: T2.1, M3)
- T2.3 인증 모듈(signUp/signIn/signOut/**비밀번호 재설정**/session) Supabase Auth; 가입 트리거로 `users` row 부트스트랩. (의존: T2.1, M3)
- T2.4 화면을 data 레이어(TanStack Query)에 연결 — localStorage 영속화를 Supabase(SoT)로 교체. (의존: T1.2, T2.2)

### M3. supabase (DB 마이그레이션 재작업 · Edge Functions · Storage)
설계: RLS를 `auth.uid()`로 재작성, `users`↔`auth.users` 연결, AI Edge Functions, Storage 버킷+만료 정리.
- T3.1 신규 마이그레이션: `users.id`↔`auth.users(id)`, `firebase_uid` 제거, 가입 시 `users` row 생성 트리거.
- T3.2 RLS 정책 전부 `app.current_user_id()`→`auth.uid()` 재작성; `app.user_id` 함수 제거. (의존: T3.1)
- T3.3 세션 오디오용 Storage 버킷 + RLS; `audio_expires_at` 정리(pg_cron 또는 스케줄 Edge Function).
- T3.4 Edge Function `session-respond`: STT→LLM(**Structured Outputs/JSON schema**)→TTS 오케스트레이션, AI 턴 `session_logs` 기록, 다음 질문+`audio_url` 반환(키 보호). (의존: T3.2)
- T3.5 보조 Edge Functions(session-start/end, chronicle-extract) — 필요 범위만(respond에 통합 가능). (의존: T3.4)
- T3.6 **Realtime 스파이크**: OpenAI Realtime(gpt-realtime) ephemeral token 발급 Edge Function + 모바일 PoC로 지연·자연스러움·비용을 파이프라인과 실측 비교. (의존: T3.2)

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
- T5.6 **회원가입·비밀번호 재설정 화면**(Supabase Auth). (의존: T2.3)
- T5.7 어르신 프로필 생성 시 **개인정보 수집 동의** 기록(어르신/보호자 동의 + 동의일 저장; PIPA 대응). (의존: T5.3)
- T5.8 **인앱 계정·데이터 삭제** 요청 흐름(스토어 정책 충족). (의존: T5.3)
- T5.9 웹 배포(Vercel).

### M6. apps/mobile (어르신 대화 Expo 앱)
설계: 신규 Expo+NativeWind. **모바일은 "요양보호사 인증 기기, 대화만 어르신이 조작"** — 요양보호사가 모바일에 로그인 → 어르신 선택 → 세션 시작 → 기기 전달. 어르신은 무인증(기기가 요양보호사 세션 보유). core/data/Edge Function 연결, 접근성 강제.
- T6.1 Expo 스캐폴드(expo-router/내비) + NativeWind + theme 토큰. (의존: T0.4, T4.3)
- T6.2 모바일 **요양보호사 로그인(세션 지속)** + 어르신 선택 화면(대형 UI). (의존: T2.3, T6.1)
- T6.3 세션 시작 + **핸드오프 화면**("어르신께 기기를 전달해 주세요"). (의존: T6.2)
- T6.4 대화 상태머신(ai_speaking→mic_ready→listening→processing→ended) — `ConversePage` 로직을 core에서 재사용. (의존: T1.3, T6.3)
- T6.5 오디오: expo-av 녹음(≤60s, m4a/wav) + `audio_url` 재생; `SpeechProvider` 모바일 구현(**Realtime 호환 심**). (의존: T6.4)
- T6.6 세션 파이프라인 연결(start/respond/correct/end) + STT 수정 UI + **자동 종료**(설계 턴 수 도달/침묵 타임아웃; 요양보호사 부재 시 1차 종료 수단) + 오류 상태(마이크 거부·네트워크·STT/TTS 실패·세션 복구). (의존: T3.4, T6.5)
- T6.7 접근성 패스(텍스트≥18pt, 터치≥60px, TTS 자동재생, 고대비). (의존: T6.6)

### M7. AI/STT/TTS 실연동 (목업→실연동)
설계: MockAIProvider→실 provider 교체. 전부 Edge Functions 서버사이드. **모델은 고정하지 않고 현행 프런티어를 벤치마크**. **Structured Outputs** 사용(파싱 실패 자체를 제거).
- T7.1 LLM(**현행 프런티어 벤치마크**: GPT-5.x/Gemini 3/Claude 등 한국어 품질·지연·비용 비교) in Edge Function: 연대기+이력→**Structured Outputs(JSON schema: {question, topic, switch_topic})**. (의존: T3.4)
- T7.2 STT: **gpt-4o-transcribe**(Whisper-v3 대비 WER↓) in Edge Function; 사투리·노인 발화는 Clova Speech 보완. (의존: T3.4)
- T7.3 TTS(Clova Voice 기본, OpenAI/ElevenLabs 대체) → 오디오 Storage 업로드 → `audio_url`. (의존: T3.3, T3.4)
- T7.4 프롬프트 안전 규칙(동일 주제 3회+ 금지, 고통 키워드 부드러운 전환, 짧은 답변 시 쉬운 질문). (의존: T7.1)
- T7.5 core `AIProvider`를 env로 mock↔real 전환; dev/테스트는 mock 유지. (의존: T7.1)
- T7.6 **Realtime 평가**(T3.6 스파이크 결과): 지연·자연스러움·비용·통제 비교 후 v1 대화 백엔드 채택 여부 결정(미채택 시 v2). (의존: T3.6)

### M8. 퍼블리싱 · 인프라
설계: 시크릿 관리, CI, EAS 빌드/제출, 스토어 메타데이터, 단계적 롤아웃.
- T8.1 시크릿 관리(Supabase 키, provider 키는 Edge Function secrets).
- T8.2 CI: 패키지별 lint/typecheck/test; web 자동배포; 모바일 release 브랜치에서 EAS build.
- T8.3 EAS 설정(bundle id `kr.gieokon.app`, dev/preview/production 프로필) → build/submit.
- T8.4 스토어 메타데이터: 앱명 "기억온", 설명("요양보호사 입력 연대기 기반 AI 회상 대화·기록 보조"), **금지 문구**(치매 치료/의료효과/진단/임상), 개인정보처리방침·이용약관·삭제요청, **AI 음성 고지**, 마이크 권한 문구, 스크린샷(로그인·어르신목록·연대기·대화·로그).
- T8.5 롤아웃: 내부 QA → TestFlight/Play 내부테스트 → 파일럿 기관 → 심사 제출.

## 2′. 엔터프라이즈·정부심사 대비 신규 트랙 (M9–M15)
> 목표: **출시 즉시 트래픽 감당 상용 서비스 + 엔터프라이즈급 데이터보호·보안 + 깐깐한 정부심사 통과·초과**.
> 근거: 규제 리서치(PIPA·성년후견 동의공백·데이터 국내보관·SaMD 비의료 경계·KWCAG·안전성확보조치·AI기본법 2026·앱스토어 건강정책). 상세·출처는 `docs/{compliance,security,infrastructure,ai-safety,accessibility}.md`.

### M9. 컴플라이언스·개인정보 (Compliance & Privacy) — 근거 `docs/compliance.md`
- M9.1 `consents` 테이블 + 동의 아키텍처: 민감정보(건강·음성) **별도 동의**, 국외이전 동의, 마케팅 분리, 음성동의 녹취 보관.
- M9.2 동의능력·대리동의: 어르신 의사능력 판정 → 경증=본인동의 / 무능력=**성년후견인(법정)** 확인 + 후견 미개시 시 보호자 확인·위험고지·최소수집. (PIPA 법정대리인=만14세 미만 전용 → 성인은 민법 후견체계로만 대리; 회색지대 보완.)
- M9.3 개인정보 처리방침(제30조 8항목 + 위탁 + 국외이전)·이용약관·파기정책 문서 + 웹/앱 노출.
- M9.4 정보주체 권리: 인앱 **열람·정정·삭제·다운로드(이동)** + 삭제 처리 SLA.
- M9.5 데이터 거버넌스: 음성 원본 즉시/N일 삭제, 대화로그 보관·자동파기(pg_cron), 데이터 분류·처리목록(ROPA).
- M9.6 SaMD 비의료 락다운: 전 카피 표현 감사 + 면책문구 상시 노출; **식약처·복지부 유권해석은 외부 자문**.
- M9.7 PIA 협조 산출물(공공 운영 대비) + **CPO 지정**(초기 대표/실무자, 지정 자체는 개발 외).

### M10. 보안·데이터 인프라 (Security, 엔터프라이즈급) — 근거 `docs/security.md`
- M10.1 **데이터 국내화**: Supabase **서울(ap-northeast-2) 신규 프로젝트** + 스키마/RLS/데이터 이전 + 앱 재배선 + 도쿄 폐기.
- M10.2 「안전성 확보조치 기준」 매핑: 저장(민감 컬럼)·전송 암호화, 접속기록(`audit_log`, 2년), 접근통제·MFA 옵션·세션/비번 정책.
- M10.3 RLS·RBAC 강화 + **pgTAP 회귀 테스트**(타 조직·타 사용자 차단), service key 격리, Edge Function JWT 검증.
- M10.4 시크릿·키 관리·로테이션(provider 키 서버사이드 전용).
- M10.5 SCA/SAST/secret-scan CI + **침투테스트** + 보안사고(IR) 플레이북.
- M10.6 인증 로드맵: ISMS-P(자율·B2G 가점)·CSAP(공공조달) — **심사는 외부**.

### M11. 확장성·신뢰성 (Scale & Reliability) — 근거 `docs/infrastructure.md`
- M11.1 인덱스·N+1 제거·**커넥션 풀링(Supavisor)**·읽기 캐싱(CDN).
- M11.2 음성 파이프라인 동시성·타임아웃·재시도·**레이트리밋/쿼터**(세션·사용자·기관).
- M11.3 **k6 부하테스트**·용량계획·오토스케일, 부하 하 성능 SLO(STT≤3s/TTS≤2s/E2E≤5s).
- M11.4 PITR·정기 백업·**복구 리허설**·RTO/RPO.
- M11.5 스테이징·카나리·무중단 마이그레이션·롤백.
- M11.6 AI/STT/TTS 사용량 상한·알림·서킷브레이커(비용 가드레일).

### M12. AI 안전·신뢰성 (AI Safety & Trust) — 근거 `docs/ai-safety.md`
- M12.1 위기(자살·자해·학대·응급) 표현 감지 → **사람(보호자/기관) 에스컬레이션** + 안전안내 + 로깅(진단 아님).
- M12.2 입출력 유해·부적절·환각 필터, 의학적 조언 회피, 거절·종료 옵션.
- M12.3 투명성(AI기본법 2026): "AI가 응답합니다" **사전 고지** + 생성물 표시; 해외 LLM 국내대리인·데이터 고지.
- M12.4 로그 human-in-the-loop 검수, 안전 평가셋·레드팀, 모델 교체 시 회귀평가.

### M13. 접근성·품질 (Accessibility & Quality) — 근거 `docs/accessibility.md`
- M13.1 **KWCAG 2.2(33 검사항목)** 웹·모바일 + 어르신 UX(≥18pt·≥60px·고대비·음성 우선) 강제.
- M13.2 웹접근성 품질인증 로드맵(심사 외부), axe CI 게이트, 스크린리더·명도대비 수동 점검, 어르신 사용성 테스트.
- M13.3 단위(vitest)+통합+**E2E(Playwright)**+RLS(pgTAP)+접근성(axe) CI 필수 게이트.

### M14. 조직·멀티테넌시·RBAC (Organizations & Tenancy) — **v1 필수(사용자 승인)**
- M14.1 `organizations` + `users.org_id` + 역할(**org_admin/caregiver/(guardian)**); 전 테이블 RLS를 **조직+역할** 기준으로 확장(본인+동일조직); 가입 시 기본 조직 자동 생성.
- M14.2 기관 온보딩·요양보호사 초대·권한, 기관 단위 통계(A-01~03 상향), DPA/MOU 기록.
- M14.3 보호자(guardian) 접근: 동의·권한 모델 선반영, 화면은 후속(v1.x).

### M15. Claude Design 프론트엔드 트랙 (웹+앱 UI 자체 구현)
- M15.1 디자인 시스템: `packages/theme` 토큰(색/타이포[어르신 스케일]/간격/라운드/elevation/모션) + **접근성 내장 컴포넌트**(웹 Tailwind/모바일 NativeWind 패리티).
- M15.2 웹 UI 전면 구현: SCR-W01~W04 + 동의·삭제·회원가입/비번재설정·기관관리·AI고지 화면(반응형·KWCAG, 최신 트렌드).
- M15.3 모바일 UI 전면 구현: SCR-01~07(핵심=대화화면), 어르신 접근성 최우선.
- M15.4 비교 산출물: 프리뷰 배포(Vercel 웹/EAS 앱) + 비교표(접근성 KWCAG·성능 Lighthouse/CWV·일관성·구현충실도·코드품질)로 외부 업체본과 side-by-side.

**기존 M0–M8 강화**: M3(서울 리전·`consents`/`audit_log`/`organizations` 스키마·Edge Function 보안), M7(M12 안전·투명성 통합), M8(CI 보안·접근성·pgTAP 게이트·스토어 건강정책·비의료 면책).

### 🆕 2026-07-12 앱·웹 아키텍처 확정 + 신규 트랙 M16–M18
**확정 구조(사용자)**: **앱(Expo)** = 요양보호사가 조작하는 세션 실행 도구 — 환자 선택 → 세션 생성(주제 직접 설정 or **AI 자동 추천**) → 기기 전달 → **환자 음성 대화(TTS/STT)** → 종료 시 **AI 자동 요약·분석**(좋았던/저조했던 주제 등) → 저장. 환자는 앱을 조작하지 않는다. **웹** = 관리·분석 허브 — 담당 환자 전체 기록·요약·분석 **실시간(Realtime) 조회**, 세션 설계(직접/AI 추천), 환자 데이터 관리, **보호자 공유 커밋**(외부에 보여줄 데이터 선별·게시 승인 — 커밋된 것만 보호자 대시보드 노출), **AI 에이전트**(대화 세팅·환자 관리·자동 커밋/커밋 위임 보조). Figma 앱 디자인 19화면 확보(파일 `nLfWkg2H7dFfDH1pehcH5I`).
**분석 지표 원칙(비의료 락다운 유지)**: "인지효과/향상" 효능 주장 → **관찰 지표로 순화**(참여도·응답률·발화량 추이·주제별 반응·관심 주제 변화). 레이아웃은 Figma 유지, 문구만 교체.

#### M16. 대화 분석·요약 파이프라인 (AI Analysis)
- **M16.1 스키마**: `session_analyses`(세션별 요약·주제별 반응[호응/저조]·참여 지표·감정 톤·추천 다음 주제, Structured Outputs 스키마 고정) + RLS(조직 범위)·감사.
- **M16.2 분석 엔진**: `core`에 분석 스키마·프롬프트(비의료 관찰 지표) + mock 분석기 → Edge Function `analyze-session`(대화 종료 트리거).
- **M16.3 주제 추천**: 연대기+과거 분석 기반 다음 세션 주제 추천(`core` mock + Edge Function `recommend-topics`) — 앱·웹 공용.
- **M16.4 대시보드**: 웹 분석 화면(개인/전체/주제별 — Figma 레이아웃 준용, 관찰 지표) + 앱 분석 화면 데이터 공급.

#### M17. 보호자 공유 커밋 워크플로 (Guardian Publishing)
- **M17.1 스키마**: `profile_guardians`(환자↔보호자 연결·동의 근거) + `guardian_shares`(커밋 항목: 대상·유형[요약/리포트/기록]·승인자·시점·철회) + RLS(**보호자는 커밋된 것만**).
- **M17.2 웹 커밋 UI**: 기록·요약·분석에서 선택 → 미리보기 → 커밋/철회. 감사로그 적재.
- **M17.3 보호자 대시보드 재정비**: 커밋된 데이터만 렌더(현 시연용 GuardianHome 대체), 보호자 계정=Supabase Auth(role='guardian').

#### M18. AI 에이전트 (웹 — 요양보호사 보조)
- **M18.1 도구화**: 세션 생성/수정·주제 추천·커밋 실행을 서버 검증 포함 tool로 노출.
- **M18.2 에이전트**: 웹 대화형 에이전트(자연어 → 세션 세팅·환자 관리·커밋 실행/위임 제안 → 사람 확인 후 실행). v1은 버튼식(요약 보기·추천 받기), v1.5에서 대화형.

#### 실행 순서(앱 트랙)
① **B-기반**: 세션·로그 DB 영속화(mutation 훅)+Realtime 구독(웹 실시간 대시보드) — 서버 없이 코드·로컬 PG 검증 가능 → ② M16.1–.2 스키마+mock → ③ **앱 스캐폴드+화면 구현**(Expo·NativeWind, Figma 토큰 추출, 컴플라이언스 화면[동의 게이팅·AI 고지·위기 배너] 추가) → ④ M17 커밋 워크플로+웹 분석 화면 → ⑤ 실 AI 연동(Phase M: STT/TTS/LLM·analyze-session — **사용자 API 키 필요**) → ⑥ M18 에이전트.

## 3. 실행 단계 (의존성 순서 마일스톤)
- **Phase A — 기반**: M0 전체 → M1(core 추출) + M4.1(토큰 정의). 병행 가능: M5.1(현 웹 lint/버그 정리).
- **Phase A+ — 실음성 수직 슬라이스(리스크 조기 검증)**: 목업이 아닌 **실제** (연대기 1건 → 실 STT → 실 LLM → 실 TTS → 1턴)을 최소 Edge Function + 모바일 PoC로 **실기기 실측**(지연 ≤5s, 노인 한국어 인식률). **Realtime 스파이크(T3.6) 동시 비교.** 핵심 음성 품질·지연 리스크를 UI 완성 전에 검증한다. (의존: M3.1~3.2 일부)
- **Phase B — 데이터/인증**: M3.1~3.3(마이그레이션·RLS·Storage) → M2(data·auth) → T2.4(스토어 연결).
- **Phase C — 웹 v1**: M5.2~5.6(인증·데이터 연결·재스킨·배포). [M4.2 웹 토큰 어댑터 선행]
- **Phase D — 모바일 v1**: M6 전체(Expo·대화·오디오·접근성). [M4.3 모바일 토큰 어댑터 선행]
- **Phase E — 실 AI**: M3.4~3.5 + M7(LLM/STT/TTS Edge Functions, mock→real 전환).
- **Phase F — 퍼블리싱**: M8(CI·EAS·스토어·롤아웃).
- **Phase G — 데이터 주권·보안 기반**: M10.1 서울 리전 이전 → M10.2 암호화·감사로그 → M14.1 조직/RBAC + RLS 확장 → M10.3 pgTAP 회귀. (다른 Phase의 선행 토대)
- **Phase H — 컴플라이언스**: M9(동의·대리동의·처리방침·파기·정보주체 권리·비의료 락다운·PIA/CPO 산출물).
- **Phase I — AI 안전**: M12(위기 에스컬레이션·가드레일·투명성).
- **Phase J — 접근성·품질·CI**: M13(KWCAG·E2E·axe·pgTAP CI 게이트).
- **Phase K — 확장성·신뢰성**: M11(부하·풀링·백업/DR·SLO·비용 가드레일).
- **Phase L — Claude Design 프론트엔드**: M15(디자인시스템→웹→앱→외부 업체본 비교).
- 비고: 각 Phase는 별도 PR/커밋으로 분리. **엔터프라이즈 목표 순서 = 데이터 주권·보안·컴플라이언스(G·H)를 먼저 세우고 그 위에 AI안전·접근성·스케일·디자인(I~L)·실AI(E)·퍼블리싱(F)을 얹는다.** 실 AI(E)는 mock으로 전 구간 개발 가능.

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
- 2026-06-23 (사전 검토 반영): **(A) AI 스택 현행화** — 모델명 고정 해제(현행 프런티어 벤치마크), STT→gpt-4o-transcribe, **Structured Outputs**, Supabase publishable/secret 키. **(B) TanStack Query 도입**(서버상태) + Zustand(UI상태). **(C) 누락 흐름 추가** — 모바일 요양보호사 인증·세션 핸드오프·자동 종료, 회원가입/비밀번호 재설정, 개인정보 수집 동의, 인앱 계정·데이터 삭제. **(D) 개발 순서 조정** — Phase A+ 실음성 수직 슬라이스 + **Realtime 스파이크**(파이프라인 v1, 결과 따라 전환).
- 2026-07-02: **(1) 디자인은 외부 협력** — 웹·앱 모두 UI 디자인(비주얼·Figma·디자인 토큰·재스킨)은 외부에서 진행. 내부 개발은 기능·로직·데이터·인증에 집중하며, 디자인 작업은 별도 요청 시에만 착수. **(2) 개발은 main 브랜치에 직접 커밋.**
- 2026-07-03 (엔터프라이즈·정부심사 대비 전면 재계획): 목표를 **출시 즉시 트래픽 감당 상용 서비스 + 엔터프라이즈급 데이터보호·보안 + 깐깐한 정부심사 통과·초과**로 상향. **(A) 신규 트랙 M9–M15**(컴플라이언스·보안·확장성·AI안전·접근성·조직RBAC·Claude Design). **(B) 데이터 국내 보관** — Supabase **서울(ap-northeast-2)** 이전(도쿄 폐기). **(C) 멀티테넌시** — `organizations`+RBAC를 **v1 스키마 선반영**. **(D) Claude Design 트랙** — Claude가 웹·앱 프론트를 최신 트렌드 기반 직접 구현해 외부 업체본과 비교(이 트랙 한해 "디자인 외부 위임" 해제). **(E) 비의료 포지셔닝 락다운 + AI기본법(2026) 투명성**. 개발 외(법무·유권해석·CPO·인증)는 **외부 자문 처리**.

## 7. 가정 / 기본값
- 워크스페이스=pnpm, 모바일 스타일=NativeWind, 서버상태=TanStack Query, UI상태=Zustand, 단위테스트=vitest를 기본값으로 가정(팀 합의 시 변경).
- LLM은 단일 모델 고정 대신 **현행 프런티어 벤치마크 후 선정**(한국어 품질·지연·비용). `AIProvider` 추상화로 교체 용이.
- 어르신 대화 백엔드는 **파이프라인 v1**으로 출발하되 **Realtime(speech-to-speech) 스파이크** 결과에 따라 전환 가능(심을 호환 설계).
- Apple Developer·Google Play Console 계정은 퍼블리싱 전 준비.
- v1은 보호자 앱·아바타 꾸미기·음악/미술/인지 치료 미출시(데이터·구조는 호환 유지).
- AI/STT/TTS는 개발 전 구간 mock으로 진행 가능, 실 provider는 Edge Function에서 후반 연결.

## 8. 진행 현황 (2026-07-03 기준)
- 🆕 **2026-07-03 목표 상향**: 엔터프라이즈 상용 서비스 + 깐깐한 정부심사 통과 기준으로 전면 재계획 → 신규 트랙 **M9–M15**(§2′) · **Phase G–L**(§3) · 서울 리전 · 멀티테넌시(A) · Claude Design 확정. 상세 근거는 `docs/{compliance,security,infrastructure,ai-safety,accessibility}.md`(신설 예정).
- ✅ **Phase A (기반)**: 모노레포(M0) · `packages/core`(M1, 단위테스트 7) · `packages/theme` 토큰 정의(M4.1) · 현 웹 lint/버그 정리(M5.1) 완료.
- ✅ **Phase B (데이터/인증)**: `auth.uid()` RLS 마이그레이션(M3.1·3.2)을 **라이브 프로젝트(Supabase `GiokOn`)에 적용·검증 완료** — 5개 테이블·RLS·정책(auth.uid ×18)·가입 트리거(`public.users` 자동 생성)까지 라이브 확인. `packages/data`(M2: supabase-js + TanStack Query 훅 · Supabase Auth · DB↔도메인 매퍼, 단위테스트 12).
- ✅ **웹 인증 (M5.2)**: 목업 로그인 → Supabase Auth + 라우트 가드 교체. 회원가입/로그인 실동작 검증(랜덤 자격증명 실패, 가입 시 `public.users` 생성 확인).
- ✅ **T2.4(A) 슬라이스**: 어르신(profiles)·연대기(chronicles) CRUD를 Supabase에 연결(세션·대화는 Phase E/M로 이연).
- 🆕 **Phase G/H DB 기반 (작성·실검증 완료, 서울 적용 대기)**: 마이그레이션 3종 작성 + **로컬 PostgreSQL 16으로 전체 순차 적용·기능 검증 통과**.
  - **M14.1·M10.4** `organizations`·RBAC(org_admin/caregiver/guardian)·org_id 비정규화·가입 시 기관 자동생성·백필·**조직 단위 RLS**(타 기관 접근 0건, 역할 범위 검증).
  - **M10.3** `audit_log`(처리기록 트리거 5테이블·2년 보관·기관관리자 열람·pg_cron 파기).
  - **M9.1** `consents`(민감정보 별도동의·국외이전·대리동의+의사능력·철회 이력, 삭제 불가).
  - **T10.4/M13.3** RLS·RBAC·격리 **회귀 테스트 + 로컬/CI 러너**.
- 🆕 **M12 노인 특화 대화 안전 설계 (전면 완성, 2026-07-11)**: 발화를 8가지 상황(위기 3분류·고통·중단·거부·혼란·애도·침묵·일반)으로 분류, **근거 기반 대응**(생명 우선·validation·교정 금지·자기결정·비의료·상태 신호 기반 진행 — 고정 카운터 폐지). `core/{safety,ai,conversation}.ts` 재설계 + **실 LLM 시스템 프롬프트·Structured Outputs 스키마**(`core/prompt.ts`, 3중 방어 OR 결합) + **`safety_events` 영속화**(기관 공유 RLS·확인 이력·삭제 불가) + 웹 대화 화면 배선(알림 배너·AI 고지·마무리 권고). 상세: `docs/ai-safety.md`. 테스트 114(세션 시뮬레이션 8종 포함)·RLS 회귀 통과.
- 🆕 **M9 컴플라이언스 백엔드 토대 (완료)**: `core/consent`(동의 카탈로그 SoT·온보딩/세션 게이팅)·`core/subject-rights`(이동권 산출물·삭제 계획)·`data` 훅(consents/org)·`consents.user_id` 보존 SET NULL 마이그레이션·`docs/compliance.md` ROPA/보관파기/삭제절차. **M9.6 비의료 락다운**: 카피 정정 + `check:copy` CI 게이트. 단위테스트 +15.
- 🆕 **CI (완료)**: GitHub Actions `ci.yml` — quality(typecheck/lint/**check:copy**/test/build)·rls-regression(실 PG)·security-audit(SCA). (T8.2·T10.6·T13.3·M9.6)
- 🆕 **웹 대시보드 개발 완료(2026-07-11)**: 연동 외 전 기능 — 동의 수집·게이팅(대리동의·의사능력·위험고지), 안전 알림 대시보드·확인 처리·어르신별 이력, 기관 관리(/caregiver/org), 설정·정보주체 권리(/caregiver/settings — 데이터 다운로드·삭제 절차 안내), 처리방침·약관 초안(/privacy·/terms), 비밀번호 재설정, AI 생성물 표시, 접근성 기본기. **Supabase 연동 시 코드 변경 없이 동작**(미연동 데모는 안내·우회). Playwright 라우트 스모크 통과.
- ⏳ **차단(사용자 필요) — M10.1 데이터 국내화**: 서울 리전(ap-northeast-2) 신규 프로젝트 생성 + 마이그레이션 7종 적용 + 앱 재배선 + 도쿄 폐기. 가이드: `docs/runbooks/seoul-region-migration.md`. (컨테이너 egress가 `*.supabase.co` 차단 → 대시보드/CLI로 사용자 적용 필요.)
- ✅ **모바일 앱 착수·1차 구현 완료(2026-07-13)**: Figma 파일(`nLfWkg2H7dFfDH1pehcH5I`, 19화면)에서 토큰·구조·스크린샷 추출 → `apps/mobile`을 **Expo SDK 53 + expo-router + NativeWind 4**로 스캐폴드하고 19화면 전부 구현(T-APP1~3, `docs/tasks.md §3-3`). 백엔드는 **웹과 공용 재사용**(`core` 대화 안전엔진·`analyzeSession`·consent, `data` 훅) — 앱은 프론트만 신규. **비의료 순화**: Figma "인지효과분석·23% 향상"을 관찰 지표(참여·응답률·발화량·주제 반응)로 교체(`check:copy` 통과). **컴플라이언스 화면 추가**(Figma 미포함): 동의 게이팅(`core/consent`)·AI 이용 사전 고지 배너·위기 감지 요양보호사 배너(`respondToUserTurn` escalate). `theme`에 Figma 확정 토큰(`figma`) 추가. 검증: typecheck·lint·test(core 123·data 12)·web build·`check:copy` 통과 + **Metro iOS 번들 성공(1146 모듈)**. 실 STT/TTS/LLM·Supabase 연동은 사용자 키/서울 리전 후(미설정 시 목업 동작).
- 🔜 **다음 후보(라이브 DB 불필요)**: M9.3 처리방침·약관·파기정책 문서 · M13 접근성(KWCAG) · **M15 Claude Design 프론트**(디자인 방향 사용자 확인 후 착수 권장).
- 배포: 웹=Vercel · 모바일=EAS. **디자인(웹·앱)은 외부 협력** + **Claude Design 비교 트랙**(M15).
