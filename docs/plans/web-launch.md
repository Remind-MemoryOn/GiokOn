# 계획 — 웹 배포 (2026-09-06)

사용자 감사 보고서(`기억온 통합 배포 전 감사 보고서`, 2026-09-03)의 **전 항목을 코드·라이브
DB 로 재검증**하고, **웹 배포에 필요한 것만** 추려 실행 순서로 정리한 문서다.

- 대상: `apps/web` + 그것이 의존하는 `packages/*` · `supabase/*`
- 제외: 앱스토어·Expo SDK·Gemini Live 프로토콜·앱 역할 가드 → 앱 출시 트랙(별도)
- 검증 기준: `main` `e366a8e` · 라이브 서울 `MemoryOn`(`ufkbzpdjomtmxjipmwub`)
- 자매 문서: **앱 트랙은 `docs/plans/app-release-remaining.md`**. 겹치는 항목(오류 상태·
  Storage 제한·Realtime 잔여·다단계 쓰기 원자성)은 그쪽을 정본으로 두고 여기서는 참조만 한다.

---

## 0. 감사 보고서 재검증 결과

### 0-1. 이미 해결됐거나 사실과 다른 항목

| 보고서 | 재검증 결과 |
|---|---|
| 자동검증 "디자인 검사 실패 3건" | **디자인 문제 아님.** 이 컨테이너에서는 178항목 전부 통과. 원인은 `scripts/check-web-design.mjs` 의 기본 모드가 `src(file)` **원문**을 그대로 정규식에 넣어 **CRLF 체크아웃에서 깨지는 것**(`copy` 모드만 `flat()` 로 공백을 접는다). → `.gitattributes` 로 고정한다(§1-8). |
| 자동검증 "웹 스모크 실패" | **환경 문제.** 여기서는 64/64 통과·콘솔 오류 0. Windows 에서 preview 가 안 뜬 것으로, `route-smoke.mjs` 는 이미 빈 포트 자동 할당·`process.execPath`·`fileURLToPath` 로 고쳐져 있다. 사용자 환경에서 재확인 필요. |
| 1.16 "명암비 242곳" | **현재 211곳**(색 쌍 22종). `ink-500` 보정으로 581→211 로 줄였고 `ink-500` 은 한 건도 남지 않았다. 남은 건 전부 브랜드 주황·상태색. 지적의 핵심("통과로 표시되는데 실제로는 미달")은 **`5c1a2cc` 에서 해소** — 이제 미달이 남으면 `△ 차단 항목 없음 … "접근성 통과" 가 아니다` 로 출력한다. **비차단인 것 자체는 그대로**이며, 차단으로 올릴지는 §3-3 결정 사항. |
| 2.3 "Realtime 누락 7종" | `journal_photos` 는 publication 에 있었고, **`5c1a2cc` 에서 구독 훅까지 연결**됐다(publication 에 있다 ≠ 구독한다 — 지적이 맞았다). 실제 잔여는 `care_journals`·`profile_guardians`·`profile_caregivers`·`consents`·`elder_codes`·`inquiries` **6종** → `app-release-remaining.md` §3.4. |
| 2.6 "마이그레이션 36개, 런북은 19/21개" | **현재 37개**(`20260902000100_inquiries_revoke_anon` 추가). 런북이 낡은 것은 사실 — `OPENAI_API_KEY` 표기, 이미 끝난 항목이 미완으로 표기. |
| 3.9 문의 게시판 비공개·RLS | **해결됨.** `list_inquiries()` 가시성 판정 + `anon` 권한 회수(이중 방어) + RLS 회귀 §5.12. **pagination 없음은 사실**(§1-7). |
| 2.6 "`database.types.ts` 수동 타입" | 사실. 다만 라이브 스키마와 **현재는 일치**(전수 대조 완료). 드리프트 검사 CI 가 없는 것이 실제 위험. |

### 0-2. 확인된 웹 배포 차단 항목

전부 코드·라이브에서 재현 확인했다.

