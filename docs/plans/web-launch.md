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

### W-4 · 일지 화면을 사실과 맞추기 (P0)

시안이 약속한 기능이 동작하지 않는다. **둘 중 하나로 정리한다** — 어중간한 상태가 가장 나쁘다.

✅ *2026-09-06 사용자 확정: **완성**(선택 2)*
- `stt-transcribe` 배포 + 음성 업로드→STT→원문 배선 · AI 초안 연결 · 활동 시간을 스키마에 추가.
- ⚠️ `stt-transcribe` **배포와 NCP CLOVA 시크릿 등록은 사용자 작업**이다(§2). 코드측은
  그와 무관하게 먼저 완성하고, 미배포 상태에서는 명확한 오류를 보인다(조용한 실패 금지).
- 어느 쪽이든 함께 고칠 것: **사진 여러 장 중 일부 실패 시 롤백**, `URL.revokeObjectURL`
  누수 해제, **일지 수정 UI**.
  · 완료 기준: 화면이 설명하는 기능이 전부 실제로 동작한다.

### W-5 · 배포 하드닝 (P0)

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

### W-6 · Supabase 정리 (P1)

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

### W-7 · 실제로 한 바퀴 돌리기 (P0)

라이브에는 **보호자 0명 · 일지 0건 · 공개 0건 · 알림 0건 · 설계 세션 0건**이다.
코드가 이어져 있다는 것과 동작한다는 것은 다르다.

- 웹 설계 세션 → 앱 채택 → 종료 → 분석 → 웹 반영
- 일지 작성 → 사진 첨부 → 항목별 공개 → 보호자 열람 → 확인 알림 → 보호자 메시지
- 기관 합류·보호자 연결 승인
  · 완료 기준: 위 경로의 행 수가 0 이 아니게 되고, 각 단계가 화면에서 확인된다.

---

## 2. 사용자가 외부에서 해야 하는 것 (웹 한정)

코드로 끝낼 수 없는 것들. **W-1·W-5 와 병렬로 진행 가능**하다.

| 항목 | 없으면 막히는 것 |
|---|---|
| 도메인 + HTTPS (`giokon.app` DNS 미해석 확인됨) | 배포 자체 |
| Supabase **Auth Redirect URL** 등록 | 로그인 왕복·비밀번호 재설정 |
| **SMTP** 설정 (+ SPF·DKIM·DMARC) | 가입 확인·비밀번호 재설정 메일 |
| **소셜 OAuth 3종** 콘솔 등록 | 소셜 로그인 |
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
