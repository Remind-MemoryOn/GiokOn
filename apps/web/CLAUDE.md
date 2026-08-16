# apps/web — 요양보호사·보호자 관리 웹 (작업 지침)

이 파일은 **웹(`apps/web`) 작업 시 자동으로 함께 읽히는 메모리**다. 루트 `CLAUDE.md`
(프로젝트 전역)와 함께 적용되며, 충돌 시 더 구체적인 이 문서를 따른다.

## 0. 이 앱의 경계

- **요양보호사·기관 관리자·보호자 전용 관리 웹**이다. React 19 + Vite + Tailwind v3.4 +
  react-router 7 + TanStack Query + Zustand.
- **어르신 음성 대화(TTS/STT) 화면은 여기 없다** — 모바일 앱(`apps/mobile`) 담당.
  2026-07-11 에 웹에서 어르신 콘텐츠(대화·아바타 꾸미기·브라우저 음성)를 전부 제거했다.
  "웹에 대화 화면을 만들자"는 방향은 아키텍처 확정 사항에 반한다.
- 백엔드는 앱과 공용: 도메인 로직 `@giokon/core`, 데이터·인증 `@giokon/data`,
  토큰 `@giokon/theme`. 웹에서 도메인 규칙을 새로 구현하지 말고 core 를 쓴다.

## 1. ⛔ 디자인은 이미 완성돼 있다 (가장 중요)

- **디자인 단일 소스(SoT) = `docs/require/기억온_웹_디자인.md`** (외주 핸드오프 스펙,
  1,150여 줄). 20종 화면 스크린샷과 함께 전달된 **완성본**이며, 색·치수·컴포넌트·화면별
  카피·상태·인터랙션까지 확정돼 있다.
- **임의 재디자인·재배치·카피 변경 금지.** 루트 CLAUDE.md 의 "외부 협력 + Claude Design
  비교 트랙" 결정에 따라, 그 트랙 밖에서 비주얼을 바꾸지 않는다. 기능을 추가할 때도
  **기존 토큰·프리미티브 조합**으로 만든다(새 색·새 그림자·새 반경 도입 금지).
- 스펙을 **의도적으로** 바꿔야 할 때의 절차:
  1. 사용자 확인 → 2. `docs/require/기억온_웹_디자인.md` 갱신 →
  3. 구현 변경 → 4. `scripts/check-web-design.mjs` 표 갱신 → 5. `pnpm check:design` 통과.
- **`pnpm check:design`** 이 스펙↔구현 일치를 기계 검증한다(토큰·프리미티브·라우팅·
  화면 카피·컴플라이언스 고지 70여 항목). 실패하면 디자인이 어긋난 것이다.

### 자리표시자 금지(실서비스 원칙)
스펙·스크린샷의 어르신 이름(김복순 등)·수치·예시 분석문은 **데모 값**이다. 실데이터에
바인딩하고, 근거가 없으면 값을 만들지 말고 `null`/빈 배열 → 빈 상태 문구로 표시한다.
`0`(관찰 0회)과 `null`(측정 불가)을 구분한다.

## 2. 디자인 토큰 (실사용분)

토큰 단일 소스는 `packages/theme/src/index.ts`. `tailwind.config.js` 는 TS 를 import 할 수
없어 **값을 미러**하며, 두 곳의 동일성은 `check:design` 이 강제한다. → **한쪽만 고치지 말 것.**

| 축 | 값 |
|---|---|
| 주조색 `brand` | 50 `#fdf7f0` · 100 `#fbeede` · 200 `#f6d8b3` · 300 `#efbb81` · 400 `#e89a52` · **500 `#dc7a2c`(Primary)** · 600 `#c06223` · 700 `#9c4d20` · 800 `#7d3f20` · 900 `#65351d` |
| `warm` | 50 `#fffaf3` · 100 `#fef3e2` · 200 `#fbe2c4` · 300 `#f6cda0` · 400 `#eeb077` · 500 `#e08e51`(로고 박스) · 600 `#c87436` · 700 `#a35a2a` · 800 `#854621` |
| `cream` | 50 `#fffefb` · 100 `#fff8ed` · 200 `#fcefd9` |
| 중립 | Tailwind `slate` 그대로 (배경 `slate-50`, 본문 `slate-900`, 보조 `slate-500`) |
| 시맨틱 | emerald(성공)·sky(정보)·amber(주의)·pink·red(위험) — Badge/Toast 전용 |
| 아바타 7색 | `#fbb78c` `#a3d4b1` `#b1c8f0` `#f5b9c9` `#dabbf0` `#fbe294` `#9ad6d2` (`pickAvatarColor(seed)` 결정론) |
| 폰트 | Pretendard → Apple SD Gothic Neo → Noto Sans KR → system-ui, `font-feature-settings: 'ss01'` |
| 반경 | 버튼 6/8/8/12 · Input 8 · Card·Dialog 16 · Badge·Avatar full |
| 그림자 | `shadow-soft`(카드 상승) · `shadow-warm`(따뜻한 강조) · Card 는 `0 1px 2px rgba(15,23,42,.04)` |
| 모션 | 웹은 `animate-fade-in-up`(아래 10px→위, 0.3s) 하나뿐 — 모달·토스트 진입 |
| 포커스 | 버튼 `focus-visible:ring-2 ring-brand-300 ring-offset-2` / 입력 `focus:ring-2 ring-brand-300 + border-brand-400` |