| # | 항목 | 근거 |
|---|---|---|
| A | **이메일 회원가입이 도달 불가** | `App.tsx` `/signup` → `OnboardingPage`, 그 안 `:125` `if (!session) return <Navigate to="/login" replace />`. 로그인 화면의 "회원가입"을 누르면 **로그인으로 되돌아온다**. `signUpWithEmail` 은 `packages/data/src/auth.ts:88` 에 있으나 **웹에서 호출하는 곳이 0곳**. |
| B | **"아이디 저장" 이 장식** | `LoginPage.tsx:29` `useState(false)` 뿐 — 저장·복원 로직이 전혀 없다(웹 전체에 `localStorage` 사용처 없음). |
| C | **네이버 로그인 405** | `buildNaverAuthUrl` 이 **GET** `/naver-auth/authorize` 로 보내는데 Edge Function 은 **POST 만** 허용. |
| D | **보호자 대화 분석이 항상 빈 화면** | `AnalysisSessionsPage.tsx:33` 이 `useSessions()` 로 `sessions` 를 직접 조회. 라이브 RLS `sessions_select_scope` 는 `app.current_org_role() <> 'guardian'` — **보호자는 0행**. `session_logs` 도 동일. |
| E | **보호자 다중 어르신 미지원** | `FeedPage.tsx:110` · `AnalysisSessionsPage.tsx` 둘 다 `links.find(l => l.status === 'approved')` — **첫 번째만**. Figma 에는 `69:320 여러 어르신 연결` 화면이 있다. |
| F | **공개 관리 키 충돌** | `ShareItemsPage.tsx:101·169` 가 `Map` 을 **`item_id` 만으로** 만든다(`item_type` 무시) → `session_summary` 와 `analysis` 가 같은 원본 id 라 서로를 덮는다. `:149` 는 `live.some(s => s.item_type === 'photo')` 라 **사진 하나만 공개돼 있으면 모든 일지의 사진 체크박스가 켜진 것처럼 보인다**. |
| G | **승인 UI 없음** | `useApproveGuardianLink` · `useApproveCaregiverAssignment` 호출하는 화면 **0곳**. 보호자 연결·기관 합류 승인을 제품 안에서 못 한다. |
| H | **일지 음성·AI 미완성** | `JournalWritePage.tsx:14` 주석대로 STT/LLM 미연결. AI 초안 버튼 `disabled`(`:433`), 음성 파일은 선택만 되고 업로드·전송 없음, **활동 시작·종료 시각이 저장 payload 에 없다**. |
| I | **계정 삭제 셀프서비스 없음** | `SettingsPage.tsx:9` — 설계상 "기관 관리자·지원 채널 접수". 웹만 배포하면 스토어 요건은 무관하나, 개인정보 권리 행사 경로로는 부족. |
| J | **보안 헤더 없음** | `apps/web/vercel.json` 에 `rewrites` 만 있다. CSP·`X-Content-Type-Options`·Referrer-Policy·Permissions-Policy·`frame-ancestors` 전부 없음. |
| K | **취약점 32건이 배포를 막지 않음** | `pnpm audit --prod` = High 18 · Moderate 14. CI `security-audit` 는 `continue-on-error: true`. |
| L | **문의 목록 전건 반환** | `list_inquiries()` 에 limit/offset 없음 — 글이 쌓이면 공개 페이지가 전건을 내린다. |
| M | **법률 문서 미확정** | `LegalPages.tsx` 가 스스로 표시 — 법인명·대표자·보호책임자·수탁자·국외이전. |
| N | **오류가 빈 상태로 보임** | 여러 화면이 `isError` 를 빈 상태와 구분하지 않는다(문의 목록은 구분함 — 그 패턴을 확산). |

---

### 0-3. 라이브에 적용해야 할 마이그레이션 (2026-09-07 확인)

`list_migrations` 기준 **라이브 36 · 저장소 42**. 차이는 아래 6개다.

```bash
supabase link --project-ref ufkbzpdjomtmxjipmwub
supabase db push        # 파일명 순서대로 6개가 적용된다
supabase migration list # 42개인지 확인
```

