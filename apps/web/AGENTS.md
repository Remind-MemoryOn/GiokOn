# apps/web — 요양보호사·보호자 관리 웹 (작업 지침)

> 📌 **웹 작업 지침의 단일 소스(SoT)다.** 웹(`apps/web`) 파일을 건드리면 이 문서를 읽는다. 옆의 `apps/web/CLAUDE.md` 는 포인터 스텁이다.
> 루트 **[`AGENTS.md`](../../AGENTS.md)** 와 함께 적용되며, 충돌 시 더 구체적인 이 문서를 따른다. 제품 사실·현재 위치는 루트에, 무엇을 만들지는
> [`docs/plans/pilot-development-plan.md`](../../docs/plans/pilot-development-plan.md) §7, 테스크 상태는 `docs/tasks.md` 에 있다. 여기에는 **웹에만 해당하는 규칙**만 둔다.
> (2026-09-28 압축 — 날짜별 완료 기록·지난 전환기 설명은 git 이력에 있다.)

## 0. 이 앱의 경계

- **요양보호사·기관 관리자·보호자용 관리 웹**. React 19 + Vite + Tailwind v3.4 + react-router 7 + TanStack Query + Zustand.
- **어르신 음성 대화 화면은 없다** — 모바일 앱 담당. 웹에 대화 화면을 만들지 않는다.
- 백엔드는 앱과 공용(`@giokon/core`·`@giokon/data`·`@giokon/theme`). 도메인 규칙을 웹에서 새로 구현하지 말고 core 를 쓴다.
- 웹의 주 무대: ① 프로그램 일지 확인·확정·공개 ② **감독 화면**(진행 중 세션 원격 제어 — **웹에만** 만든다: 세션 중 태블릿은 어르신이 들고 있다)
  ③ 기관 설정·권한 매트릭스·구성원 관리.

## 1. ⛔ 디자인 기준 = Figma **단독**

- **SoT**: Figma `4iU6Zw4MhLAMZWlnPFgsCI` "기억온 웹"(1440px). 화면↔노드 맵·절차·좌표 함정은 **`docs/runbooks/figma-web-extraction.md`**.
- **렌더 에셋**: `apps/web/assets/figma/*.png`(화면) · `components/*.png`(모달·부품). 컨테이너에서 `www.figma.com` 이 막히므로 **눈 대조는 이 PNG 로**.
- 구 디자인(2026-08 이전)·구 스펙 문서는 폐기됐다 — 근거로 삼지 않는다. 새 디자인에 **없는 기능은 제거**, 있는 기능은 추가. **임의 재디자인 금지.**
- 시안이 없는 화면(감독·프로그램 일지 상세·권한 매트릭스·동의 등)은 사용자 확정 계획을 근거로 **기존 디자인 언어로 최소 구현**하고, 시안이 오면 그 화면만 교체한다.
  사용자가 직접 준 디자인 수정 지시(예: 2026-09-28 `디자인 수정사항.txt`)는 해당 부분에서 Figma 보다 우선한다 — 바뀐 프로브는 지우지 말고 `accept` 로 사유를 남긴다.
- 미구현 화면은 자리표시자를 세우지 말고 라우트를 두지 않는다(`pages/Pending.tsx` 되살리지 말 것).
- **검사 2단**: `pnpm check:design`(소스 정규식 상시 게이트, CI) · `pnpm check:figma-web`(DOM 좌표 + 잉크를 Figma 와 ±1.5px 대조 + 이미지 비율 + 사이드바 클릭).
  재는 요소에 `data-fx="<노드id>"` 를 달고 `scripts/figma-audit.spec.mjs` 에 실측을 적는다. 화면을 옮기면 두 표에 항목을 추가한다.
- ⚠️ **좌표 함정**: `get_metadata` 의 텍스트 `h` 는 라인박스가 아니다 · 반전/회전 노드는 metadata 좌표가 렌더 위치가 아니다 ·
  Figma lineHeight 는 대부분 auto(≈1.2) → 토큰 기본 라인높이를 쓰면 **잉크가 2~3px 내려간다** → 실측 `leading-[…]` 명시.
- **자리표시자 금지**: Figma 의 이름·수치·예시 분석문은 데모 값이다. 실데이터에 바인딩하고, 근거가 없으면 `null`/빈 배열 → 빈 상태 문구. `0` 과 `null` 을 구분한다.

