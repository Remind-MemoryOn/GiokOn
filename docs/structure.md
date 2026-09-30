# 구조와 기술 기준

> 📌 2026-09-24 정리: `tech.md`(기술 스택)를 이 문서 §5 로 합쳤고, 2026-06 MVP 당시 구조(`session-respond` Edge Function·
> `session/active.tsx`·소유자별 RLS 등 지금 코드와 다른 설명)를 걷어 냈다.
> 무엇을 만들지는 [`pilot-development-plan.md`](plans/pilot-development-plan.md), 화면은 [`design.md`](design.md), 요구는 [`requirements.md`](requirements.md).

## 1. 전체 구조

```
┌───────────────────────────────┬──────────────────────────────────────┐
│ 웹 (apps/web · React + Vite)   │ 모바일 앱 (apps/mobile · Expo SDK 54) │
│ · 요양보호사 웹: 연대기·세션 설계 │ · 요양보호사 모드: 어르신 선택 →       │
│   ·프로그램 일지·감독 화면(반응형) │   설계 확인 → 시작                    │
│   ·공개 관리·기관 설정·권한       │ · 어르신 표시 모드: 사진·자막·         │
│ · 보호자 웹: 오늘의 이야기·      │   "말하는 중" (조작 요소 0)           │
│   대화 관찰 리포트              │                                      │
└──────────────┬────────────────┴─────────────┬────────────────────────┘
               │ 공유: packages/core · data · theme │ 음성(WSS)
               ▼                                   ▼
┌────────────────────────────────┐   ┌────────────────────────────────────┐
│ Supabase (서울)                 │   │ apps/voice-relay (Node + ws, Docker)│
│ PostgreSQL · RLS(기관 + 역할)    │◀──│ session_tick RPC(2초) — 권한·단계·   │
│ Auth · Storage · Realtime       │   │   원격 제어 · 위기 이벤트 즉시 기록   │
│ Edge Functions: live-token ·    │   │ Gemini Live(gemini-3.8-live)        │
│   session-report · naver-auth · │   │   → 출력 검증(screenAiUtterance)    │
│   [신규] 일지 초안 워커 ·         │   │   → Gemini 3.8 Flash TTS → 앱       │
│   [신규] 푸시 발송 워커           │   │ (Gemini 오디오 원본은 전달 안 함)    │
└──────────────┬─────────────────┘   └────────────────────────────────────┘
               │ Expo Push (FCM/APNs 자격증명은 EAS 가 관리)
               ▼
        요양보호사 휴대폰 — 위기 발화·세션 이상 종료 알림
```

⚠️ 음성 경로는 **중계 하나뿐**이다. 앱이 Gemini Live 에 직접 붙는 경로(직접 모드)는 폐기한다(파일럿 계획 M1·G).

## 2. 사용자 유형과 역할

| 사용자 | `org_role` | 접근 환경 | 인증 |
|---|---|---|---|
| 요양보호사 | `caregiver` | 모바일 앱(요양보호사 모드) + 요양보호사 웹 | 이메일·소셜 로그인 |
| 사회복지사 (신규) | `social_worker` | 요양보호사 웹 | 〃 |
| 센터장 (신규) | `center_director` | 요양보호사 웹 | 〃 |
| 기관 관리자 | `org_admin` | 요양보호사 웹 | 〃 (기관을 만든 계정) |
| 보호자 | `guardian` | 보호자 웹 | 〃 + 어르신 코드 연결·승인 |
| 어르신 | — | 모바일 앱(어르신 표시 모드) | 없음 — 기기에 로그인된 요양보호사 세션으로 인가 |

역할은 `set_member_role` RPC 로만 바뀐다(`users.role` 직접 쓰기는 3중 차단 — `20260908000000`).

## 3. 권한 구조 (파일럿 목표)