| 파일 | 무엇을 바꾸나 | 적용 안 하면 |
|---|---|---|
| `20260906000000_guardian_shared_session_read` | 보호자가 **공개된 분석에 매달린** 세션·대화 원문을 읽는다 | 보호자 "대화 분석" 이 **항상 빈 화면** |
| `20260906010000_guardian_share_item_owner` | 공개 항목이 그 어르신 것인지 트리거가 검사 | 다른 어르신 기록을 공개할 수 있다 |
| `20260906020000_care_journal_activity_time` | `care_journals.activity_from/to` | 일지 활동 시간 저장이 **실패**(컬럼 없음) |
| `20260906030000_inquiries_pagination` | `list_inquiries(p_limit, p_offset)` | 문의 목록이 전량을 내려보낸다 |
| `20260906040000_security_advisor_hardening` | 트리거 함수 RPC 회수 · `search_path` · anon 회수 | advisor 경고 유지 |
| `20260906050000_realtime_and_storage_limits` | Realtime 6종 · 버킷 10MiB/MIME | 승인·코드 회전이 실시간 반영 안 됨 · 업로드 무제한 |

⚠️ **`20260906030000` 은 인자 없는 `list_inquiries()` 를 drop 하고 기본값 있는 새
시그니처로 만든다.** 두 시그니처가 공존하면 PostgREST 가 모호성 오류를 낸다.
구버전 웹이 떠 있는 상태에서 적용해도 기본값 덕에 그대로 동작한다(순서 무관).

> ℹ️ `20260823000000_onboarding_account_consents` 는 `schema_migrations` 에 **기록이
> 없지만** 라이브 `complete_onboarding` 시그니처에 `p_consents text[]` 가 이미 있다
> (advisor 출력으로 확인). 내용은 적용됐고 이력만 빠진 것이라 `db push` 가 다시
> 적용해도 멱등이다.

---

## 1. 웹 배포 실행 계획

각 단계는 **끝났는지 판정할 수 있는 기준**을 함께 둔다.
검증은 매 단계 `pnpm check:web` + `pnpm check:a11y` + `pnpm -F @giokon/web figma:audit`.

### W-1 · 인증 경로 복구 (P0) — ✅ 코드 완료 (2026-09-06)

로그인/가입이 안 되면 나머지는 의미가 없다.

> 세 항목 모두 구현했다. **다만 네이버는 사용자가 `naver-auth` 를 재배포하고
> `WEB_ORIGINS` 시크릿·네이버 콘솔 Callback URL 을 등록해야 실제로 돈다**(§2).

- **W-1a 이메일 회원가입 화면 신설** — `/signup` 을 실제 가입 폼으로. 이메일·비밀번호(8자↑)·
  확인 → `signUpWithEmail` → 확인 메일 안내 → 로그인 후 `/onboarding` 으로 이어진다.
  ⚠️ Figma 에는 이 화면이 없다(시안의 "회원가입"은 소셜 후 온보딩 전제). **기존 인증 화면
  프리미티브·좌표 체계만 재사용**하고 임의 스타일을 만들지 않는다.
  · 완료 기준: 로그아웃 상태에서 `/signup` → 가입 → 확인 메일 → 로그인 → 온보딩까지 통과.
- **W-1b 네이버 로그인 수정** — Edge Function 에 GET `/authorize` 를 추가하거나 웹을 POST 로
  바꾼다. **서버가 `state` 를 세션과 결합해 검증**하도록 함께 고친다.
  · 완료 기준: 웹에서 네이버 로그인 왕복 성공(405 소멸), 위조 `state` 거부.
- **W-1c "아이디 저장" 구현** — 체크 시 이메일만 `localStorage` 에 저장·복원.
  비밀번호는 저장하지 않는다. 체크 해제 시 즉시 삭제.
  · 완료 기준: 재방문 시 이메일 프리필, 해제 시 사라짐.

### W-2 · 보호자 화면 정상화 (P0) — ✅ 코드 완료 (2026-09-06)

보호자는 서비스의 절반이고, 지금은 **화면이 비어 보인다**.

> 네 항목 모두 구현·검증했다. **마이그레이션 2종은 사용자가 라이브에 적용해야 한다**
> (`20260906000000_guardian_shared_session_read` · `20260906010000_guardian_share_item_owner`).
> 적용 전에는 보호자 대화 분석이 계속 비어 보인다.