## 2. 기능 규칙

**이름**: `프로그램 일지`(구 요양일지) · 보호자 `대화 관찰 리포트`(요양보호사 화면은 `분석` 유지 · 보호자 사이드바만 폭 때문에 '관찰 리포트') ·
보호자 소식 필터 `오늘의 이야기`(확정 일지를 보호자용 문장으로).

**프로그램 일지**(`JournalPage` → `ProgramJournalListPage` → `ProgramJournalDetailPage`, 주소 `/caregiver/journal/:elderId(/new|/:journalId)`)
- 🟠 **초안은 자동이다 — "초안 생성" 버튼을 만들지 않는다.** 세션 종료 → DB 트리거 → 워커가 AI 초안을 채워 확인 대기로. 사람은 확인·수정·확정만.
  **"다시 생성"은 `status='failed'` 일지에만**(`useRetryJournalGeneration` → RPC `retry_journal_generation`, `session-report` 를 부르지 않는다).
- 상태: `generating`("AI 가 초안을 만들고 있어요" — 수정 가능, 워커는 사람이 먼저 쓴 칸을 덮어쓰지 않는다) · `pending_review`(`draft_generated_at` 있으면 AI 초안 배지,
  `last_error` 가 있으면 AI 를 건너뛴 사유 안내) · `failed`(`last_error` + 다시 생성) · `final`. 전환은 Realtime `program_journals`.
- 기관 AI 스위치(`org_settings.ai_drafts_enabled`)가 꺼진 기관은 세션 종료 즉시 빈 초안(직접 작성). **스위치를 켜는 UI 를 만들지 않는다**(운영자 전용 — DB 가 막는다, 읽기 표시만).
- 상세 저장은 **바꾼 칸만** 보낸다(워커가 채운 칸을 빈 값으로 지우지 않게) · 생성 중 저장은 상태 불변 · 실패 일지를 사람이 이어 쓰면 확인 대기 ·
  'AI 초안' 표시는 워커가 채우는 4칸(진행 내용·수급자 반응·의견수렴·보호자 문장)에만 · 상태 칩은 본문색 글자 + 색 점(대비).
- **확정은 `useHasCapability('journal_finalize')` 일 때만** · 확정 후 공단 칸 수정은 **사유 필수** · 이력 탭 · 서버 오류 코드 → 문구는 `lib/journalErrors.ts`.
- 공개는 **확정 + 보호자 문장 승인** 일지만(서버 게이트). **보호자 화면은 `guardian_text` 만** 렌더한다(`get_my_shared_journals`) — 공단 서식 칸을 보호자에게 보이지 않는다.

**감독 화면**(`/caregiver/supervision`) — 1440 셸 밖의 **반응형 단독 화면**(휴대폰 브라우저 기본). 셸 밖이라 `useGiokonRealtime` 을 화면이 직접 연다.
원격 제어는 RPC `request_session_control` 만(직접 UPDATE 는 트리거가 거절), 원격 종료는 기기를 멈출 뿐 저장은 기기에서. 위기 카드 문구는 서버가 저장한
`caregiver_alert` 그대로(새로 만들지 않는다). 세션에 기기 정보가 없어 '시작한 사람'을 보인다(기기 이름을 지어내지 않는다).
어르신 요청으로 마무리(`elder_closing`, T21.11)는 중계가 **시작자 토큰**으로 남겨 `actor_id` 가 직원이다 — 기록에는 '어르신'으로 적고,
카드 상태 배지 + 이유 안내(위기 아님 — 위험 색·토스트 금지) · 저장 전까지 카드가 남으므로 끊긴 연결의 제어 버튼은 숨긴다(`elderClosingOf`).

