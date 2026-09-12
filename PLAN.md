# PLAN.md — 기억온 개발 계획 (v2: 모노레포 · Supabase 중심 · 웹+모바일 하이브리드)

> **2026-09-12 현재 계획**: [음성 상세](docs/plans/voice-ai-personalization.md)와 [개발 실행안](docs/plans/business-plan-development-delta.md)을 따른다. 초기 Gemini Live 직접 음성 입력·대화 → 서버 검증 텍스트 → Clova TTS, 담당자 시작·회수형 운영이 목표다. 현재 확인 패널·Live 재생 구현과 구분하며 신규 작업은 미완료다. 일지의 최종 확인·공개 승인은 유지한다. 장기 Whisper·Qwen3.5-9B 특화는 독립 자료·평가 후 진행한다.

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
- T3.4 Edge Function `session-respond`(구현 예정): 오디오 이해→확인된 발화→대화 생성→서버 스키마·안전 검증→TTS, AI 턴 기록과 재생 결과 반환. Live 전사와 Structured Outputs를 구분한다. (의존: T3.2; 상세: M7)
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

### M7. 음성 AI·개인화 단계적 전환
설계: 초기 Gemini Live 음성 직접 입력·대화 정책→서버 검증 텍스트→Clova TTS. API별 계약을 분리하고 지원 모델에서만 Structured Outputs를 사용한다. 기존 Live에서의 전환은 앱/서버 변경이 필요하며 장기 GPU 작업은 별도 서비스다.
- T7.1 초기 대화: Gemini 오디오 직접 입력 + 확인된 전사·개인 의미·대화 지원 설정 → 다음 발화 생성. Live를 초기 주 경로로 사용하며 Structured Outputs를 전제하지 않음; 서버 의미·안전 검증 필수. 인지능력 진단 대신 가역적인 지원 방식 조절. (의존: T3.4, 신규 계획 A0~A1)
- T7.2 음성 이해: Gemini Live를 초기 주 경로로 한국어 고령자·사투리·무음·소음 평가. 불명확 구간은 추정하지 않고 확인. 장기에는 적법한 원음–사람 전사로 Whisper 파인튜닝을 비교 검증 후 도입. (의존: T3.4, A0~A3)
- T7.3 TTS: 서버에서 채택·검증한 텍스트만 Clova Voice로 음성화. 재생 전 검증, 공급자 계약에 맞는 음성 수명·재사용 제한, 기기 TTS 대체 경로 검증. Live 원본 음성과 검증 텍스트의 동일성을 가정하지 않는다. (의존: T3.3, T3.4)
- T7.4 안전 정책: 부정 감정·모호 위험·현재 긴급을 구분하고 확인/관찰/긴급 행동 분리. 기존 가드 완화는 안전 평가 후 적용, 중단·개인 선택 존중. (의존: T7.1, M12)
- T7.5 API 어댑터·턴 식별자·교정/취소·재연결·한도 검증. 테스트 더블과 운영을 분리하고 실환경에서 목업 어르신 발화를 생성하지 않는다. (의존: T7.1)
- T7.6 **Live 종단 평가**: 자동 진행·Clova 출력·연결 수명 통제·지연·누적 원가를 검증한다. 초기 Live 선택과 변경분의 출시 가능 판정을 구분한다. (의존: T7.1~T7.5, D1~D5)
- T7.7 개인별 승인 의미 사전·의사소통 프로필·문맥 위험 확인을 구현한다. 학습 동의/보관/철회와 운영 동의를 분리하며 신규 데이터 계약·마이그레이션은 후속 구현.
- T7.8 장기 대화 AI: Qwen3.5-9B를 외부 도구로 SFT/LoRA 학습 → Ollama 추론 검증. 개인 사실은 조회로 주입. Whisper와 독립적으로 평가·전환하며 미달 시 기존 승인 경로 유지. Gemini 출력의 학습 사용은 계약 허용 확인 전 제외한다.

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
**확정 구조(사용자)**: **앱(Expo)** = 요양보호사가 조작하는 세션 실행 도구 — 환자 선택 → 세션 생성(주제 직접 설정 or **AI 자동 추천**) → 기기 전달 → **환자 음성 대화(TTS/STT)** → 종료 시 **AI 자동 요약·분석**(좋았던/저조했던 주제 등) → 저장. 어르신의 매 턴 화면 조작을 전제하지 않으며 음성 중단·도움 요청 경로를 제공한다. **웹** = 관리·분석 허브 — 담당 환자 전체 기록·요약·분석 **실시간(Realtime) 조회**, 세션 설계(직접/AI 추천), 환자 데이터 관리, **보호자 공유 커밋**(외부에 보여줄 데이터 선별·게시 승인 — 커밋된 것만 보호자 대시보드 노출), **AI 에이전트**(대화 세팅·환자 관리·자동 커밋/커밋 위임 보조). Figma 앱 디자인 19화면 확보(파일 `nLfWkg2H7dFfDH1pehcH5I`).
**분석 지표 원칙(비의료 락다운 유지)**: "인지효과/향상" 효능 주장 → **관찰 지표로 순화**(참여도·응답률·발화량 추이·주제별 반응·관심 주제 변화). 레이아웃은 Figma 유지, 문구만 교체.