- **W-2a 보호자 세션 조회 = RLS 확장** ✅ *2026-09-06 사용자 확정 (1번)*
  `sessions`·`session_logs` 에 **공개(미철회)된 `session_analyses` 에 연결된 세션만**
  보호자가 읽도록 정책을 추가한다. 화면은 지금 구조를 유지한다.
  ⚠️ 범위를 좁게 잡는다 — 승인된 연결(`app.is_linked_guardian`) + 그 어르신 + **해당
  세션의 분석이 실제로 공개돼 있을 것**. 셋을 모두 만족할 때만 열린다.
  · 완료 기준: 공개된 분석이 있을 때 보호자 대화 분석 목록·상세가 채워지고,
  공개를 철회하면 즉시 안 보인다. RLS 회귀 추가.
- **W-2b 다중 어르신 선택** — 승인된 연결이 2건 이상이면 어르신 선택기를 띄운다
  (Figma `69:320` 이 그 화면이다). 피드·분석이 **같은 어르신**을 보도록 선택 상태를 공유한다.
  · 완료 기준: 어르신 2명 연결 상태에서 헤더와 목록의 어르신이 항상 일치.
- **W-2c 공개 관리 키를 `(item_type, item_id)` 로** — `ShareItemsPage` 의 Map 두 곳과
  사진 판정(`:149`)을 복합 키로 바꾼다.
  · 완료 기준: 요약만 공개 → 보호자에게 보임 / 분석 공개가 요약을 덮지 않음 /
  사진 체크박스가 해당 일지에만 켜짐.
- **W-2d 교차 어르신 공유 차단** — `guardian_shares` 에 **item_type 별 원본의 `profile_id`
  일치를 강제하는 트리거** 신설. 지금은 다형 UUID 라 DB 가 막지 못한다.
  · 완료 기준: 다른 어르신의 항목 id 로 공개 시도 → DB 가 거부. RLS 회귀 추가.

### W-3 · 승인·운영 UI (P0) — ✅ 코드 완료 (2026-09-06)

> 기관 관리(`/caregiver/org`)에 **승인 대기** 카드를 신설했다. Figma 에 없는 화면이라
> 카드2(구성원)의 실측 리듬을 그대로 쓴다. 대기 건이 없으면 그리지 않는다.
> 요청자 쪽 안내(어르신 관리 pending 배너)는 이미 있었다.

- **W-3a 보호자 연결 승인 화면** — 대기 중 연결 목록 + 승인/거절(`useApproveGuardianLink`).
- **W-3b 기관 합류 승인** — `profile_caregivers.status='pending'` 목록 + 승인
  (`useApproveCaregiverAssignment`). 기관 관리 화면에 붙인다.
  · 완료 기준: 관리자 SQL 없이 보호자 연결·요양보호사 합류를 제품에서 처리.

### W-4 · 일지 화면을 사실과 맞추기 (P0) — ✅ 코드 완료 (2026-09-06)

> 사용자 확정대로 **완성**했다(제거 아님). 음성 인식·AI 초안·활동 시간·수정 화면이
> 다 붙었다. ⚠️ **`stt-transcribe` 배포와 NCP CLOVA 시크릿 등록은 사용자 작업**이다(§2) —
> 미배포 상태에서는 "아직 서버에 배포되지 않았어요" 라고 분명히 알린다(조용한 실패 아님).
> 마이그레이션 `20260906020000_care_journal_activity_time` 적용 필요.

시안이 약속한 기능이 동작하지 않는다. **둘 중 하나로 정리한다** — 어중간한 상태가 가장 나쁘다.

✅ *2026-09-06 사용자 확정: **완성**(선택 2)*
- `stt-transcribe` 배포 + 음성 업로드→STT→원문 배선 · AI 초안 연결 · 활동 시간을 스키마에 추가.
- ⚠️ `stt-transcribe` **배포와 NCP CLOVA 시크릿 등록은 사용자 작업**이다(§2). 코드측은
  그와 무관하게 먼저 완성하고, 미배포 상태에서는 명확한 오류를 보인다(조용한 실패 금지).
- 어느 쪽이든 함께 고칠 것: **사진 여러 장 중 일부 실패 시 롤백**, `URL.revokeObjectURL`
  누수 해제, **일지 수정 UI**.
  · 완료 기준: 화면이 설명하는 기능이 전부 실제로 동작한다.

