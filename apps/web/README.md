# @giokon/web — 요양보호사 웹 · 보호자 웹

> 📌 **2026-09-23 기획 변경 반영.** "무엇을 만들지"의 SoT =
> [`docs/plans/pilot-development-plan.md`](../../docs/plans/pilot-development-plan.md) §7(웹 파트 W1~W9).
> 이 앱에서 작업할 때의 규칙(Figma 단독 디자인 기준·카피 규약·상태 규칙)은 [`AGENTS.md`](./AGENTS.md) 에 있다.

기억온의 웹 클라이언트다. **요양보호사 웹**(연대기·세션 설계·세션 기록·분석·일지·공개·기관 관리)과
**보호자 웹**(연결한 어르신의 공개된 소식·대화 관찰 리포트)이 한 앱에 있고, 로그인 후 역할에 따라 갈린다.
어르신 대화(세션 진행)는 이 앱이 아니라 `apps/mobile` 이 한다.

> 이 파일은 2026-06 **localStorage 시연 프로토타입**(`src/lib/ai.ts` 규칙 기반 추출·`ConversePage` 등)을 설명하던
> 문서를 대체한다. 그 프로토타입은 더 이상 이 앱이 아니다.

## 실행

```bash
# 저장소 루트에서
pnpm install
pnpm web                          # vite 개발 서버
pnpm -F @giokon/web build         # tsc -b && vite build
```

환경변수(`apps/web/.env`, gitignore): `VITE_SUPABASE_URL` · `VITE_SUPABASE_PUBLISHABLE_KEY` — **공개 값만**.
비밀 키는 웹에 두지 않는다. 값이 없으면 Supabase 에 연결하지 않는다(콘솔 안내만 남는다).
⚠️ `src/lib/supabase.ts` 의 주석·콘솔 문구 "목업 데이터로 동작"은 **낡았다** — 목업 스토어는 이미 없다(`src/store/store.ts` 는 토스트뿐).

## 검증

```bash
pnpm -F @giokon/web typecheck && pnpm -F @giokon/web lint
pnpm check:copy                   # 비의료 카피 린트 (사용자 노출 문구)
pnpm check:design                 # 웹 디자인 규칙 검사
pnpm -F @giokon/web smoke         # 라우트 스모크
pnpm check:web                    # 위를 묶은 웹 게이트
pnpm check:a11y                   # 대비 등 접근성 감사 (대비는 현재 비차단 — 결과를 "전체 통과"로 읽지 말 것)
```

## 화면 구성 (현재)

| 영역 | 경로 | 비고 |
|---|---|---|
| 공개 | `/` · `/guide` · `/privacy` · `/terms` · `/inquiries` | 로그인 없이 열린다 |
| 인증 | `/login` · `/signup` · `/onboarding` · `/find-id` · `/forgot-password` · `/reset-password` | 온보딩 완료 전에는 데이터 화면 차단 |
| 요양보호사 | `/caregiver` 아래 대시보드 · 어르신 · 연대기 · 세션(설계·기록) · 분석 · **일지** · 공개 관리 · 기관 관리 · 설정 | Realtime 으로 앱 대화 결과가 바로 반영된다 |
| 보호자 | `/guardian` 아래 어르신 연결 · 공개된 소식 · 분석 · 설정 | **공개(커밋)된 항목만** — 서버 RLS 가 강제한다 |

## 파일럿에서 바뀌는 것 (파일럿 계획 §7)

| # | 변경 | 지금 |
|---|---|---|
| W1 | **프로그램 일지** 목록·상세(공단 서식 필드 · 확정 · 확정 후 수정 사유 · 이력 · 다시 생성 · 재시도) | `journal/*` 요양일지(사진·타이핑·음성 3경로 + 수동 초안 다이얼로그) — 삭제 |
| W2 | ✅ **감독 화면**(2026-09-25, `/caregiver/supervision` — 셸 밖 반응형) · 원격 일시정지·재개·종료 · 위기 카드 | 사이드바 맨 끝 '감독' |
| W3 | 네비: `요양일지` → `프로그램 일지`, **보호자** `분석` → `대화 관찰 리포트`, 보호자 소식 필터 `요양일지` → `오늘의 이야기` | — |
| W4 | 보호자 표현을 판정형 → 기술형, 하단 고정 문구, 일지는 **보호자용 문장만** 렌더 | `session_summary` 가 생성돼도 렌더되지 않는 기존 버그 포함 |
| W5 | 세션 설계의 목표 시간(기존 `duration_minutes`) 초기값을 기관 설정에서 · 단계 미리보기 · 기관 기본 피할 주제 | 초기값 고정 15분 |
| W6 | 기관 설정 · 권한 매트릭스 · 구성원 역할 지정 · 직원 초대 코드·합류 승인 | 구성원 표는 역할을 보여 주기만 한다 |
| W7 | ✅ 어르신 처리 동의 부여·철회 화면(2026-09-24, `jinwoo` · PR #17 병합 대기) | `ElderConsentsPage` · 등록 시 동의 단계 · 필수 동의 4종 |
| W8 | 어르신 장기요양등급 입력(주간보호 필수) | 없음 |
| W9 | ✅ 온보딩 "새 기관 만들기 / 초대 코드로 합류" + `/join-pending` 승인 대기(2026-09-25) | 초대 발급·합류 승인은 기관 관리(W6 전반, ✅ 2026-09-25) |

권한 판단은 화면마다 역할 문자열을 비교하지 않고 `useHasCapability`(`packages/data`) 하나로 한다.
`= 'caregiver'` 비교는 새 역할(사회복지사·센터장)을 조용히 빼 버린다.