**기관·구성원**
- ⛔ **요양보호사는 초대 코드로만 가입**한다(기관명 입력이 같은 기관을 둘로 갈랐다). 온보딩의 '소속 기관명' 자리는 **초대 코드** 칸이다. 기관을 만드는 UI 를 되살리지 않는다.
- 기관 없는 가입 계정(`onboarded_at` 있고 `org_id` NULL)은 `isAwaitingOrgJoin()` → `/join-pending`. 요청자는 기관 이름을 못 읽는다(RLS) — 지어 보여 주지 않는다.
- 직원 합류 승인 = **기관 전체 어르신 기록 열람 권한**을 주는 일 → 확인창에서 먼저 알린다. 요청자 이메일은 읽을 수 없다(`requester_name`·초대 역할만).
- **역할은 이름으로 직접 비교하지 않는다**: 관리 역할 `isOrgManagerRole()`(관리자+센터장) · 이름 `ORG_ROLE_LABEL` · 호칭 `roleHonorific()` ·
  UI 활성 근거는 `useHasCapability()` 하나. `role === 'org_admin'` 은 DB 정책이 정확히 그 역할만 허용하는 곳(기관 이름 수정)에만.
- 권한 매트릭스(위임 3종 × 돌봄팀 4역할)·기관 설정·구성원 역할 지정은 관리 역할만 쓰고, 나머지에게는 **읽기 전용**으로 보인다. 회귀 `test:org`.

**어르신**
- 동의 부여·철회는 웹에서도 한다(`ElderConsentsPage` · 등록 동의 단계, 필수 4종). ⛔ **화면의 '완료' 판정 = DB 세션 처리 판정(`app.has_processing_consent`)** —
  `lib/consents` `currentConsentOf` 하나로 판정한다(다른 행을 대신 인정하면 화면은 완료인데 세션이 막힌다).
- `care_grade`: 필수 판정은 data `careGradeRequired`(주간보호만) 한 곳 · 주간보호면 등급 없이 저장을 막는다(DB 는 강제하지 않음).
- 동의 모달의 **의사능력 기록·대리동의·법적 한계 고지**는 시안보다 더해서 유지한다(컴플라이언스).
- ⛔ **법률 문서(`src/content/legalDocuments.ts`)는 수정하지 않는다**(변호사 검토본 — 오탈자·깨진 문자·연락처 포함). 비의료 검사는 파일 첫머리 `nonmedical-ok-file` 로 이 파일만 면제.

**보호자**
- **보호자 표현**: 판정형 금지("인지 기능 저하 의심"·"우울 경향"·점수·등급·향상률·기관 평균 대비) → 기술형. "병원 진료 권장"은 넣지 않는다.
  모든 리포트 하단 고정 문구 = `components/guardian-report-notice.tsx`("본 리포트는 대화 기록 요약이며 진단·평가 목적이 아닙니다.").
  보호자 종합은 판정형 카드2 를 그리지 않는다(`ElderAnalysisCards audience="guardian"`).
- 요약만 공개된 기록은 RPC `get_my_shared_summaries`(요약 문장·첫 주제·날짜만)로 읽는다 — 없는 대화 시간·인용·키워드를 지어내지 않는다.
- 보호자는 **공개된 분석에 매달린 세션만** 읽는다(`app.is_session_shared_to_me`) — 보호자 화면에서 무언가 안 보이면 **공개 상태를 먼저 본다**.
- ⛔ **공개 항목의 신원은 `(item_type, item_id)` 복합키**다. `session_summary` 와 `analysis` 는 같은 분석 행 id 를 쓴다 — `item_id` 만으로 Map 을 만들면 서로 덮는다.
  사진은 일지 id 가 아니라 사진 id 로 공개된다(`program_journal_photos` 를 거쳐 찾는다).
- "지금 보는 어르신"은 `lib/guardianElder.ts`(URL `?elder=` → localStorage → 첫 연결)가 정하고 **승인 목록의 id 만** 받는다. 화면마다 `links.find(approved)` 로 되돌아가지 말 것.
- 메시지(보호자 → 요양보호사 단방향)는 **동결** — 코드는 두되 확장하지 않는다. 알림은 탑바 벨 배지·드롭다운이 소비처(사람은 알림을 만들 수 없다).

**문의·공개 페이지**
- 문의 게시판(`/inquiries`, Figma 밖 사용자 승인 기능): 운영자 = `users.is_site_admin`(스스로 못 켠다). ⛔ 비공개 문의의 제목·작성자·본문은 작성자·운영자만 —
  목록은 `list_inquiries()` 가 잠금 문구로 바꿔 보낸다. **화면에서 다시 판정하지 말고 서버 값을 그대로 쓴다.**
