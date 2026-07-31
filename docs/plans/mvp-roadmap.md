# 실서비스 1차 MVP 로드맵 — 태스크 단위 개발 계획

> **목적**: 남은 개발을 **태스크(T#) 단위**로 쪼개고, 각 태스크에서 Claude가 할 수 없는
> **외부 작업은 "완료 후 사용자 요청"으로 핸드오프**하며, **모든 태스크 완료 시 실서비스
> 가능한 1차 MVP에 도달**하도록 설계한 로드맵. 상위 계획은 `PLAN.md`, 외부설정 상세는
> `docs/runbooks/go-live-external-setup.md`, 앱 배선 원본은 `docs/plans/mobile-live-data-wiring.md`.

---

## 0. 현황 (완료 vs 잔여)

**완료(✅)**
- 웹 1차 MVP(Phase W1~W6): 인증·세션기록·분석·요양일지·보호자공유·에이전트(mock). (`PLAN.md §8`)
- 앱 실데이터 배선(Phase 1~5): 인증(Supabase Auth+목업폴백)·읽기 어댑터·세션 영속화(앱→웹)·
  쓰기 어댑터·Realtime 브리지. 미설정 시 목업 동작. (`mobile-live-data-wiring.md`)
- DB 스키마·RLS·배정 모델(마이그레이션 20종), 비의료 카피 락다운, RLS 회귀·라우트 스모크.

**잔여(→ 이 로드맵)**
- 앱 관찰지표 집계 화면 라이브화(목업 결합 잔존), 앱 세션 견고화(자동종료·오류상태).
- 실 AI 파이프라인(STT/LLM/TTS·비전) — 현재 mock/규칙기반, Edge Function 미구현.
- 앱 소셜 로그인, web→app 세션 예약(선택), 배포(Vercel/EAS)·외부 설정.

---

## 1. 개발 방식 (태스크 단위 + 외부 요청 프로토콜)

1. **1태스크 = 1 PR/커밋 단위.** 독립적으로 검증·병합 가능하게 쪼갠다.
2. **각 태스크는 mock으로 완결**(키·서울 리전 없이도 개발·검증). 설정 시 무변경 라이브.
3. **태스크 완료 시 절차**:
   - (a) 코드 완료 → 전 게이트 검증(`typecheck`·`lint`·`test`·`build`·`check:copy` + 필요 시 Metro/RLS/route-smoke) → 커밋·푸시.
   - (b) 그 태스크에 **외부 작업이 걸려 있으면**, 완료 보고와 함께 **"완료 후 외부 요청"** 을
     사용자에게 전달한다(정확한 콘솔 경로·CLI 명령·확인 방법 포함).
   - (c) 사용자가 외부 적용을 완료·확인하면 그 태스크의 라이브 검증을 함께 수행. 미적용이어도
     **다음 태스크 개발은 계속 진행**(mock 기반).
4. **외부 선행(T0)** 은 어떤 라이브 검증보다 먼저 필요하므로 최상단에 둔다.

---

## 2. 태스크 목록 (요약)

| ID | 태스크 | MVP | 담당 | 완료 후 외부 요청 |
|----|--------|-----|------|-------------------|
| **T0** | 서울 리전 Supabase + 마이그레이션 + env | 필수 | **사용자** | (태스크 자체가 외부) |
| **T1** | 관찰지표 집계 라이브화(analytics 순수함수화 + 4화면) | 필수 | Claude | 없음 |
| **T2** | 앱 세션 견고화(자동종료·오류상태·저장 재시도) | 필수 | Claude | 없음 |
| **T3** | 실 STT — 앱 대화(Edge Function `session-stt`) | 후속(실AI) | Claude+사용자 | OPENAI 키·함수 배포 |
| **T4** | 실 LLM — 대화(`session-respond`)·분석(`analyze-session`) | 후속(실AI) | Claude+사용자 | OPENAI 키·함수 배포 |
| **T5** | 실 TTS — Clova Voice(앱 expo-speech→Clova) | 후속(실AI) | Claude+사용자 | CLOVA 키·함수 배포 |
| **T6** | 앱 소셜 로그인 3종 + `naver-auth` 함수 | 선택 | Claude+사용자 | OAuth 콘솔 3종·naver secrets·배포 |
| **T7** | 요양일지 실 STT/비전(stt-transcribe 배선 + 사진 LLM) | 후속(실AI) | Claude+사용자 | CLOVA/OPENAI 키·Storage 버킷·배포 |
| **T8** | web→app 세션 예약(`planned` 마이그레이션+웹 예약+앱 수신) | 선택 | Claude+사용자 | 마이그레이션 적용 |
| **T9** | 배포 — 웹 Vercel + 앱 EAS + 도메인/SMTP/Storage | 필수 | Claude+사용자 | Vercel·EAS·도메인·SMTP·버킷 |

**MVP 필수셋** = T0 + T1 + T2 + T9 (유료 AI 없음).
**AI 정책(2026-07-31 확정)**: 대화 AI는 **웹과 동일하게 1차 MVP에서 mock/규칙기반 유지**(OpenAI/CLOVA
API 비용 0). **실 AI(T3·T4·T5·T7)는 MVP 이후 마일스톤** — Edge Function 경계라 키 준비 시
**코드 변경 없이 전환**. T6·T8은 선택.

---

## 3. 태스크 상세

### T0 — 서울 리전 Supabase + 마이그레이션 + env  *(사용자 선행)*
- **내용**: 라이브 경로의 전제. `go-live-external-setup.md §1` 그대로.
- **완료 후 외부 요청(=이 태스크 전체)**: ①서울(ap-northeast-2) 프로젝트 생성 → ②마이그레이션
  20종 `supabase db push` → ③웹 `apps/web/.env`·앱 `apps/mobile/.env`(EXPO_PUBLIC_*) 키 입력
  → ④Realtime publication 확인. **확인법**: 앱/웹 로그인 후 실데이터 표시.

### T1 — 관찰지표 집계 라이브화  *(Claude)*
- **목표**: `apps/mobile/src/lib/analytics.ts` 를 목업 스토어 의존에서 **순수함수**(세션·로그·
  분석·연대기를 인자로 받음)로 리팩터 → `observations`·`analytics`·`topics`·elder 종합분석 탭을
  어댑터 데이터로 배선. 라이브에서 집계가 실제 DB 기반이 되도록.
- **산출물**: `analytics.ts`(순수함수) + 4개 화면 배선 + 어댑터에 집계 입력 훅 추가.
- **검증**: typecheck·lint·test(순수함수 단위테스트 추가)·Metro. 미설정 시 목업 동일.
- **완료 후 외부 요청**: 없음.

### T2 — 앱 세션 견고화  *(Claude)*
- **목표**: `PLAN.md T6.6` — 자동 종료(설계 턴 수 도달/침묵 타임아웃), 오류 상태(마이크 거부·
  네트워크 끊김·STT/TTS 실패), 세션 저장 실패 재시도/큐. 실기기 사용성 확보.
- **검증**: 게이트 + 오류 경로 단위테스트/시뮬레이션.
- **완료 후 외부 요청**: 없음.

> **T3~T5·T7 = 실 AI 마일스톤(MVP 이후)**. 1차 MVP는 mock/규칙기반으로 출시하고, 아래는
> 키·예산 준비 시 착수한다(Edge Function 경계라 무변경 전환). 각 태스크는 미배포 시 mock 유지.

### T3 — 실 STT (앱 대화)  *(실 AI 마일스톤 · MVP 이후)*
- **목표**: 모의 STT(`mockStt`)를 **Edge Function `session-stt`(gpt-4o-transcribe)** 로 교체.
  `correct.tsx` 확인·수정 흐름 유지. 서버가 키 보호. 미배포/미설정 시 mock 유지.
- **산출물**: `supabase/functions/session-stt` + 앱 STT 어댑터(live/mock 전환) + 오디오 캡처.
- **검증**: 게이트 + 함수 로컬 스텁 테스트. (실 인식률은 사용자 실기기 검증.)
- **완료 후 외부 요청**: `supabase secrets set OPENAI_API_KEY=...` → `supabase functions deploy
  session-stt`. **확인법**: 앱 대화에서 실제 발화가 텍스트로 변환되는지.

### T4 — 실 LLM (대화·분석)  *(실 AI 마일스톤 · MVP 이후)*
- **목표**: 규칙기반 `core`(openConversation/respondToUserTurn/analyzeSession)를 **Edge Function
  `session-respond`·`analyze-session`(Structured Outputs)** 로 승격. 안전 가드(core)는 서버에서도
  적용. mock→real 무변경 전환(키 없으면 규칙기반 유지).
- **산출물**: 2개 함수 + 앱/웹 호출 배선(기존 mock 자리) + 안전 프롬프트 이식.
- **검증**: 게이트 + 안전 시나리오 회귀(core 테스트 재사용).
- **완료 후 외부 요청**: `OPENAI_API_KEY` secret + `functions deploy session-respond
  analyze-session`. **확인법**: 대화 질문이 LLM 생성으로 바뀌고 종료 분석이 채워지는지.

### T5 — 실 TTS (Clova Voice)  *(실 AI 마일스톤 · MVP 이후)*
- **목표**: 앱 `expo-speech` → Clova Voice 옵션(자연스러운 노인 친화 음성). 미설정 시 expo-speech 폴백.
- **완료 후 외부 요청**: `NCP_CLOVA_CLIENT_ID/SECRET` + 함수 배포. **확인법**: 음성 톤 변화.

### T6 — 앱 소셜 로그인 3종 + naver-auth  *(Claude + 사용자, 선택)*
- **목표**: 구글·카카오=네이티브 OAuth(딥링크), 네이버=커스텀 `naver-auth`(현재 미구현) 구현.
  앱 로그인 화면 소셜 버튼 실배선(현재 게이트). 이메일+비번은 이미 동작.
- **완료 후 외부 요청**: `go-live-external-setup.md §3·§5` — 구글/카카오/네이버 콘솔 등록·
  Supabase provider·`naver-auth` secrets·배포. **확인법**: 3종 각 로그인 + 온보딩 프리필.

### T7 — 요양일지 실 STT/비전  *(실 AI 마일스톤 · MVP 이후)*
- **목표**: `stt-transcribe`(이미 스캐폴드) 배선 + 사진→LLM 비전 초안. 미설정 시 안내.
- **완료 후 외부 요청**: CLOVA/OPENAI 키 + `journal-photos` Storage 버킷 생성 + 배포. (`§6·§7`)

### T8 — web→app 세션 예약  *(Claude + 사용자, 선택)*
- **목표**: `session_status`에 `planned` 추가(마이그레이션) + 웹 "세션 예약" 커밋 UI + 앱
  "오늘 할 세션" 수신(기존 디자인 답습). 예약 시작 시 `planned`→`active`.
- **완료 후 외부 요청**: 신규 마이그레이션을 서울 프로젝트에 적용(`supabase db push`).

### T9 — 배포  *(Claude + 사용자)*
- **목표**: 웹=Vercel(env·도메인), 앱=EAS 빌드/제출. 배포 스크립트·설정 정비.
- **완료 후 외부 요청**: Vercel 프로젝트 연결·도메인·SMTP·Storage 버킷·EAS 계정/빌드. (`§8·§9`)

---

## 4. 사용자 외부 작업 총괄 (참조: go-live 런북)

T0(리전·마이그·env) · AI 키(OPENAI·CLOVA) · OAuth 콘솔 3종+naver secrets · SMTP · Storage
버킷 · Vercel/EAS 배포. 각 항목의 정확한 절차는 `docs/runbooks/go-live-external-setup.md`.
**컨테이너는 `*.supabase.co` egress 차단 → 위 항목은 전부 사용자가 대시보드/CLI로 적용.**

---

## 5. MVP-Readiness 판정 (필수셋 완료 시)

**정책: 대화 AI는 웹과 동일하게 mock/규칙기반 유지(1차 MVP) — 유료 API 비용 0.** 실 AI는
Edge Function 경계라 나중에 무변경 전환. 이 정책하에서 필수셋 완료 시:

| 영역 | 필수셋(T0·T1·T2·T9) 완료 시 | 비고 |
|------|------------------------------|------|
| 웹 관리·분석·보호자공유 | ✅ 실서비스 가능(W1~W6) | 에이전트=mock(웹 정책 동일) |
| 앱 인증·어르신·연대기 | ✅ 라이브 | 이메일 로그인(소셜=T6 선택) |
| 앱 세션 실행(대화→저장→분석) | ✅ 라이브(규칙기반) | STT=요양보호사 확인/받아쓰기·LLM=core 규칙·TTS=expo-speech |
| 앱↔웹 양방향(Realtime) | ✅ 라이브 | 배선 완료 |
| 관찰지표(비의료) | ✅ 실데이터 집계 | T1 |
| 실기기 안정성 | ✅ 자동종료·오류대응 | T2 |
| 데이터 주권·RLS·컴플라이언스 | ✅ 서울 리전·RLS·동의 | T0 |
| 배포·도메인·메일 | ✅ Vercel·EAS·SMTP | T9 |

**결론**: **필수셋(T0·T1·T2·T9) 완료 = 실서비스 가능한 1차 MVP(파일럿)에 도달한다.** 요양보호사가
운영하고, 어르신 연대기 기반 규칙형 대화·관찰지표·앱↔웹 실시간이 실데이터로 동작한다. 대화
AI만 mock/규칙기반(웹과 동일 정책)이라 **유료 AI 비용 0**.
- **정직한 한계**: 실 STT 없이는 어르신 발화를 **요양보호사가 확인 화면에서 받아쓰기/수정**한다
  (자동 음성인식 아님). 파일럿엔 충분하나 완전 자동화는 실 AI 마일스톤 이후. → T2에서 확인
  화면을 "받아쓰기 친화"로 다듬는다.
- **실 AI 마일스톤(T3·T4·T5·T7)**: 예산·키 준비 시 Edge Function 배포로 **코드 변경 없이** 실
  STT/LLM/TTS/비전 전환 → 대화 완전 자동화.
- **선택(T6·T8)**: 소셜 로그인·세션 예약. **제외(후속)**: 푸시·강한 본인확인·에이전트 자율실행·
  부하/DR — `PLAN.md §2′` v1.x 이후.

> 요약: **필수셋(T0·T1·T2·T9) = 실서비스 1차 MVP(대화 AI mock, 비용 0)**. 외부 작업이 걸린
> 태스크(T3~T7·T9)는 **완료 시점에 정확한 외부 요청을 사용자에게 전달**한다.
