# 기억온 (GiokOn) — 프로젝트 메모리

요양보호사가 어르신 연대기를 입력하면 AI가 1:1 음성 회상 대화를 진행·기록하는
인지활동 보조 플랫폼. 상세 계획은 `PLAN.md`, 스펙은 `docs/`.

## 구조 (pnpm 모노레포)
- `apps/web` (@giokon/web): **요양보호사·보호자 전용** 관리 웹 (React 19 + Vite + Tailwind).
  어르신 음성 대화(TTS/STT)는 웹에 없음 — 앱 담당. (2026-07-11 웹에서 앱 콘텐츠 전부 제거)
- `apps/mobile` (@giokon/mobile): **어르신 대화 앱 (Expo SDK 53 + expo-router + NativeWind 4)**.
  Figma 19화면 추출→구현 완료(2026-07-13). 요양보호사가 조작하는 세션 실행 도구.
  백엔드는 웹과 공용(core/data 재사용) — 프론트만 신규. TTS=expo-speech, STT는 실연동 전 모의.
- `packages/core`: 도메인 타입·규칙·AIProvider(mock)·SpeechProvider
- `packages/data`: supabase-js + TanStack Query 훅 + Supabase Auth + DB↔도메인 매퍼
- `packages/theme`: 디자인 토큰(단일 소스)
- `supabase/migrations`: DB 스키마·RLS

## 작업 방침 (중요)
- **⚠️ 디자인의 임시값을 코드에 넣지 않는다(실서비스 원칙, 2026-08-12 사용자 확정)**:
  Figma·스크린샷의 **정량 지표(82%·23% 향상·평균 12분 등)·예시 분석문·예시 키워드·
  예시 이름/날짜**는 모두 **자리표시자**다. 향후 **AI 또는 사람이 실제로 입력·산출**할
  값이므로 **하드코딩 금지**. 반드시 실데이터에 바인딩하고, 근거가 없으면 **값을 만들지
  말고** `null`/빈 배열 → 화면은 `—`·"아직 관찰된 기록이 없어요" 같은 **빈 상태**로 표시한다.
  (0 과 null 구분: 0회 관찰 ≠ 측정 불가.) 어르신 개인에 대한 관찰 기록을 임의값으로
  표시하는 것은 비의료·정부심사 기준에서 특히 위험하다. 재추출 시 **레이아웃·치수·색·
  타이포·에셋은 Figma 그대로, 내용(값)은 데이터 바인딩**이 원칙.
  구현 근거: `packages/core/src/observations.ts`(근거 없으면 null),
  `apps/mobile/src/lib/format.ts`(`metric()` → 미측정은 `—`).
- **디자인 — 외부 협력 + Claude Design 비교 트랙(2026-07-03 확정)**: 웹·앱 UI 디자인은 외부
  업체가 진행하되, **Claude Design 트랙에 한해 Claude가 프론트를 최신 트렌드 기반으로 직접
  설계·구현**해 외부 업체본과 비교(→ 서비스 채택). 이 트랙 외 임의 재디자인은 하지 않는다.
- **엔터프라이즈·정부심사 기준(2026-07-03 상향)**: 데이터 국내 보관(서울 리전)·「안전성 확보조치
  기준」·민감정보 별도동의·비의료 포지셔닝 락다운·AI 안전(위기 에스컬레이션·투명성/AI기본법)·KWCAG
  접근성·멀티테넌시(organizations/RBAC)·부하/백업/DR을 상시 준수. 상세는 PLAN §2′·§3 +
  `docs/{compliance,security,infrastructure,ai-safety,accessibility}.md`.
- **커밋은 `main` 브랜치에 직접** (사용자 승인).
- 비밀키는 **커밋 금지**(`.env`는 gitignore). 원격 세션은 환경 설정 env +
  `.claude/hooks/session-start.sh`가 `.env` 자동 생성. 로컬 dev는 `apps/web/.env`
  수동 작성(`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`).
- 검증: `pnpm -r typecheck` · `lint` · `test` · `build`.