- `/privacy`·`/terms` 단독 라우트. 법인명·보호책임자·수탁자는 미확정이라 적지 않는다.
- 이용안내(`GuidePage`)는 법률 전문 대신 사용 흐름 안내 — 치수·좌표 체계는 Figma `1:17` 그대로(상단 상수를 `check:design` 이 고정). AI 투명성·안전장치 고지를 빼지 않는다.

## 3. 상태·데이터 규칙

- 서버 상태 = TanStack Query(`@giokon/data` 훅), UI 상태 = Zustand. 서버 데이터를 스토어에 복제하지 않는다.
- **Supabase 미설정(.env 없음)에서도 앱은 떠야 한다** — `useAuth().isConfigured` 로 훅을 `enabled` 끄고 안내를 렌더한다.
- Realtime 은 `useGiokonRealtime`. ⚠️ **새 테이블은 `RealtimeTable`·`DEFAULT_TABLES`·`invalidateFor` 세 곳에 모두 등록한다**(publication 에만 넣으면 아무도 안 듣는다).
- **세션 상태**: `planned`(웹 설계) · `active`(앱 진행 중) · `ended` · `recording`(폴백 기록 저장 전용, 실행 불가). 대화 이력·분석 목록에 `planned` 를 세우지 않는다. 앱은 설계 행을 그대로 시작한다(새로 만들면 설계가 유령으로 남는다).
- 어르신 접근은 **기관 단위 + 역할**이다. 배정(`profile_caregivers`)은 알림·"내 담당" 필터 용도. 보호자 격리·어르신 코드(`elder_codes`)는 그대로.
- RLS 가 최종 방어선이다. 화면에서 감추는 것으로 접근통제를 대신하지 않는다.
- 🔒 **보안 불변식**(판정 SoT = `docs/runbooks/security-fixes.md`):
  · **R009 계정 격리** — 인증 경계마다 `QueryClient` 를 새로 만든다(`AuthQueryScope` · lease `assertCurrent()`). ⛔ 전역 `queryClient` 하나로 되돌리지 말 것.
    스토어도 `resetForAuth()` + 세대 번호로 늦은 토스트를 버린다. 회귀 `test:auth`.
  · 웹 음성 입력은 없다(삭제). 서버 STT 함수 `stt-transcribe`(CLOVA)도 2026-10-04 저장소에서 삭제했다 — 되살리려면 동의·권한 규칙(대상 어르신 `can_process_profile`)부터 다시 설계한다.
  · **R011 동의 증거 보존** — 철회·재동의가 과거 증거를 덮지 않는다.
- **화면 폭** — 1440 캔버스는 줄어들지 않는다(`html[data-canvas=fixed] body{min-width:1440px}` · viewport `width=1440`). **반응형 예외는 감독 화면뿐**이며 규칙은
  `src/lib/viewportMode.ts`(`isFluidPath`)와 `public/viewport-mode.js`(CSP 가 인라인 스크립트를 막는다) **두 곳** — 반응형 화면을 새로 만들면 함께 고친다. 회귀 `test:viewport`.
- **시안 밖 단독 화면 체계**: 배경 `#f8f8f8` · 로그인한 사람의 단독 화면은 워드마크(→ 역할별 메인) + 오른쪽 동작 하나의 단독 헤더 · 버튼은 공용 `Button`
  (되돌릴 수 없는 동작 = `danger`) · 누를 수 없는 상태 표시에 컨트롤 모양(라디오·체크)을 쓰지 않는다 · 시안 밖 화면의 명도대비는 우리가 보정한다(감독 화면 방식).
- 시안에 없는 사이드바 메뉴는 **맨 끝에만** 붙이고(중간 삽입 = 시안 좌표 이동), 아이콘은 시안 글리프를 다시 칠해 만든다(`scripts/crop-web-figma-assets.py` `RECOLOR`).
- **공용 모듈 — 화면에서 다시 짜지 말고 쓴다**: `lib/figmaY` `Y` · `lib/format` `dayKey`·`secondsParts` · `lib/elderProfile` `useElderProfile` ·
  `lib/shareViewed` `useMarkShareViewedOnce` · `lib/serverErrors` `serverErrorMessage` · `lib/myName` `useMyNameForm` · `lib/consents` ·
  `lib/consentDocuments` `CONSENT_DOCUMENT_PATH`(동의서 경로 하나) · 선택 메뉴 `ui/Select`(+ `PeriodSelect`·`DateFilter`).
  ⚠️ `check:design` 이 소스 문자열로 고정한 표현은 리팩토링에서도 제자리에 둔다 — 게이트를 코드에 맞춰 고치지 않는다.