### W-5 · 배포 하드닝 (P0) — ✅ 코드 완료 (2026-09-06)

> 다섯 항목 모두 처리했다. CSP 는 **문서가 아니라 시험**이다 — route-smoke 가 배포
> 헤더를 그대로 씌워 돌리므로 위반이 생기면 65/65 가 깨진다. 취약점 게이트는
> 배포본(apps/web)에 닿는 것만 막는다(모바일 개발 도구 18건은 목록으로 보고).
> ⚠️ 마이그레이션 `20260906030000_inquiries_pagination` 적용 필요.

- **W-5a 보안 헤더** — `vercel.json` 에 CSP(Supabase 도메인만 허용)·`frame-ancestors 'none'`·
  `X-Content-Type-Options: nosniff`·`Referrer-Policy: strict-origin-when-cross-origin`·
  `Permissions-Policy`(camera/microphone/geolocation 차단) 추가.
  · 완료 기준: 배포본 응답 헤더 실측 확인.
- **W-5b 취약점 분류** — 32건을 런타임/빌드전용/도달불가로 분류하고, 런타임 도달분은 업데이트,
  나머지는 근거를 적어 예외 등록. CI `security-audit` 의 `continue-on-error` 제거.
  · 완료 기준: CI 가 새 런타임 취약점에서 실패한다.
- **W-5c `.gitattributes`** — `* text=auto eol=lf` 로 CRLF 체크아웃에서 디자인 검사가
  깨지는 것을 막는다.
  · 완료 기준: Windows 체크아웃에서도 `check:design` 통과.
- **W-5d 오류 상태 구분** — Query 화면의 `isError` 를 빈 상태와 분리(문의 목록 패턴 확산).
  ※ `app-release-remaining.md` §3.1 과 같은 작업이다 — **웹·앱을 한 번에** 처리한다.
  · 완료 기준: RLS·네트워크 실패가 "기록 없음"으로 보이지 않는다.
- **W-5e 문의 목록 pagination** — `list_inquiries(p_limit, p_offset)` + 더보기.

### W-6 · Supabase 정리 (P1) — 🟡 부분 완료 (2026-09-06)

> **한 것**: W-6a 보안 advisor(트리거 함수 RPC 노출 회수 · `search_path` 고정 2건 ·
> 로그인 필요한 RPC 에서 anon 회수) · W-6c Realtime 6종 · W-6d Storage 크기/MIME 제한 ·
> W-6f 런북 갱신(42개 · Edge Function 3종 배포 절차 · 낡은 `OPENAI_API_KEY` 표기 제거).
>
> **안 한 것과 이유**:
> · **W-6b 성능 advisor 113건** — 순수 성능이고 지금 행 수는 세 자리다. `auth.uid()` →
>   `(select auth.uid())` 재작성은 정책 34개를 손대는 일이라 **정책을 약하게 만들 위험**이
>   이득보다 크다. 실데이터가 쌓여 느려지는 게 관측된 뒤에 근거를 갖고 한다.
> · **W-6e 타입 드리프트 CI** — 라이브 스키마를 읽으려면 CI 에 서비스 키가 필요하다.
>   키를 CI 에 두는 것은 별도 결정이라 사용자 판단 없이 넣지 않는다.
> · **`elder-photos` 읽기를 배정 기준으로 좁히기** — 같은 기관이면 읽히는 현행이 교대
>   근무와 정합적인지는 운영 정책 문제다(사용자 결정 필요).

- **W-6a 보안 advisor** — 트리거 함수(`handle_new_user`·`sync_inquiry_answered` 등)
  `EXECUTE` 회수 · `search_path` 고정 2건 · security definer 함수의 불필요한 `anon` 실행 권한 회수.
- **W-6b 성능 advisor 113건** — `auth.uid()` → `(select auth.uid())`(34) · 중복 정책 정리(25) ·
  FK 인덱스(19).
- **W-6c Realtime 6종 추가** — `care_journals`·`profile_guardians`·`profile_caregivers`·
  `consents`·`elder_codes`·`inquiries`. → `app-release-remaining.md` §3.4 와 동일 작업.
- **W-6d Storage 제한** — 두 버킷에 파일 크기 상한·MIME allowlist. `elder-photos` 읽기를
  **담당 배정 기준**으로 좁힐지 검토. → `app-release-remaining.md` §3.3 와 동일 작업.