## 기술 결정
- 서버상태 = **TanStack Query**, UI상태 = **Zustand**.
- AI 스택: **LLM은 현행 프런티어 벤치마크 후 선정(모델명 고정 금지)**,
  STT = gpt-4o-transcribe(Clova Speech 보완), TTS = Clova Voice, **Structured Outputs**.
  실연동은 Supabase Edge Functions(서버사이드 키 보호).
- 인증 = Supabase Auth, 정체성 = `auth.uid()`, 전 테이블 RLS(`user_id = auth.uid()`).
  **로그인 = 소셜 3종(구글·카카오·네이버) + 이메일(아이디)·비밀번호 병행(2026-07-23 재도입 — 이전 "이메일 제거" 결정 사용자 요청으로 철회), 아이디/비밀번호 찾기·회원가입 포함, 회원가입 = 이메일 또는 OAuth 후 온보딩(기본정보 입력). 소셜은 provider 본인인증(이름·전화) 정보를 온보딩에 프리필**
  (구글·카카오=네이티브, 네이버=커스텀 Edge Function `naver-auth`). 계획: PLAN §2′ M17.4~17.7·Phase W1.
- 배포: 웹 = Vercel, 모바일 = EAS.

## Supabase
- 프로젝트: **`GiokOn`** (ref `xilmtqnotomuyjifenmo`, 현 **ap-northeast-1 도쿄** → **서울 ap-northeast-2** 신규 프로젝트로 **이전 예정**, 데이터 국내 보관).
- 마이그레이션 적용·검증 완료(5테이블·RLS·가입 트리거 `handle_new_user`→`public.users`). 서울 이전 시 `organizations`/`consents`/`audit_log` + 조직 RBAC 반영.
- MCP 연결이 세션 내 **간헐적**(대략 턴당 1콜 성공 후 끊김) — 실패 시 재시도보다
  대시보드 SQL Editor 등 대안 사용.
- 컨테이너 아웃바운드는 egress 정책상 `*.supabase.co` 차단(브라우저/로컬은 정상).

## 현재 위치 (2026-08-13)
- 🎨 **Figma 디자인 v2 전면 재적용 완료(2026-08-13, `main`)** — 안드로이드 스튜디오 확인 결과
  기존 구현이 Figma 와 전혀 달라 **16프레임 → 14화면**을 실측 기반으로 재구현했다.
  절차·결정 기록은 `docs/runbooks/figma-app-extraction.md` §v2.
  - **공용 규칙**: 실기기 상태바를 쓰므로 헤더는 `높이 = (114|155) - safeAreaTop`,
    자식은 `top = Figma y - inset` → 화면 절대좌표가 Figma 와 일치(iOS·Android 공통).
    Android `elevation` 은 그림자가 과대해 **전부 `boxShadow`** 로 통일.
    RN 은 CSS 폰트 상속이 없어 모든 `<Text>` 에 Pretendard 굵기 클래스 필수(`check:font`).
    Figma 가 lineHeight 를 자동보다 작게 준 텍스트는 중앙정렬이 아니어서 그대로 쓰면 3px
    떠오른다 → lineHeight 30 + top 보정으로 잉크 위치를 맞춘다.
  - **신설 컴포넌트**: `ScreenHeader`(114/155·탭) · `form.tsx`(프로필 폼 프리미티브) ·
    `ProfileForm`(등록·연대기 수정 공용) · `detail.tsx`(정보카드·칩·세션카드·타일·막대·AI의견) ·
    `charts.tsx`(레이더·꺾은선, react-native-svg). 에셋 20종 추가(@4x 크롭·알파 복원).
  - **검증**: `pnpm check:figma`(scripts/check-figma-spec.mjs, **106항목**)로 실측 수치를 고정 +
    Pillow 로 `assets/figma/*.png`(@4x) 와 픽셀 대조(상태바·실사진·데이터 바인딩 제외 잔차 0.6~1.4%).
  - **자리표시자 처리(사용자 확정)**: 인지효과 5축은 실측 관찰지표로 재정의(core
    `computeAxisObservations`), 월별 추이는 `computeMonthlyAxisTrend`/`computeMonthlyTopicTrend`
    신설, 대화 기록 재생바는 '녹음 없음'(세션 음성 저장 미구현), 감정 분석 %는 관찰된 응답
    분포로 대체. 비의료 카피("인지 효과 분석"·"향상")는 **보류** 결정에 따라 Figma 그대로.
  - **스키마 추가**: `profiles.photo_path`(private 버킷 elder-photos + signed URL)·
    `profiles.gender`(enum) — 라이브 적용 완료. 사진 입력은 `expo-image-picker`.
  - ⏳ **잔여(사용자)**: 안드로이드 스튜디오 재실행 후 화면별 육안 대조.