```
[기관(tenant) 단위 격리] — 다른 기관 데이터는 0건
  │
  ├── 돌봄팀 = caregiver · social_worker · center_director · org_admin   (app.is_care_team())
  │     ├── 같은 기관 어르신의 연대기·세션·분석·일지 열람·기록 — 담당 여부와 무관(교대근무)
  │     ├── 삭제는 배정·관리자 기준 유지
  │     └── 위임 권한 3종 (org_capabilities · app.has_capability())
  │           ├── 프로그램 일지 확정
  │           ├── 공개 / 철회
  │           └── 보호자 연결 승인
  │         기본 허용 = social_worker · center_director · org_admin → 기관 설정으로 caregiver 에 위임
  │
  ├── 고정 권한 (위임 불가) — org_admin · center_director
  │     ├── 권한 매트릭스 편집
  │     ├── 구성원 역할 지정 (자기 자신 불가 · 보호자↔돌봄팀 전환 불가)
  │     └── 직원 초대 코드 발급·회수 · 합류 승인 (자기 요청 불가)
  │           합류 승인 전 = users.org_id NULL = 데이터 0건
  │
  ├── 설정으로 끌 수 없는 것 — 위기 대응 · 출력 검열 · 진단 표현 금지 · Clova 경유
  │
  └── 보호자 (guardian) — 지금과 같다
        └── 연결 승인된 어르신의 **공개된 항목**만 (guardian_shares 경유)

[서버 워커 (service_role)]
  └── 일지 초안은 확인 대기까지만 쓴다 — 확정은 DB 트리거가 물리적으로 막는다(auth.uid() is null)
```

현재(전환 전)는 기관 + **담당 배정** 격리다(`app.is_assigned_caregiver` — `20260722100000`). 전환 후에도 그 함수는
"내 담당" 필터·알림 대상 용도로 남는다.

## 4. 모듈 변경 지도