- **W-6e 타입 드리프트 CI** — `database.types.ts` ↔ 라이브 스키마 대조 잡 추가.
- **W-6f 런북 갱신** — `go-live-external-setup.md` 를 37개 마이그레이션·Gemini·현재 상태로.

### W-7 · 실제로 한 바퀴 돌리기 (P0) — 📋 체크리스트 준비 완료 (2026-09-07)

> **사용자 확정(2026-09-07): 마이그레이션은 사용자가 직접 적용한다.** 적용 후 알려
> 주시면 MCP 로 정책·트리거·컬럼·publication·버킷 제한까지 결과를 검증합니다.

라이브에는 **보호자 0명 · 일지 0건 · 공개 0건 · 알림 0건 · 설계 세션 0건**이다.
코드가 이어져 있다는 것과 동작한다는 것은 다르다. 지금까지 실제로 흐른 것은
**앱 → 웹 한 방향뿐**이다(세션 1 · 로그 3 · 분석 1 · 연대기 2 · 동의 3).

> 컨테이너에서 `*.supabase.co` 가 막혀 있어 **브라우저 왕복은 사람이 눌러야 한다.**
> 아래는 순서대로 따라가는 목록이다. 각 단계에 **무엇이 참이어야 하는지**와
> **아니면 무슨 뜻인지**를 붙였다 — 실패가 무엇을 가리키는지 알아야 고칠 수 있다.

#### 0. 먼저 (없으면 아래가 전부 막힌다)
- [ ] 마이그레이션 6종 적용(§0-3) → `supabase migration list` 로 42개 확인
- [ ] `naver-auth` 재배포 + `WEB_ORIGINS` + 네이버 콘솔 Callback URL(§2)
- [ ] `stt-transcribe` 배포 + CLOVA 시크릿(§2) — 없으면 음성만 못 쓰고 나머지는 돈다
- [ ] Vercel 배포 + `VITE_SUPABASE_*` env

#### 1. 계정·권한 (요양보호사 A · 요양보호사 B · 보호자 G 셋을 만든다)
| # | 할 일 | 참이어야 하는 것 | 아니면 |
|---|---|---|---|
| 1.1 | A 로 `/signup` → 확인 메일 → 로그인 | `/onboarding` 으로 이어진다 | SMTP 미설정(§2) 또는 W-1a 회귀 |
| 1.2 | A 온보딩(요양보호사 · 기관명 입력) | `users.role='org_admin'`, 기관 1건 생성 | `complete_onboarding` 실패 |
| 1.3 | 소셜 3종 각각 로그인 왕복 | 네이버 포함 셋 다 `/caregiver` 도달 | 네이버 405 → 재배포 안 됨 · `WEB_ORIGINS` 누락 |
| 1.4 | A 로 어르신 등록(사진 포함) | 목록·상세에 사진이 뜬다 | Storage 정책 또는 10MiB/MIME 제한(§W-6d) |
| 1.5 | B 로 가입 → 온보딩에서 **어르신 코드** 입력 | 기관 관리에 "승인 대기 · 기관 합류" 1건 | W-3 회귀 |
| 1.6 | A 가 승인 | B 가 그 어르신을 본다 · **B 화면이 새로고침 없이 바뀐다** | Realtime `profile_caregivers` 누락(§W-6c) |
| 1.7 | B 계정으로 **자기 요청 승인 시도** | 버튼이 없고 "다른 담당자가 승인" 안내 | 자가승인 3중 차단이 뚫린 것 — **즉시 중단** |