- 감사 스텁의 `?audit-role=<역할>` 은 접근성 감사 전용이다(좌표 감사는 쓰지 않는다).

## 4. 카피 · 컴플라이언스 (CI 강제)

- **비의료**: "치료·진단·완치·처방·치매 예방·인지 개선" 금지(`pnpm check:copy`).
- 요양보호사 분석 화면의 "인지 효과 분석"·"향상률·증가율"·"향상/하락"·"매우 긍정적"은 **시안 그대로 둔다**(2026-09-01 확정 — 모바일과 같은 문구) +
  하단 관찰 지표 고지. 단 **값과 라벨은 일치**해야 한다(근거가 없으면 방향 낱말 대신 `—`, 시안이 그리지 않은 상태의 문구는 지어내지 않는다).
- **재는 것이 다른 라벨은 시안을 따르지 않는다** — 대화 분석 감정 막대는 '긍정/보통/부정'을 재지 않고 말투 묶음을 센다(`components/analysis-session.tsx`).
- **AI 투명성**: AI 생성물은 항상 표시. **안전장치 고지**: "키워드 기반 안전장치 — 의학적 판단이 아닙니다". 분석 하단: "대화에서 직접 관찰된 지표입니다(효능·향상 판정이 아닙니다)."
- **알림(toast) 문구 = 해요체 + '해 주세요'**. Figma 문구·서버 원문은 대상이 아니다. 긴 문장에 `wordBreak: 'keep-all'`.
- ⛔ **네이티브 대화상자 금지**(`window.alert/confirm/prompt`) → `ui/ConfirmDialog` · `toast`. `check:design` 이 되살아나는지 감시한다.
- ⛔ **조회 실패를 빈 상태로 두지 않는다**: 셸의 `QueryErrorBanner` 를 지우지 말 것(RLS 거부·네트워크 실패가 "기록 없음"으로 보이는 것이 가장 위험한 실패).
  셸 밖 화면(감독 등)은 스스로 실패를 보인다. 화면 안의 더 정밀한 표시는 배너를 대체하지 않고 더한다.

## 5. 접근성(KWCAG)

- 스킵 링크 · 안전 알림 `role="alert" aria-live="assertive"` · 아이콘 버튼 `aria-label` · 포커스 링 · 보이는 라벨 없는 입력에 `aria-label`.
- **`pnpm check:a11y`** — axe(WCAG 2.1 A/AA) + 모달 키보드 동작(초점 진입·Tab 가둠·Esc). 새 모달은 `lib/modalA11y.ts` `useModalA11y(open, onClose)`.
  선택 메뉴(`ui/Select`)는 방향키·Home/End·Enter·Escape·Tab·문자 탐색·바깥 클릭을 지원하고, 모달 안에서 Escape 는 메뉴만 닫는다.
- ⚠️ **명도대비는 시안이 정한 색이라 코드가 임의로 바꾸지 않는다**(시안 밖 화면 제외). 게이트는 미달 쌍을 보고만 한다 — 현황은 `docs/accessibility.md` §6.
  WCAG 1.4.10(리플로우)은 1440 고정 시안의 한계로 미충족.

## 6. 개발 · 검증

```bash
pnpm web                 # 개발 서버
pnpm web:smoke           # 빌드 + 라우트 스모크(CSP 헤더를 씌워 돈다 — 콘솔 오류 0 = CSP 검증)
pnpm check:design        # 소스 정규식 게이트 (CI)
pnpm check:figma-web     # Figma 좌표·잉크·이미지 비율·사이드바 클릭 대조
pnpm check:a11y          # axe + 모달 키보드
pnpm check:audit         # 배포본(apps/web)에 닿는 취약점만 차단 (CI)
pnpm check:web           # typecheck → lint → copy → design → build → smoke
# 흐름 스모크(합성 API · 스텁 빌드 · CI 미연결): test:journal · test:org · test:plan · test:grade · test:elder-delete · test:viewport · test:design-feedback
```

- **게이트 수치는 늘리는 방향으로만 움직인다** — 줄면 무언가를 지운 것이다. **게이트를 새 코드에 맞춰 고쳐서 통과시키지 않는다**
  (`check:design` 은 통과했는데 `check:figma-web` 편차 192건이던 사례가 있다). 시안이 바뀐 게 아니면 코드를 시안에 맞춘다.