#### M16. 대화 분석·요약 파이프라인 (AI Analysis)
- **M16.1 스키마**: `session_analyses`(세션별 요약·주제별 반응[호응/저조]·참여 지표·감정 톤·추천 다음 주제 — `core/analysis` SessionAnalysis JSON, 버전 관리) + RLS(조직 범위, **guardian 제외**)·감사. 앱이 종료 시 insert.
- **M16.2 분석 엔진**: ✅ `core/analysis`(비의료 관찰 지표, 테스트 완료) → 실 AI 단계에서 Edge Function `analyze-session`(대화 종료 트리거).
- **M16.3 주제 추천**: ✅ `recommendNextTopics`(연대기+과거 분석 기반) — 앱·웹 공용. 실 AI 단계에서 Edge Function.
- **M16.4 웹 분석 페이지(SCR-W07)**: 개인/전체 분석 화면(Figma 레이아웃 준용, 관찰 지표) + **Supabase Realtime 구독**으로 앱 대화 종료 즉시 반영(새 분석 인앱 배지). 전제: T-E1~3(세션 영속화+Realtime).

#### M17. 보호자 연결·공개 커밋 워크플로 (Guardian Access & Publishing)
- **M17.0 보안 RLS 가드(필수 선행)**: `safety_events_select_org`가 org만 검사 → 보호자가 기관 합류 시 **기관 전체 위기 발췌 열람 가능**(발견된 갭). 마이그레이션으로 guardian 역할 배제(`app.current_org_role() <> 'guardian'`).
- **M17.1 연결 스키마**: `profile_guardians`(환자↔보호자, status pending/approved/revoked·승인자·동의 근거) + `guardian_invites`(**어르신별 1회성·72h 만료 초대 코드**, QR=코드 URL — 검색·요청형은 이름 노출 리스크로 배제) + RLS·감사.
- **M17.2 공개 체크리스트(SCR-W08)**: `guardian_shares`(항목 유형[일지/분석/세션 요약/리포트]·승인자·시점·**철회**) + **일일 체크리스트 UI**(오늘 항목 체크→미리보기→공개하기). RLS: **보호자는 승인된 연결+미철회 커밋만 SELECT**. 감사로그 적재.
- **M17.3 보호자 대시보드 재작성(SCR-W09)**: 커밋된 데이터만 타임라인 렌더. **현 시연용 GuardianLogin/GuardianHome(무인증·전체 어르신 노출) 삭제**, 보호자=Supabase Auth(소셜 로그인, role='guardian') + GuardianGuard.
- **M17.4 가입·라우팅 개편(2026-07-16 인증 개편 반영)**: `handle_new_user`를 **최소 users row(org_id NULL·onboarded_at NULL) 생성**으로 재작업(전 가입자 새 기관+org_admin 강제 폐지) + `users.org_id` **NULL 허용**·`phone`·`onboarded_at` 컬럼 추가. **통합 로그인 + 온보딩 게이트 + 역할 기반 자동 라우팅**(미온보딩→/onboarding, caregiver/org_admin→/caregiver, guardian→/guardian), 랜딩=서비스 소개+소셜 로그인 CTA로 재작성(SCR-W05).
- **M17.5 소셜 로그인(이메일 로그인 제거)**: 로그인 수단을 **구글·카카오·네이버**로 교체하고 **이메일/비밀번호 로그인 제거**(`auth.ts`의 signIn/signUp/sendPasswordReset/updatePassword 제거, `/caregiver/reset`·비번찾기·설정 비번변경 삭제). 구글·카카오=Supabase 네이티브 `signInWithOAuth`. **네이버=비네이티브 → 커스텀 Edge Function `naver-auth`**(OAuth 콜백→프로필→Supabase Admin 사용자 매핑·세션; client secret=서버 보관). 실 키 없을 땐 버튼 비활성+안내(목업).
- **M17.6 온보딩 회원가입(SCR-W12)**: OAuth 최초 로그인 후 **기본정보 입력 폼** — 이름(OAuth 프리필)·전화번호·역할(요양보호사/보호자)·[요양보호사]기관명(신규=org_admin) **또는 어르신 코드(기존 기관 합류·승인 대기)**·[보호자]어르신 코드(선택) + 개인정보·소셜 제3자 동의. 처리=**SECURITY DEFINER RPC `app.complete_onboarding(...)`**(기관 생성/합류·역할·전화 원자적, 코드는 비소진·영속). `AuthProvider`가 users(role·org_id·onboarded_at) 노출·`useCurrentUser()`.
- **M17.7 보호자 어르신 연결(가입+로그인 후 공용)**: 초대코드 사용을 가입에서 분리한 **재사용 RPC `redeem_guardian_invite(p_code)`**(72h·1회성 검증→`profile_guardians` pending) — 온보딩 코드 입력과 **보호자 대시보드 "어르신 연결"**(SCR-W10 확장) 양쪽에서 호출. 최종 승인은 요양보호사(M17.2/SCR-W10). MVP=보호자 1계정↔1기관(멀티org 후속).