#### 2. 웹 → 앱 (세션 설계)
| # | 할 일 | 참이어야 하는 것 | 아니면 |
|---|---|---|---|
| 2.1 | 웹에서 회상 세션 설계(제목·내용·**피해갈 내용**·키워드·기록일) | `sessions.status='planned'` 1건 | 설계 7컬럼 미적용 |
| 2.2 | 앱에서 그 어르신 대화 시작 | **같은 행**이 `active` 로 바뀐다(새 행이 생기지 않는다) | `adoptPlannedSession` 회귀 — 설계가 유령으로 남는다 |
| 2.3 | 대화 진행 | 첫 질문이 **설계 키워드** 주제로 열린다 | `generateOpener` 가 설계를 못 받았다 |
| 2.4 | "피해갈 내용" 주제를 어르신이 먼저 꺼낸다 | AI 가 막지 않고 받아 준다 | 회피가 애도 원칙을 깬 것 — 설계 의도 위반 |
| 2.5 | 웹 대화 기록 화면을 열어 둔 채 앱 진행 | 턴이 **실시간으로** 늘어난다 | Realtime `session_logs` 문제 |
| 2.6 | 앱 종료 | 웹 세션 목록이 `ended` + 분석 1건 | 종료 저장 실패 |

#### 3. 일지 · 공개 · 보호자 (이번 배포의 핵심 — 전부 0건인 경로다)
| # | 할 일 | 참이어야 하는 것 | 아니면 |
|---|---|---|---|
| 3.1 | 일지 작성(활동 시간 **적고**, 사진 2장) | `activity_from/to` 가 DB 에 남고 목록에 `09:00 ~ 11:00` | 마이그레이션 `20260906020000` 미적용 |
| 3.2 | 활동 시간을 **비운 채** 저장 | 저장되고 목록엔 시간이 안 뜬다 | 기본값을 지어내고 있다(자리표시자 금지 위반) |
| 3.3 | 음성 입력 탭에서 파일 업로드 | 원문이 채워지거나 **이유가 분명한 오류** | 조용히 빈 칸이면 W-4 회귀 |
| 3.4 | "AI 초안 만들기" | 원문이 관찰 항목(■ 식사/활동/…)으로 묶인다 | `buildJournalDraft` 미연결 |
| 3.5 | 목록의 연필 → 수정 | 값이 채워져 열리고 **기존 사진이 보인다** | 라우트/시딩 회귀 |
| 3.6 | 일지 삭제 시도 | **네이티브 창이 아니라** `ConfirmDialog` | W-5/규약 회귀 |
| 3.7 | 보호자 G 가입 → 어르신 코드로 연결 요청 | A 의 기관 관리에 "승인 대기 · 보호자 연결" | W-3 회귀 |
| 3.8 | A 가 승인 | G 가 `/guardian` 진입, 어르신 이름이 보인다 | `profile_guardians` RLS |
| 3.9 | A 가 일지의 **요약만** 공개(사진 체크 해제) | G 는 일지 본문을 보고 **사진은 못 본다** | 공개 키 복합화 회귀(W-2c) |
| 3.10 | 같은 일지에서 사진도 공개 | G 의 "공유 사진" 갤러리에 2장 | `journal_photos` 공개 경로 |
| 3.11 | AI 요약 공개 후 G 가 **대화 분석**을 연다 | 세션·대화 원문·분석이 **다 보인다** | ⚠️ `20260906000000` 미적용이면 **빈 화면** |
| 3.12 | A 가 그 공개를 철회 | G 화면에서 **즉시** 사라진다(세션·원문 포함) | RLS 가 공개에 매달려 있지 않다 |
| 3.13 | "비공개로 전환" 한 번 | 요약·사진이 **함께** 내려간다 | W-2c 회귀(하나만 내려감) |
| 3.14 | G 가 공개 항목을 열람 | A 에게 확인 알림, 공개 이력에 "보호자 확인" | `mark_share_viewed`·알림 트리거 |
| 3.15 | G 가 메시지 발신 | A 에게 알림 · **A→G 발신 경로는 없다** | 단방향 규약 위반 |

#### 4. 어르신 2명 · 다중 연결
- [ ] G 를 어르신 2명에 연결 → 연결 목록(69:320)에서 **둘째** 카드를 누른다
- [ ] 공개된 소식·분석의 어르신이 **둘째로 바뀐다**(헤더 pill 과 목록이 일치)
- [ ] 주소창 `?elder=` 를 **없는 id** 로 바꿔 본다 → 첫 어르신으로 되돌아간다(빈 화면 아님)

#### 5. 실패가 사실대로 보이는가 (이번에 넣은 안전망)
- [ ] 네트워크를 잠깐 끊고 화면 이동 → 상단에 **"일부 정보를 불러오지 못했어요"** 배너
      · 배너 없이 빈 목록만 보이면 **가장 위험한 회귀**다(기록 없음으로 오해)