- `check:design` 은 `{ absent: /…/ }` 로 "되살아나면 안 되는 것"도 검사한다.
- `check:figma-web` 은 첫 단계(`figma-audit.mjs`)가 실패하면 뒤의 잉크·이미지·사이드바 검사를 돌리지 않는다.
- **이미지 비율 검사**: Tailwind preflight `img{height:auto}` 가 HTML `height` 를 덮어 flex 행의 아이콘이 세로로 늘어난다 →
  flex 부모 안이면 `self-start`(+`shrink-0`), 비율 자체가 다르면 `object-contain`(판정 대상에서 빠진다).
- **사이드바 클릭 검사**: 본문을 `-ml-[323px] w-[1440px]` 로 당긴 띠가 사이드바 위를 덮어 클릭을 가로챈다 → `Sidebar` 의 `relative z-30` 을 지운다면 이 검사가 잡는다.
- 모달 화면 좌표 대조는 `viewportHeight` 1200 을 준다(안 그러면 `Dialog` 의 `fit` 축소가 켜진다). `Dialog fit={{width,height}}` 는 여유가 있으면 배율 1.
- CSP 에 `unsafe-inline`·`unsafe-eval` 을 넣지 않는다.
- 감사 스텁(`src/audit/auth-stub.tsx`)은 화면이 부르는 쿼리를 **전부** 심어야 한다(빠지면 `QueryErrorBanner` 가 떠 프로브가 깨진다 — 진짜 신호다).

### 6.1 "렌더는 멀쩡해 보이는데 틀린" 결함에서 나온 규칙

- **한 글리프 = 에셋 하나**(여백판·크롭판이 공존하면 틀린 쪽이 쓰인다). 새 에셋은 잉크 bbox 가 테두리에 닿는지부터 본다.
- 아이콘 세로 중앙은 `top-1/2 -translate-y-1/2`(손으로 박은 `top` 금지).
- **같은 부품은 같은 값** — 선택 메뉴는 `ui/Select` 하나(팝업은 `dropdownStyles`: 흰 배경·line 테두리·r10·card 그림자·48px 항목·16px 글자, portal 로 띄우고
  첫 렌더 전에 위치 측정). 네이티브 `<select>` 는 폼 값·필수 검증용 숨은 필드로만. 기존 입력 칸 치수는 시안 그대로.
- 24시간제 시각은 `components/ui/TimeField.tsx`(네이티브 time 은 오전/오후로 쪼갠다). 날짜는 네이티브를 쓰되 달력 아이콘을 `.date-native-hidden` 으로 칸 전체로.
- 시안보다 항목이 늘면 좌표를 억지로 끼우지 말고 시안 간격을 상수로 두고 **항목 수에서 계산**한다. 문구 길이는 코드가 정할 수 없다 → 칸 폭을 주고 접거나 말줄임 + `title`.
- 표시 전용 컨트롤을 두지 않는다(누를 수 있어 보이면 동작해야 한다). 돌아가기는 부모 섹션으로 · 로그인 상태의 로고는 역할별 메인.
- 절대좌표 요소를 추가하면 같은 카드 안의 y 범위 겹침을 대조한다.

## 7. 환경 주의점

- Pretendard 는 자체 호스팅(`assets/fonts/Pretendard-1.3.9`) — jsdelivr 는 컨테이너에서 막힌다. `*.supabase.co` 도 막혀 컨테이너에서는 목업 모드로 뜬다.
- 잉크 대조(`figma-ink.py`)는 `pip install numpy Pillow` 가 필요하다.
- 브라우저는 `/opt/pw-browsers/chromium`(`playwright install` 금지). ⚠️ `test:auth` 는 `executablePath` 를 주지 않아 원격 컨테이너에서는 실패한다(코드 결함 아님 — CI 에서는 돈다).
- `smoke` 는 `dist` 가 있어야 한다 — 새 컨테이너에선 `pnpm web:smoke`(빌드 포함).
- ⚠️ `apps/web/supabase/config.toml`(`project_id="web"`)은 빈 흔적이다. Supabase CLI 는 **루트에서** 쓴다. 삭제 여부는 사용자 결정 대기.