- 🐞 **기기 첫 실행 크래시 3종 진단·수정(2026-08-02, `main`)**: 앱을 Expo Go 실기기에서
  **처음 실행**(그간 Metro 번들만 검증)하며 표면화된 문제들. **(A) 의존성 중복(사용자 커밋
  `a936160`)**: pnpm 심링크로 `@giokon/data`의 react/react-query 피어가 웹 트리와 공유돼
  react@19.2.7로, 모바일은 19.0.0 → 앱 번들에 React 2벌 → 디스패처 null("Invalid hook call /
  useMemo·useContext of null") 크래시. 수정=`pnpm.overrides`(pnpm10서 무시됨)를
  `pnpm-workspace.yaml overrides`로 이동(reanimated 3.17.4 핀) + `apps/mobile/metro.config.js`
  의 `resolveRequest` origin 고정으로 react·@tanstack/react-query를 앱 단일본으로 강제 +
  RN 0.79.5→0.79.6 정렬. **검증(Claude)**: 웹 빌드 성공·Metro 번들 성공·활성 그래프 RN 0.79.6
  단일(0.79.5는 스토어 잔재). ⚠️ **물리 중복(19.0.0/19.2.7)은 잔존**하고 metro 훅이 런타임서만
  단일화하는 workaround(웹은 19.2.7 단일이라 무관). ⏳ **사용자 확인**: `npx expo install --check`
  로 Expo SDK53이 RN 0.79.6을 권장하는지(egress 차단으로 Claude 확인 불가). **(B) Zustand v5
  불안정 셀렉터(Claude 커밋 `879f5ad`)**: dep fix가 안 건드린 코드 루프. Zustand 5는
  useSyncExternalStore라 셀렉터가 매 렌더 새 배열/객체를 반환하면("getSnapshot should be
  cached" 경고+"Maximum update depth" 크래시) 무한 리렌더. `src/data/reads.ts`의 파생 배열
  셀렉터 7개(eldersSorted·chroniclesByElder·sessionsByElder·logsByElder·elderConsents·
  useElderAnalyses·Object.values(analyses))를 **useShallow로 안정화**(.find·함수·원시 슬라이스는
  안정 참조라 제외). 검증: 전 게이트+Metro 번들. **잔여(사용자)**: 기기에서 재실행해 3종
  크래시 소멸 최종 확인 + RN 버전 권장치 확인.
- ▶ **1차 MVP 마무리 진행(2026-07-31, `main` 브랜치 직접) — 계획 `docs/plans/mvp-roadmap.md`**:
  개발을 태스크(T0~T9) 단위로 진행. **AI 정책=웹과 동일하게 대화 AI는 mock/규칙기반 유지
  (실 AI=T3~T5·T7은 MVP 이후 무변경 전환, API 비용 0)**. MVP 필수셋=T0·T1·T2·T9.
  **코드 완료**: ✅ T1 관찰지표 라이브화(core 순수함수+어댑터, `4957ad2`) · ✅ T2 세션 견고화
  (자동 종료 10턴+저장 재시도, `9be984d`) · ✅ T9 코드측(eas.json·vercel.json, `d565d1e`).
  **T0 완료·라이브 검증 완료(2026-08-01, MCP 채널)**: 사용자가 서울 프로젝트 `MemoryOn`
  (ref `ufkbzpdjomtmxjipmwub`, ap-northeast-2 — 구 CLAUDE.md의 도쿄 `xilmtqnotomuyjifenmo`
  아님)에 마이그레이션 적용·env 입력. Claude가 MCP로 스키마(16테이블 RLS)·RPC·트리거(org_id 스탬프·bootstrap)·
  Realtime·보안 advisor 검증 + **인증 롤백 트랜잭션 E2E**(register→session→logs→analysis→
  safety + chronicle+consent, RLS 하 쓰기/조회) 통과. **라이브 버그 2건 수정**: (1)
  `safety_events` Realtime publication 누락(`63fab18`+라이브 적용), (2) **session_logs
  turn_index 0-기반→1-기반**(DB check `>=1` 위반으로 실서비스 세션저장 전부 실패했을 크래시,
  `cb054ae`). **잔여(사용자)**: ⏳ 앱 UI E2E(기기)·⏳ T9 배포(Vercel/EAS — 코드측 완료).
  추가 견고화: 자동종료 정책 core 이관+테스트(`fdd95b5`)·에러 바운더리(`4bb29ab`).
- ✅ **모바일 앱 실데이터 배선(2026-07-31, 브랜치 `claude/app-development-session-4cvhm5`)**:
  그간 앱은 목업 Zustand로만 동작(@giokon/data 미호출)이라 "키 채우면 라이브" 약속이
  실제로는 거짓이었다. 이를 실제로 만들어 **앱↔웹 공유 DB 양방향 흐름**을 라이브화.
  스코프=사용자 확정 **"핵심 양방향만"**(관찰지표 집계 화면은 analytics.ts 목업 결합 →
  후속). 디자인 불변(화면 JSX 그대로, 데이터 소스만 목업→라이브 전환, **미설정 시 목업
  폴백 보존**). **1** 인증=웹 AuthProvider 미러(모바일 `src/auth/AuthProvider`,
  signInWithEmail·미설정 시 목업 브리지) → **2** 읽기 어댑터 `src/data/reads.ts`
  (어르신·연대기·세션·로그·분석, live=훅+mappers/mock 전환, 라이브 유휴 게이트) +
  `toSession` 매퍼·`useProfiles({enabled})` 추가 → **3** 세션 영속화
  `src/data/session-persistence.ts`(종료 시 sessions·session_logs·session_analyses·
  safety_events 배치 insert=앱→웹, DB 생성 id 사용, `beginSession(elder,chronicles,input)`
  로 런타임을 목업서 분리) + `useGiokonRealtime` 브리지 → **4** 쓰기 어댑터
  `src/data/writes.ts`(등록·연대기·동의, async+실패 안내). 검증: 전 게이트(typecheck·
  lint·test 149·build·check:copy) + Metro iOS 번들. **잔여(후속)**: 관찰지표 집계 화면
  라이브화(analytics.ts 순수함수 리팩터), 세션 예약(web→app `planned`), 소셜 OAuth·실 STT.
- ✅ **어르신 영속 코드 + 요양보호사 배정 재설계(2026-07-22, 마이그레이션 `20260722100000`)**:
  담당 요양보호사가 바뀌거나 늘어도 기존 기록을 그대로 인계받도록, 어르신 단일 소유
  (`profiles.user_id`)를 "최초 생성 actor"로 낮추고(nullable·SET NULL) **배정 모델**로 전환.
  `elder_codes`(영속·비소진 코드, 보호자 미열람)·`profile_caregivers`(배정) 신설, 자식 복합
  FK 완화(쓰기 연속성), 코어+파생 **9테이블 RLS 배정 기반 재작성**(같은 기관 격리 유지),
  `claim_elder_by_code`(요양보호사 인계)·`link_guardian_by_elder_code`(보호자 연결, 구
  redeem 1회성 대체)·`complete_onboarding` 개정. **QR/`/join`·qrcode.react 제거**(코드 텍스트
  전달). 사용자 확정: 배정 모델 A·같은 기관 한정·읽기+쓰기 완전 연속·QR 제거. 검증: 전
  게이트 + 로컬 PG16 RLS 회귀(§5.7 재작성·§5.7b 연속성 신설) + 라우트 스모크 16/16.
  **후속(적대적 리뷰·기관 합류, 마이그레이션 `20260722110000`·`20260722120000`)**: 서버측
  `rotate_elder_code`(코드 회전 결정성 버그 수정)·잔여 QR 카피 정리 →
  **요양보호사 기관 합류 승인형** 완성: 온보딩에서 어르신 코드로 기존 기관 합류 요청
  (`profile_caregivers.status='pending'`)·`approve_caregiver_assignment`(활성 담당/admin 승인,
  자가승인 3중 차단)·claim 가드(활성 멤버만)·pending 배너/승인 UI. §5.7b 를 실제 온보딩→승인
  경로로 재작성(슈퍼유저 우회 제거)·§5.7c(회전) 신설. 전 게이트 재통과.
- ✅ **웹 1차 MVP 구현 완료(2026-07-19, Phase W1~W6 — 브랜치 `claude/amazing-davinci-tjy3r5`)**:
  **W1** 소셜 로그인 3종(구글·카카오 네이티브+네이버 커스텀 함수 스캐폴드)·온보딩 회원가입
  (`complete_onboarding` RPC)·보호자 초대(QR·72h·1회성)+승인·역할 라우팅·safety_events guardian
  배제 → **W2** 세션 기록 DB 배선+Realtime(`useGiokonRealtime`) → **W3** `session_analyses`+분석
  페이지(SCR-W07) → **W4** `care_journals`+요양일지 3경로(SCR-W06)+AI 초안 mock → **W5**
  `guardian_shares`+공개 체크리스트(SCR-W08)+보호자 타임라인(SCR-W09) → **W6** AI 에이전트 패널
  (SCR-W11, mock·사람 확인 게이트). 마이그레이션 6종(20260718*) 신설, RLS 회귀 §5.6~5.10 확장.
  검증: 전 게이트 + 로컬 PG16 RLS 회귀 + 라우트 스모크 17/17(`apps/web/scripts/route-smoke.mjs`).
  **잔여=사용자 외부 작업**: 서울 리전 적용(M10.1)·소셜 OAuth 콘솔 등록·naver-auth 배포·실 AI 키.
- Phase A 완료 · Phase B(DB/Auth) 라이브 검증 완료 · M5.2(웹 Auth) 완료 · T2.4(A) 완료.
- **모바일 앱 1차 구현 완료(2026-07-13)** — 아래 참조. 웹 대시보드 완료. 백엔드(core/data) 앱·웹 공용.
- 🗣️ **현직자 인터뷰 → 웹 1차 MVP 계획 반영 완료(2026-07-13)**: 요구 5건을 계획화 —
  **M19 요양일지 신설**(사진/음성/타이핑+AI 초안), M17 확장(M17.0 safety_events guardian 배제
  RLS·M17.4 초대 코드 가입/역할 라우팅/랜딩 개편 — 보호자 무인증·광역 접근 제거), M16 개정
  (분석 페이지+Realtime), M18 개정(보호자 설명 에이전트·사람 확인 게이트). 실행=**Phase W1~W6**
  (PLAN §2′ "웹 1차 MVP 재정의"·§3 Phase W·tasks §3-3). 위임 결정 4건 확정(이메일+승인 게이트·
  초대 코드+QR·LLM 비전·작업 지향 에이전트). 입력: `docs/interview-findings.md`(반영 완료 표기).
  **다음 개발 = Phase W1(인증·접근통제)**.
- 🔐 **인증 개편 계획 반영(2026-07-16, 코드 미변경)**: 로그인=소셜 3종(구글·카카오·네이버)·**이메일 로그인 제거**·
  **온보딩 회원가입(기본정보 입력)**·**보호자 어르신 연결(가입+로그인 후, 승인 게이트)**.
  M17.4 개정·M17.5~17.7 신설(PLAN §2′)·SCR-W05/W12(design)·F-32~34·NF-W2(requirements)·T17.5~7(tasks). 구현은 Phase W1.
  (※ 연결 코드 방식은 2026-07-22 재설계로 **어르신 영속 코드**(QR·1회성 초대 폐기)로 확정 — 위 재설계 항목 참조.)
- **2026-07-03 목표 상향** → 엔터프라이즈·정부심사 기준 전면 재계획(PLAN §2′ M9–M15 · §3 Phase G–L).
- **Phase G/H DB 기반 완료(로컬 PG16 검증)**: 마이그레이션 7종(organizations/RBAC·audit_log·
  consents·consent_retention·safety_events) + RLS 회귀 테스트 + CI(quality·rls-regression·SCA·
  비의료 카피 린트). **M12 노인 특화 대화 안전 설계 전면 완성**(8상황 분류·3중 방어·프롬프트·
  세션 시뮬레이션 — `docs/ai-safety.md`).
- **웹 대시보드 개발 완료(2026-07-11)**: 동의 수집·게이팅(대리동의·의사능력), 안전 알림
  대시보드·확인 처리, 기관 관리, 설정(비밀번호·데이터 다운로드·삭제 안내), 처리방침·약관 초안,
  비밀번호 재설정, AI 투명성 표시. **Supabase 서버·API는 미연동** — 연동은 사용자가 외부에서
  진행(`docs/runbooks/seoul-region-migration.md`), 연동 시 코드 변경 없이 동작.
- ⏳ **차단(사용자)**: M10.1 서울 리전 프로젝트 생성 + 마이그레이션 적용 + env 재배선.
- **아키텍처 확정(2026-07-12, 사용자 상세 확정)**: 환자는 앱을 조작하지 않는다.
  - **앱(Expo)** = 요양보호사 조작 세션 실행 도구: 환자 선택 → 세션 생성(주제 직접 설정 or **AI 자동 추천**) → 기기 전달 → **환자 음성 대화(TTS/STT)** → 종료 시 **AI 자동 요약·분석**(좋았던/저조했던 주제 등) → 저장.
  - **웹** = 관리·분석 허브: 담당 환자 전체 기록·요약·분석 **Realtime 조회**, 세션 설계(직접/AI 추천), 환자 관리, **보호자 공유 커밋**(선별·승인된 것만 보호자에 노출), **AI 에이전트**(세팅·관리·커밋 보조).
  - **보호자 웹** = 커밋(승인)된 데이터만 열람.
  - 백엔드(`core` 안전엔진·프롬프트 / `data` Supabase 훅 / 마이그레이션)는 앱·웹 공용 → 앱은 프론트만 신규.
  - 비의료 락다운: 분석은 "효능/향상" 주장 금지, **관찰 지표**(참여도·응답률·발화량·주제 반응·관심 변화)로. 내부 명칭 "인지치료" 무방, 노출 카피는 "인지활동"(CI 린트 강제).
  - Figma 앱 디자인 확보: 파일 `nLfWkg2H7dFfDH1pehcH5I`(19화면). 상세 트랙: PLAN §2′ M16–M18.
  - (2026-07-11) 웹에 있던 어르신 대화/꾸미기·아바타·브라우저 음성 프로토타입은 **제거 완료**.
- **모바일 앱(중요)**: **Figma 19화면 추출→Expo 앱 1차 구현 완료(2026-07-13)**. 파일
  `nLfWkg2H7dFfDH1pehcH5I`에서 토큰·구조·스크린샷 추출 → `apps/mobile`(Expo SDK 53·expo-router·
  NativeWind 4)로 19화면 + 컴플라이언스 화면(동의·AI고지·위기배너) 구현. 백엔드는 웹과 공용
  (core/data 재사용). 절차·상세: `docs/runbooks/figma-app-extraction.md`, `apps/mobile/README.md`.
  검증: typecheck·lint·test·web build·check:copy + Metro iOS 번들(1146모듈) 통과. 실기 확인·실
  STT/TTS/LLM·Supabase 연동은 사용자 몫(미설정 시 목업 동작). 추가 화면·재작업은 이 앱 위에서 진행.
- 참고: 프로토타입 도메인 ↔ v1 스키마 불일치(아바타 꾸미기·치료세션 템플릿은 v1 스키마 없음 → 매퍼 기본값).
  세션·대화 이력은 아직 Zustand 스토어(Phase E에서 DB 배선).