- [ ] 다른 기관 계정으로 남의 어르신 URL 직접 접근 → 빈 화면이 아니라 접근 불가
- [ ] 브라우저 콘솔에 **CSP 위반 0건**(배포본 헤더 실측)

#### 완료 판정
위 경로의 행 수가 0 이 아니게 되고(`care_journals`·`journal_photos`·`guardian_shares`·
`profile_guardians`·`notifications`·`messages`·planned `sessions`), **각 단계가 화면에서
확인된다.** 어느 하나라도 "빈 화면" 으로 끝나면 그 줄의 '아니면' 을 먼저 본다.

---

## 2. 사용자가 외부에서 해야 하는 것 (웹 한정)

코드로 끝낼 수 없는 것들. **W-1·W-5 와 병렬로 진행 가능**하다.

| 항목 | 없으면 막히는 것 |
|---|---|
| 도메인 + HTTPS (`giokon.app` DNS 미해석 확인됨) | 배포 자체 |
| Supabase **Auth Redirect URL** 등록 | 로그인 왕복·비밀번호 재설정 |
| **SMTP** 설정 (+ SPF·DKIM·DMARC) | 가입 확인·비밀번호 재설정 메일 |
| **소셜 OAuth 3종** 콘솔 등록 | 소셜 로그인 |
| **`stt-transcribe` 배포**(JWT 검증 켠 채) + `NCP_CLOVA_CLIENT_ID/SECRET` 시크릿 | 요양일지 음성 인식 |
| Edge Function 시크릿 (`NAVER_CLIENT_ID/SECRET`) + **`WEB_ORIGINS`**(웹 오리진 목록, 쉼표 구분) | 네이버 로그인 · `WEB_ORIGINS` 가 비면 `/authorize` 가 400 으로 거절한다(오픈 리다이렉트 차단) |
| 네이버 개발자센터 **Callback URL** = `<프로젝트URL>/functions/v1/naver-auth/callback` | 네이버 로그인 왕복 |
| `naver-auth` **재배포**(`--no-verify-jwt`) — GET 경로가 이번에 추가됐다 | 웹 네이버 로그인 |
| Vercel 프로젝트 + env (`VITE_SUPABASE_URL`·`VITE_SUPABASE_PUBLISHABLE_KEY`) | 배포 |
| **첫 사이트 운영자** `update public.users set is_site_admin = true where email = '…'` | 문의 답변 |
| 유출 비밀번호 차단 ON · PITR/백업 확인 | 운영 안전성 |
| **법인명·대표자·개인정보 보호책임자·수탁자·국외이전** 확정 | 처리방침·약관 시행 |

---

## 3. 결정이 필요한 것

| # | 결정 | 선택지 |
|---|---|---|
| ~~1~~ | ~~일지 음성·AI~~ | ✅ **완성**으로 확정(2026-09-06) |
| ~~2~~ | ~~보호자 세션 조회~~ | ✅ **RLS 확장**으로 확정(2026-09-06) |
| 3 | **브랜드 주황 명도대비** 211곳 | 큰 글자 한정 / 톤 보정 / 현행 유지. 정부심사 대비면 보정 권장. 보정하면 `check:a11y` 를 **차단형**으로 올릴 수 있다 |
| 4 | **계정 삭제** (I) | 웹 셀프서비스 신설 / 현행 접수 방식 유지 |
| 5 | **`giokon.app` vs `gieokon`** | 브랜드 표기 확정(패키지 ID·메일·문서 전부 영향) |

---

## 4. 웹 배포 최소 조건

1. W-1 인증 경로 복구 (가입·네이버·아이디 저장)
2. W-2 보호자 화면 정상화 (세션 조회·다중 어르신·공개 키·교차 공유 차단)
3. W-3 승인 UI
4. W-4 일지 화면을 사실과 일치
5. W-5 보안 헤더·취약점 차단형 CI·CRLF·오류 상태
6. W-7 실데이터 한 바퀴 통과
7. §2 외부 설정 전부 + 법률 문서 확정

W-6 는 배포 후 즉시 후속으로 미룰 수 있다(P1).