`warm`·`cream`·`elder-*`·`mic-*` 는 모바일과 공유하는 토큰이라 설정에 함께 있다.
웹 화면에서 쓰는 건 위 표의 조합뿐이다. **팔레트에 없는 shade 를 쓰면 색이 조용히
사라진다**(과거 `text-warm-800` 사례) — `check:design` 이 이를 잡는다.

## 3. 공통 컴포넌트 계약 (`src/components/ui`)

새 프리미티브를 만들지 말고 아래를 조합한다. 개별 오버라이드는 `className` prop 으로.

- **Button** — variant 5(`primary`·`secondary`·`ghost`·`danger`·`outline`) × size 4
  (`sm` 32 / `md` 40 / `lg` 48 / `xl` 56px). 기본 `primary`/`md`.
- **Badge** — tone 6(`neutral`·`brand`·`success`·`info`·`warning`·`pink`). **`danger` 톤은 없다.**
- **Avatar** — 원형 이니셜(이름 **마지막 2글자**), size 4(32/40/48/64), 색은 `pickAvatarColor`.
- **Card** — `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardBody`/`CardFooter`.
- **Dialog** — size 3(`md` 448 / `lg` 672 / `xl` 896px). ESC·백드롭 클릭·X 로 닫힘, body 스크롤 잠금.
- **Input · Textarea · Field** — Field 가 라벨·필수 별표(`*` red-500)·hint/error 를 담당
  (error 가 있으면 hint 는 숨김).
- **Toast** — `useStore().toast(kind, message)`, 우하단 스택, **3.2초** 자동 소멸.
  성공/실패/정보 3종. 사용자 피드백은 alert 가 아니라 반드시 토스트로.

## 4. 화면 맵 · 접근 가드

```
공개    /  /login  /find-id  /forgot-password  /reset-password  /privacy  /terms
온보딩  /onboarding                     (로그인 후 최초 1회, complete_onboarding RPC)
요양보호사 /caregiver{ index, elders, elders/:elderId, logs, logs/:logId,
                       analysis, journal, shares, org, settings }   ← 사이드바 240px
보호자  /guardian                       (사이드바 없음, 중앙 1컬럼 max-w-3xl)
구경로  /caregiver/login·/guardian/login → /login      미매칭 * → /
```
가드 순서(양 영역 공통): `loading` 이면 **아무것도 렌더하지 않는다**(깜빡임 방지) →
세션 없으면 `/login` → `onboarded_at` 없으면 `/onboarding` → 역할 불일치면 상대 영역으로.

사이드바 네비 8항목(순서 고정): 대시보드 `Home` · 어르신 관리 `Users` · 세션 기록 `FileText` ·
분석 `ChartColumn` · 요양일지 `NotebookPen` · 공개 관리 `Share2` · 기관 관리 `Building2` ·
설정 `Settings`. 페이지 상단은 항상 `PageHeader`(제목 + 설명 + 우측 액션).

## 5. 데이터·상태 규칙

- **서버 상태 = TanStack Query**(`@giokon/data` 훅). **UI 상태 = Zustand**(`store/store.ts` —
  토스트 + 아직 DB 미배선인 "세션 설계"). 서버 데이터를 Zustand 에 복제하지 않는다.
- **Supabase 미설정(.env 없음)에서도 앱은 떠야 한다.** `useAuth().isConfigured` 로 분기해
  훅을 `enabled: isConfigured` 로 끄고 "Supabase 연동 후 …" 안내를 렌더한다. 이 폴백을 깨지 말 것.