| 위치 | 삭제 | 신규·확장 | 유지(절대) |
|---|---|---|---|
| `packages/core/src` | ✅ `ai.ts`·`ai.test.ts`(규칙 기반 대화) · ✅ `voice-flow.ts`(호출처 0) · ✅ `journal.ts`(`buildJournalDraft`) — 2026-09-26 W1 에서 삭제 · ✅ `prompt.ts` 의 `RESPONSE_JSON_SCHEMA` | `session-phase.ts` · `program-journal.ts` · `generated-session.ts` 확장(공단 필드·보호자 문장·금지어) · `conversation.ts` `respondToUserTurn` → `evaluateUserTurn` 축소 · `prompt.ts` 단계 지시·`PROMPT_VERSION` 저장 | `safety.ts` 전체 · `analysis.ts` 의 `detectTurnTopic`·`recommendNextTopics` |
| `packages/data/src/hooks` | `journals.ts`·`journalPhotos.ts`(→ 프로그램 일지 훅) · `analyses.ts` 의 `useUpsertSessionAnalysis`(dead code) | `programJournals.ts` · `supervision.ts` · `orgSettings.ts`(`useHasCapability` = UI 활성화의 단일 근거) · `pushTokens.ts` · `events.ts` · `realtime.ts` 등록 3곳 | 나머지 |
| `apps/mobile` | ✅ 직접 모드 분기(`RELAY_MODE`)와 직접 UI · `expo-speech` | ✅ 어르신 표시 모드(`talk.tsx` 모드 전환 + `src/features/session/ElderView`) · ✅ 복귀 게이트(PIN) · ⏳ 원격 제어 수신 · ⏳ 푸시 토큰 등록 | `SESSION_BUSY`(기기 1대 = 세션 1개) |
| `apps/web/src/pages` | `caregiver/Journal{List,Write,}Page.tsx`(요양일지) | `ProgramJournal{List,Detail}Page` · `SupervisionPage`(반응형) · 동의 부여·철회 라우트(✅ `ElderConsentsPage` — PR #17) · `OrgPage` 권한 매트릭스·역할 지정 · 보호자 페이지 표현 전환 | — |
| `apps/voice-relay/src` | — | `relay.ts` 2초 폴 → `session_tick` · 단계 지시 주입 · 원격 제어 · 위기 이벤트 즉시 기록 | 타이머·턴 상한·수명·재생 영수증 게이팅 |
| `supabase/functions` | — | 일지 초안 워커 · 푸시 발송 워커 · `session-report` 생성 로직 `_shared/` 추출 · 데모 허용목록 → 기관 게이트 · ⚠️ **`live-token` 중계 전용화**(지금은 JWT 만으로 토큰이 나가 중계를 건너뛸 수 있다) | `live-token` 의 DB 판정(`reserve_live_token`)·한도 |

⚠️ `packages/core` 삭제와 앱의 직접 모드 제거는 **반드시 같은 PR** 이다 — core 만 먼저 머지하면 앱이 깨진다. (✅ 2026-09-24 한 PR 로 완료 · `✅` = 완료, `⏳` = 남음)

## 5. 기술 기준 (파일럿)

| 영역 | 파일럿 기준 | 비고 |
|---|---|---|
| 음성 경로 | **중계 단일**: 앱 → `apps/voice-relay`(Node + ws, Docker) → Gemini Live → 출력 검증(`screenAiUtterance`) → Gemini 3.8 Flash TTS → 앱 | TTS 교체는 **2026-09-26 로컬 코드 구현, 자동 검증·운영 호스팅·실기기 미검증**. 앱 직접 모드는 폐기(M1) |
| 대화 모델 | **`gemini-3.8-live`** | 모델은 `live-token` 이 `GEMINI_LIVE_MODEL` 시크릿으로 정해 돌려준다 — `.env` 는 런타임에 안 읽힌다. 코드 폴백도 3.8로 통일했으며 Structured Outputs에 의존하지 않는다 |
| 토큰 발급 | `live-token` 을 **중계 전용**으로 잠근다 | 지금은 중계도 사용자 JWT 로 불러 서버가 직접 호출과 구분 못 한다(C4) |
| 대화 통제 | 대화 정책(단계형 도입 → 회상 → 마무리·의견수렴)을 시스템 지시로 주입. 단계는 `sessions.phase`(서버 권위) | 중계의 2초 폴을 `session_tick` RPC 로 바꿔 단계·원격 제어를 함께 받는다. 규칙 기반 대화(`packages/core/src/ai.ts`)는 삭제 |
| 안전 | 결정론 위기 감지 → **즉시 연결 종료**(유지) + `safety_events` 즉시 기록 + 감독 화면·푸시 | 위기 대응·출력 검열·진단표현 금지는 설정으로 끌 수 없다 |
| 일지 초안 | 세션 종료 → DB 트리거 → `journal_generation_jobs` 큐 → Edge Function 워커(30초 스케줄) → 확인 대기 | 동기 호출 불가(폴백 저장 경로에서는 종료 시점에 분석이 아직 없다). 생성문 검증은 `generated-session.ts` 확장 |
| 확정 | 사람만 — `auth.uid() is null` 이면 `final` 전환 거부(DB 트리거) | 서비스 계정 워커는 확정을 물리적으로 못 쓴다 |
| 감독·원격 제어 | Supabase Realtime(`sessions`·`session_interventions`) + DB 행 | broadcast 는 RLS 를 안 타서 쓰지 않는다 |
| 푸시 | **Expo Push**(EAS 가 FCM/APNs 자격증명 관리) — `notifications` 행 소비자 | 본문에 어르신 성함·발화 금지. `expo-notifications` 추가 → EAS 재빌드 |
| 권한 | RLS 기관 단위 + 역할(`is_care_team()` · `has_capability()`) | 지금은 담당 배정 격리(`20260722100000`) |
| 계측 | `product_events` + definer 삽입 함수 | 시간 절감(초안 → 확정 소요)의 유일한 증거. 1주차부터 |
| 웹 일지 음성 | `stt-transcribe`(CLOVA STT) **보류** | 요양일지 음성 입력 폐기 — 재검토 대상 |
| 세션 시간 | 세션 1회 **최대 10분**(서버 고정값 — 중계 연결 수명) | 2026-09-24 확정. 지금 25분 |
| 동시 감독 | 요양보호사 1명당 동시 **최대 4대**(DB 가 판정) | 2026-09-24 확정 |
| 태블릿 | `ios.supportsTablet: true` · 세로 고정 | 2026-09-24 변경 |
| 장기 트랙 | Whisper 특화·공개 LLM(Ollama) 전환 | **파일럿 범위 밖**([음성 계획](plans/voice-ai-personalization.md) A2~A5) |

## 6. 장기 방향 (파일럿 범위 밖)

- 음성 인식·대화 모델 자체 특화(Whisper · 공개 LLM + Ollama)는 권리 확인된 데이터와 평가 게이트를 통과한 뒤에만 — [`voice-ai-personalization.md`](plans/voice-ai-personalization.md).
- 모니터링(Sentry 등)·스테이징 분리·부하 시험은 정식 운영 전 과제 — [`security.md`](security.md) §인프라.

### ✅ 2026-09-28 — 웹 디자인 수정사항 반영
- 사용자 제공 `디자인 수정사항.txt`: 보호자 날짜 필터·연결 어르신 선택·화살표 정렬, 가입 하단 로그인 링크, 읽은 알림 숨김·긴 텍스트 말줄임을 구현했다.
- 웹 전체 선택 메뉴를 공통 `Select`로 통일했다. 기간 선택은 `PeriodSelect`, 세션/보호자 날짜 필터는 `DateFilter`를 공유한다. 사용자 요청으로 달라진 정렬은 Figma 검사에 사유를 기록했다.
- 검증: `pnpm -F @giokon/web test:design-feedback` 및 `test:org`·`test:plan`·`test:grade` 통과. 운영 배포는 별도다. 구현 규칙은 `apps/web/AGENTS.md`의 같은 날짜 기록을 따른다.