#### M18. AI 에이전트 (웹 — 요양보호사 보조 + 보호자 설명)
- **M18.1 도구화**: 도구 3종 — **일지 초안 작성**(M19 연계)·**공개 실행**(M17.2 대행)·**데이터 설명**(보호자용). 서버 검증 포함, **실행 전 사람 확인 게이트** 필수.
- **M18.2 에이전트(SCR-W11)**: 작업 지향 대화 에이전트. ⓐ 요양보호사=일지 초안·공개 대행·요약. ⓑ **보호자=커밋된 데이터만 근거로 기록·분석 설명**(관찰 지표 언어, 진단·효능 표현 금지). MVP=mock provider로 흐름 완성, 실 LLM은 키 이후(무변경 전환). 자율 실행은 후속.

#### M19. 요양일지 (Care Journal — 현직자 1순위 요청, 신규)
- **M19.1 스키마**: `care_journals`(내용·source[photo/voice/typed/ai_draft]·사진 경로·draft/final) + **Storage 버킷 `journal-photos`(private)** + RLS 조직 패턴(guardian 직접 접근 불가 — shares 경유만). **민감정보 취급**(동의·보관파기 정책 적용)·감사.
- **M19.2 작성 UI(SCR-W06)**: 입력 3경로 — **사진 촬영 업로드 / 직접 타이핑 / 구어(음성) 입력**. AI 초안 → **요양보호사 확인 후 저장**(항상).
- **M19.3 실 AI 파이프라인**: 사진→**LLM 비전**(전용 OCR은 보완 옵션)·음성→STT — Edge Function(실 AI 단계, 그 전까지 mock).
- **M19.4 공개 연동**: 일지 → M17.2 공개 체크리스트 항목으로 노출(오늘 일지 공개 흐름).