- 앱→웹 실시간 반영은 `useGiokonRealtime`(sessions·session_analyses·guardian_shares 등).
  새 분석 도착 시 정보 토스트를 띄운다(레이아웃에 이미 배선됨).
- 어르신 접근은 **배정 모델**(`profile_caregivers`) + **영속 어르신 코드**(`elder_codes`).
  코드 하나로 보호자 연결·담당 인계를 모두 처리한다. QR·1회성 초대는 폐기됐다.
- RLS 가 최종 방어선이다. 화면에서 "안 보이게" 하는 것으로 접근통제를 대신하지 않는다.

## 6. 카피 · 컴플라이언스 (심사 리스크 — 어기면 CI 실패)

- **비의료**: "치료·진단·효능·향상·호전·완화" 금지. "인지활동·회상 대화·정서 지원·
  관찰 지표(참여도·응답률·발화량·주제 반응)" 언어만. `pnpm check:copy` 가 강제.
- **AI 투명성**(AI기본법): AI 생성물은 항상 표시 — "AI 질문·요약은 AI가 생성한 내용입니다",
  "AI 초안 — 확인·수정해 주세요 (AI 생성물)".
- **안전장치 고지**: 안전 알림 곁에 항상 "키워드 기반 안전장치 — 의학적 판단이 아닙니다".
- **분석 하단 고지**: "대화에서 직접 관찰된 지표입니다(효능·향상 판정이 아닙니다)."
- **AI 쓰기 작업은 사람 확인 게이트**를 거친다(AgentPanel 의 실행 확인 카드). 자동 실행 금지.
- 명칭: 회사 **리마인드**, 서비스 **기억온**(영문 **GiokOn**), 워드마크 "GiokOn · 회상 대화 AI".
- 한글 가독성: 긴 문장에는 `style={{ wordBreak: 'keep-all' }}`.

## 7. 접근성(KWCAG) — 회귀시키지 말 것

본문 바로가기 스킵 링크, 안전 알림 `role="alert" aria-live="assertive"`, 아이콘 전용 버튼의
`aria-label`, 브랜드 포커스 링. 새 인터랙션에도 동일 기준을 적용한다.

## 8. 개발 · 검증

```bash
pnpm web                 # 개발 서버(Vite)
pnpm web:preview         # 빌드 + 프로덕션 프리뷰
pnpm web:smoke           # 빌드 + 라우트 스모크 21종(preview 를 스스로 띄우고 끔)
pnpm check:design        # ★ 완성 디자인 ↔ 구현 대조 (토큰·프리미티브·화면·고지)
pnpm check:copy          # 비의료 카피 린트
pnpm check:web           # 위를 한 번에: typecheck → lint → copy → design → build → smoke
```
커밋 전에는 최소 **`pnpm check:web`**, 공용 패키지(core/data/theme)를 건드렸으면
`pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build` 까지.

## 9. 이 환경에서의 주의점

- 컨테이너 egress 가 막혀 **Pretendard CDN(jsdelivr)과 `*.supabase.co` 가 차단**된다.
  스모크의 `ERR_TUNNEL_CONNECTION_FAILED` 콘솔 오류는 폰트 CDN 때문이며 앱 결함이 아니다.
  (여기서 렌더한 화면은 폰트가 폴백으로 보인다 — 타이포 눈대중 판단 금지.)
- `.env` 는 커밋하지 않는다. 원격 세션은 `.claude/hooks/session-start.sh` 가 환경변수로
  `apps/web/.env` 를 만들며, 값이 없으면 목업 모드로 뜬다.
- 남은 외부 작업(코드 아님): 서울 리전 프로젝트·소셜 OAuth 콘솔 등록·`naver-auth` Edge
  Function 배포·SMTP·실 LLM 키. 코드는 연동 시 **무변경**으로 동작하도록 짜여 있다.

## 10. 아직 미배선인 곳 (알고 시작할 것)

- **"회상 세션 설계"(어르신 상세 좌측)** 만 Zustand 목업이다 — 나머지 화면(어르신·연대기·
  세션 기록·분석·일지·공개·기관·설정)은 전부 Supabase 배선 완료. 세션 설계의 web→app
  예약(`planned`) 배선은 후속 과제다.
- AI 에이전트(AgentPanel)·일지 AI 초안은 **mock(규칙 기반)** — 실 LLM 은 Edge Function 으로
  무변경 전환 예정. mock 을 지우거나 화면에서 감추지 말 것.