#### 실행 순서(앱 트랙) — ✅ ①②③ 완료(2026-07-13)
① **B-기반**: 세션·로그 DB 영속화+Realtime → ② M16.1–.2 스키마+mock → ③ 앱 스캐폴드+화면 ✅ → ④ M17+웹 분석 → ⑤ 실 AI(사용자 API 키) → ⑥ M18. (④~⑥은 아래 Phase W로 재편)

#### 🆕 2026-07-13 현직자 인터뷰 반영 — 웹 1차 MVP 재정의 (Phase W)
**입력**: `docs/interview-findings.md`(요구 5건 — 웹 AI 에이전트·초기화면 인증/보호자 접근통제·요양일지·공개 체크리스트·분석 실시간). 인터뷰가 기존 M16/M17/M18을 현장 검증, **신규 M19(요양일지)** 와 **보안 필수(M17.0·M17.4)** 추가.
**위임 결정 4건(확정)**: ① 보호자 본인확인=이메일 가입+승인 게이트 ② 연결=초대 코드+QR 병행(1회성·72h) ③ 일지 사진=LLM 비전 ④ 에이전트=작업 지향 대화형+사람 확인 게이트.
**페르소나 흐름(요약)**: 방문자→소개+로그인 랜딩→역할 자동 라우팅 / 보호자 신규→초대 코드 가입→승인→커밋만 열람 / 요양보호사→대시보드(실시간 배지)→일지 작성→공개 체크리스트→분석 페이지→에이전트 / 앱→웹: 세션 종료→`session_analyses` 저장→Realtime 반영.
**Phase W 실행 순서**: **W1** 인증·접근통제(M17.0→M17.4→**M17.5·M17.6 소셜/온보딩**→M17.1→M17.7) → **W2** 세션 영속화+Realtime(T-E1~3, LogsPage/LogDetail store 잔존 제거 포함) → **W3** 분석 저장·페이지(M16.1→M16.4) → **W4** 요양일지(M19.1→M19.2·19.4) → **W5** 공개 체크리스트+보호자 대시보드(M17.2→M17.3) → **W6** 에이전트(M18, mock).
**MVP 절단선(후속)**: 실 LLM/STT/비전(키 필요 — mock으로 흐름 완성, 연동 시 무변경), 푸시 알림, 강한 본인확인, 에이전트 자율 실행, 보호자 고급 기능.

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
- **Phase W — 웹 1차 MVP(현직자 인터뷰 반영, 2026-07-13 · 인증 개편 2026-07-16)**: W1 인증·접근통제(M17.0·17.4·**17.5·17.6 소셜/온보딩**·17.1·17.7) → W2 세션 영속화+Realtime(T-E1~3) → W3 분석(M16.1·16.4) → W4 요양일지(M19) → W5 공개 체크리스트+보호자 대시보드(M17.2·17.3) → W6 에이전트(M18, mock). 상세: §2′ "웹 1차 MVP 재정의".
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
- 2026-07-13 (현직자 인터뷰 → 웹 1차 MVP 재정의, Phase W): **(A) M19 요양일지 신설**(사진/음성/타이핑 + AI 초안 — 현직자 1순위). **(B) 보안 필수 확정** — 보호자 무인증·광역 접근 제거(M17.0 safety_events guardian 배제 RLS, M17.4 가입 트리거·역할 라우팅·랜딩 개편). **(C) 위임 결정**: 보호자 본인확인=이메일+승인 게이트 · 연결=초대 코드+QR(1회성·72h, 검색형 배제) · 일지 사진=LLM 비전 · 에이전트=작업 지향 대화형+실행 전 사람 확인. **(D) M18에 보호자 설명 에이전트 추가**(커밋 데이터만 근거·관찰 지표 언어). **(E) 인터뷰가 M16/M17/M18 방향을 현장 검증** — `docs/interview-findings.md`.
- 2026-07-16 (인증 개편 — 계획 반영, 코드 미변경): **(A) 로그인=소셜 3종(구글·카카오·네이버)**, **이메일/비밀번호 로그인 제거**(비번찾기·재설정·설정 비번변경 삭제). 구글·카카오=Supabase 네이티브, **네이버=커스텀 Edge Function `naver-auth`**(비네이티브). **(B) 회원가입=OAuth 후 온보딩 폼**(이름·전화·역할·기관명/초대코드 + 동의) — `handle_new_user` 최소 row 재작업·`users.org_id` NULL 허용·`complete_onboarding` RPC. **(C) 보호자↔어르신 연결=초대 코드+QR+요양보호사 승인**(기존 확정 유지) + **로그인 후에도 연결**(재사용 RPC `redeem_guardian_invite`, 보호자 대시보드 "어르신 연결"). **(D) M17.4 개정 + M17.5~M17.7 신설**(§2′). 매핑: SCR-W05/W12(design)·F-32~34·NF-W2(requirements)·T17.5~7(tasks).

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
- 🆕 **현직자 인터뷰 → 웹 1차 MVP 재정의(2026-07-13, 계획 반영 완료)**: 요구 5건 검증·계획화 — M16 개정(분석 페이지+Realtime)·M17 확장(M17.0 보안 RLS·M17.4 가입/라우팅·초대 코드)·M18 개정(보호자 설명 에이전트)·**M19 요양일지 신설**. 실행 = **Phase W1~W6**(§2′·§3). 상세: `docs/interview-findings.md`(반영 완료)·`docs/tasks.md` §3-3.
- 🆕 **인증 개편 계획 반영(2026-07-16, 코드 미변경)**: 소셜 로그인(구글·카카오·네이버)·**이메일 로그인 제거**·**온보딩 회원가입(기본정보 입력)**·**보호자 어르신 연결(가입+로그인 후)** → M17.4 개정·M17.5~17.7 신설(§2′)·SCR-W05/W12(design)·F-32~34·NF-W2(requirements)·T17.5~7(tasks). 구현은 Phase W1.
- ✅ **어르신 영속 코드 + 요양보호사 배정 재설계(2026-07-22, 마이그레이션 20260722100000)**: 담당 요양보호사 변경/추가 시 기존 기록 인계(데이터 연속성). 어르신 단일 소유(profiles.user_id)를 "최초 생성 actor"(nullable·SET NULL)로 낮추고 배정(profile_caregivers) 모델로 전환. `elder_codes`(영속·비소진, 보호자 미열람)·`profile_caregivers` 신설, 자식 복합 FK 완화(쓰기 연속성), 코어+파생 9테이블 RLS 배정 기반 재작성(같은 기관 격리 유지), `claim_elder_by_code`/`link_guardian_by_elder_code`(구 1회성 redeem 대체)/`complete_onboarding` 개정. QR·`/join`·qrcode.react 제거. 사용자 확정 4건(배정 모델 A·같은 기관 한정·읽기+쓰기 완전 연속·QR 제거). 검증: 전 게이트 + 로컬 PG16 RLS 회귀(§5.7 재작성·§5.7b 연속성 신설) + 라우트 스모크 16/16.
- ✅ **후속: 적대적 리뷰 수정 + 요양보호사 기관 합류(승인형)(2026-07-22, 마이그레이션 `20260722110000`·`20260722120000`)**: (1) 리뷰에서 **코드 회전 결정성 버그**(클라이언트 결정적 코드→재회전 시 동일) 발견 → 서버 `rotate_elder_code` RPC(매번 새 난수·권한 게이트), 잔여 QR/초대 카피 정리(죽은 `/join` 안내 제거). (2) 재설계의 인계 기능이 실사용에서 도달 불가했던 공백(온보딩이 항상 새 기관 생성→다른 요양보호사 기관 합류 경로 없음) 해소: 온보딩에서 어르신 코드로 **기존 기관 합류 요청**(`profile_caregivers.status='pending'`)·`approve_caregiver_assignment`(활성 담당/org_admin 승인, **자가승인 3중 차단**)·claim 활성멤버 가드·pending 배너/승인 UI. §5.7b 를 실제 온보딩→pending→자가승인차단→승인→읽기+쓰기 연속성 경로로 재작성(슈퍼유저 우회 제거)·§5.7c(회전) 신설. 전 게이트 재통과.
- ✅ **코드 생성 강화 + 이메일 인증 재도입(2026-07-23, 마이그레이션 `20260722130000`·`20260722140000`)**: (1) 어르신 코드 생성을 `random()`→**CSPRNG(`gen_random_bytes`)** + 혼동문자 없는 30자 알파벳 + 10자로 강화(조사 기반). (2) **이메일(아이디)+비밀번호 로그인 병행 재도입**(2026-07-16 "이메일 제거" 결정 사용자 요청으로 철회): 로그인/회원가입 탭·아이디 찾기(`find_login_email` 마스킹)·비밀번호 찾기/재설정 페이지 신설, `handle_new_user` 가 소셜 **본인인증 전화**를 온보딩에 프리필. 라우트 스모크 21/21. **외부 대기(콘솔·SMTP·OAuth·본인인증 검수)는 `docs/runbooks/go-live-external-setup.md`.**
- ✅ **웹 1차 MVP 구현 완료(2026-07-19, Phase W1~W6)**: **W1** 소셜 로그인 3종(구글·카카오 네이티브 + 네이버 커스텀 Edge Function 스캐폴드)·온보딩 회원가입(complete_onboarding RPC)·보호자 연결(어르신 코드)·승인 워크플로·역할 라우팅·safety_events guardian 배제 → **W2** 세션 기록 DB 배선(LogsPage/LogDetail/대시보드/어르신 상세)+Realtime 구독(useGiokonRealtime)+세션 쓰기 훅 → **W3** session_analyses+분석 페이지(SCR-W07, 실시간·관찰 지표) → **W4** care_journals+요양일지 3경로 작성(SCR-W06)+AI 초안 mock(buildJournalDraft) → **W5** guardian_shares+공개 체크리스트(SCR-W08)+보호자 타임라인(SCR-W09, 철회 즉시 차단) → **W6** AI 에이전트 패널(SCR-W11, mock·도구 3종·사람 확인 게이트). 검증: 전 게이트(typecheck/lint/test 147/build/check:copy)·RLS 회귀(로컬 PG16, §5.6~5.10 신설)·Playwright 라우트 스모크 17/17. 마이그레이션 6종 신설(supabase/migrations/20260718*). 
- ⏳ **잔여(사용자 외부 작업 + 실 AI 단계)**: 서울 리전 프로젝트+마이그레이션 적용+env(M10.1) · 소셜 OAuth 앱 등록(구글·카카오 콘솔, Supabase provider 설정)+네이버 함수 배포(secrets) · 실 LLM/STT/비전 Edge Functions(T16.5·T19.3·T-E2) · 앱(모바일)의 세션 DB 기록 배선(쓰기 훅은 준비됨). 코드는 연동 시 무변경 동작.
- 🔜 **다음**: 사용자 외부 연동 후 라이브 E2E 검증. 병행 후보: M9.3 문서 · M13 접근성 · M15 Claude Design(사용자 확인 후).
- 배포: 웹=Vercel · 모바일=EAS. **디자인(웹·앱)은 외부 협력** + **Claude Design 비교 트랙**(M15).

## 2026-09-12 사업 기획 반영 사항

현장 테스트 전 D1~D5 → 첫 유료 도입 전 D6~D8 → 고객·데이터 확보 후 D9~D11을 실행한다. 일지는 현재 규칙 기반 초안이므로 LLM 완료로 표시하지 않는다. 기본 구독+회상 사용량은 추천안, 가격/포함량 미확정이다. 케어포 연동은 제휴·API 확인 뒤, 전체 업무관리 대체와 GS·의료 연구는 별도 후속 범위다.
