# 기억온 앱 — 배포까지 남은 것 전부

> **2026-09-12 현재 계획**: [음성 상세](voice-ai-personalization.md)와 [개발 실행안](business-plan-development-delta.md)을 따른다. 초기 Gemini Live 직접 음성 입력·대화 → 서버 검증 텍스트 → Clova TTS, 담당자 시작·회수형 운영이 목표다. 현재 확인 패널·Live 재생 구현과 구분하며 신규 작업은 미완료다. 일지의 최종 확인·공개 승인은 유지한다. 장기 Whisper·Qwen3.5-9B 특화는 독립 자료·평가 후 진행한다.

- 작성일: 2026-09-04
- 성격: **실행 목록.** 검증 근거·감사 보고서 대조 기록은 `app-release-plan.md` 에 있다.
- 범위: **모바일 앱 스토어 배포.** 웹은 *앱이 의존하는 지점*(비밀번호 재설정 · 법적 고지 ·
  계정 삭제 URL)과 *앱과 공유하는 코드*(`packages/data`)만 포함한다.
- 검증 한계: 컨테이너 egress 가 `*.supabase.co` · `figma.com` · DNS 조회를 막는다.
  **실 API 응답 · DNS · 스토어 콘솔 · 서명 빌드는 저장소만으로 확정할 수 없다.**

---

## 0. 오늘(2026-09-04) 끝낸 것 — 다시 손대지 않아도 된다

| 항목 | 커밋 |
|---|---|
| 검열 안 된 AI 원본 음성 재생 차단(`playback.ts` + 오프너 가드 + 테스트 4건) | `829a242` |
| 조작된 어르신 발화가 실제 기록으로 저장되던 문제(`mockStt` 삭제, 빈 발화 차단) | `72ce705` |
| 목업 모드 제거 — 키 없으면 부팅 차단(`ConfigError`) | `72ce705` |
| 앱 진입 자격 가드(보호자·미온보딩·기관없음 차단, 테스트 8건) | `72ce705` |
| `expo-linear-gradient ^57.0.1 → ~14.1.5` (prebuild 실패 확정이었다) | `829a242` |
| `NSPhotoLibraryUsageDescription` 누락(iOS 크래시 + 심사 거부) | `829a242` |
| 비밀번호 재설정 링크 404 (`/reset` → `/reset-password`) | `829a242` |
| `package.json` 한글 깨짐 + mojibake 게이트 | `829a242` |
| `journal_photos` Realtime 구독 누락 | 이번 커밋 |
| `check:a11y` 종료 문구가 "통과" 로 읽히던 문제 | `5c1a2cc` |
| **A** 번들 ID `kr.gieokon.app` → **`kr.giokon.app`** (브랜드 통일) | 이번 커밋 |
| **B** **Expo SDK 53 → 54** (RN 0.81.5 · React 19.1.0 · Reanimated 4 · NativeWind 4.2.6) | 이번 커밋 |
| **D** `supportsTablet` → **false** | 이번 커밋 |
| Android **API 36 명시 고정**(`expo-build-properties`) — 기본값에 기대지 않는다 | `e366a8e` |
| 🔴 **users 권한 상승 취약점**(누구나 본인 role 을 org_admin 으로) 3중 차단 | 이번 커밋 |
| RLS 회귀 하네스가 **잘못 통과하던 문제** 3건 정정(auth 스키마 권한·`auth.role()` 심) | 이번 커밋 |

---

## 1. 이번에 재검토한 두 건 — 지적이 맞았다

### 1.1 `journal_photos` — "publication 에 있다" ≠ "연결돼 있다"

앞서 감사 보고서의 *"Realtime 대상에서 빠져 있다"* 를 **반증으로 처리한 것은 성급했다.**
DB 계층만 보고 판단했다.

| 계층 | 상태 |
|---|---|
| DB `supabase_realtime` publication | ✅ 포함(2026-08-28~) |
| 클라이언트 `RealtimeTable` 타입 | ❌ 없음 |
| `DEFAULT_TABLES` 구독 목록 | ❌ 없음 |
| `invalidateFor()` 캐시 무효화 | ❌ 없음 |

즉 **DB 는 변경을 방송하는데 받는 쪽이 없었다.** 요양일지 사진은 실시간 갱신되지 않았다.
→ 세 곳 모두 연결했다. publication ↔ 구독 목록 차집합이 이제 **0** 이다.

**남은 것**: `care_journals` 는 아직 **publication 자체에 없다**(마이그레이션 필요, §3).
`profile_guardians` · `profile_caregivers` · `consents` · `elder_codes` · `inquiries` 도 마찬가지다.

### 1.2 `check:a11y` — 스크립트 버그가 아니다

`DESIGN_RULES = new Set(['color-contrast'])` 로 **대비 규칙만** 따로 빼서 정보성 표로 출력하고
`fails` 에서 제외한다. 나머지 axe WCAG 2.1 A/AA 위반과 모달 키보드 실패는 그대로
`process.exit(1)` 이다. 즉 **의도적 비차단**이고, 이유도 코드에 적혀 있다
(*"시안이 정한 색이라 코드가 임의로 바꾸지 않는다 — 사용자 확인 대기"*).
프로젝트의 "임의 재디자인 금지" 원칙과 일관된 처리다.

다만 지적대로 **결과를 "접근성 전체 통과" 로 읽으면 안 된다.** 마지막 줄이 `✓ ... 통과` 라
그렇게 읽혔다 → 대비 미달이 남아 있으면 `△ 차단 항목 없음 / 단, 대비 미달 N종 M곳이
남아 있다 — "접근성 통과" 가 아니다` 로 바꿨다. **비차단 자체는 그대로 뒀다**(디자인 결정 대기).

그리고 **242곳은 웹 측정값이다.** 스크립트는 `apps/web/scripts/a11y-audit.mjs` 이고,
Playwright 로 웹 preview 를 1440px 뷰포트에서 열어 웹 라우트(`/privacy`·`/terms`·`/inquiries` 등)를
돈다. 모바일은 한 줄도 지나지 않는다.
→ **모바일 대비 검증 부재는 별개의 공백**이다(§3, 앱에는 대비 검사가 아예 없다).

---

## 2. P0 — 이것이 끝나기 전에는 스토어에 올리지 않는다

2026-09-04 당시 잔여 분류는 §5를 참고한다. **2026-09-11 AI 계획 변경으로 코드 작업도 출시 선행 조건에 추가됐다.** 아래 AI 게이트를 완료하기 전 새 음성 경로로 출시하지 않는다.

### 2.1 새 음성 AI 출시 게이트(미구현)
- [ ] A0: 일반 Gemini 오디오 이해/기존 Live/ASR 후보의 한국어 어르신 기준선·계약·데이터 흐름 확인
- [ ] A1: Live 자동 진행·시작/회수·예외 재확인·서버 응답 검증·검증 문장만 Clova TTS 재생
- [ ] 대화 지원 모드·개인 의미 승인/조회·문맥 위험 확인 및 담당자 대응 회귀 검증
- [ ] 실제 기기에서 긴 휴지·사투리·무음·위험 오인식·재접속·재생 취소 평가
- [ ] 학습 수집을 켜는 경우에만 A2 동의·권리·보유기간·계보·철회/파기 게이트 완료(미참여자는 서비스 이용 가능)
- [ ] 신규 API 경로의 서버 자격·동의·한도 검증. 기존 live-token 잠금은 별도 유지

상세: [음성 AI 전환 계획](voice-ai-personalization.md). A3~A5 자체 모델 학습·전환은 초기 출시 필수가 아니다.

---

## 3. P1 — 공개 베타 전 (코드 작업, 지금 착수 가능)

### 3.1 오류가 빈 상태로 보인다 ★ 가장 먼저
`src/data/reads.ts` 에 `error`/`isError` 참조가 **0건**이다. RLS 거부·네트워크 실패·서버 오류가
전부 "기록이 없어요" 로 보인다. 어르신 기록 시스템에서 이건 **사실 왜곡**이다.
- [ ] 읽기 훅이 `{ data, loading, error }` 를 돌려주게 바꾼다
- [ ] 화면마다 빈 상태 ↔ 오류 상태를 분리(재시도 버튼 + 문의용 식별자)
- [ ] 0 과 null 을 계속 구분한다(0회 관찰 ≠ 측정 불가)

### 3.2 세션 소유권·복구
- [ ] `cancelSession` 이 원격 세션을 `ended` 로 닫게 한다 — 지금은 로컬 상태만 지워
      DB 에 `active` 좀비 세션이 남고 웹에서 영원히 "진행 중" 으로 보인다
- [ ] `adoptPlannedSession` 이 **갱신된 행 수**를 확인하고 0이면 새 세션을 만든다 —
      지금은 두 기기가 같은 설계 세션을 잡아 `(session_id, turn_index)` 를 서로 덮어쓸 수 있다
- [ ] 앱 강제 종료 후 진행 중 세션 복구 경로(현재 런타임은 메모리에만 있다)

### 3.3 Storage 제한
- [ ] 버킷에 `file_size_limit` · `allowed_mime_types` 설정(둘 다 미설정)
- [ ] 업로드 전 리사이즈 — 지금은 `quality: 0.8` + base64 뿐이라 해상도 상한이 없다
      (12MP 사진이면 base64 문자열만 수 MB → 저사양 안드로이드에서 메모리 압박)
- [ ] EXIF 제거(얼굴 사진에 위치정보가 붙는다)

### 3.4 Realtime 나머지 연결
- [ ] `care_journals` · `consents` · `profile_caregivers` · `profile_guardians` 를 publication 에 추가
      (마이그레이션) — 앱은 특히 **배정·동의 변경**을 즉시 반영해야 한다
- [ ] 추가한 테이블을 `RealtimeTable` · `DEFAULT_TABLES` · `invalidateFor()` **세 곳 모두**에 연결
      (§1.1 이 준 교훈 — 한 곳만 하면 조용히 아무 일도 안 일어난다)

### 3.5 모바일 접근성 (§1.2 의 별개 공백)
- [ ] **앱에 대비 검사 게이트를 만든다**(`check:contrast`) — 지금은 아예 없다.
      Pretendard 클래스 검사(`check:font`)처럼 정적으로 전경/배경 쌍을 추출해 계산하면 된다
- [ ] 측정 후 미달 목록을 사용자에게 올린다 → 브랜드 색 결정은 §5

### 3.6 운영 가시성
- [ ] 크래시·오류 수집(Sentry/Crashlytics) — 지금은 장애를 사용자 신고로만 안다
- [ ] AI 토큰·오디오 비용 알림, 기관별 상한

### 3.7 다단계 쓰기 원자성
- [ ] 어르신 생성 → 사진 업로드 → 프로필 갱신 → 연대기 생성이 별개 요청이라
      중간 실패 시 부분 데이터·고아 파일이 남는다 → RPC 이관 또는 보상 트랜잭션

---

## 4. P2 — 정식 운영 안정화

- [ ] 화면 적응성: 320px · iPhone SE · 시스템 글자 200% · 가로 모드 · 태블릿(또는 `supportsTablet:false`)
- [ ] 음성 UX: 1.6초 침묵 종료 판정 재조정 · 사투리 · 작은 목소리 · Bluetooth 보청기 ·
      전화 수신 시 오디오 포커스 · TTS↔마이크 echo
- [ ] 푸시 알림(APNs/FCM) — 안전 이벤트를 앱이 닫혀 있어도 전달
- [ ] 위기 키워드 오탐/미탐 검증 + 야간·휴일 담당자 SLA
- [ ] `supabase/config.toml` 신설 · 런북의 마이그레이션 수 정정(19/21 → **36**) ·
      `database.types.ts` 자동 생성 전환 + 스키마 드리프트 CI
- [ ] 의존성 취약점 분류(런타임/빌드타임/도달불가) 후 차단형 CI
- [ ] `ios.config.usesNonExemptEncryption` · `eas.json` `env` · `submit.production` 정리

---

## 5. 요청 드립니다 — 제 판단 밖이거나 제가 할 수 없는 것

여기부터는 **결정 또는 외부 계정·계약**이 있어야 움직입니다. 코드로 해결할 수 없습니다.

### 5.1 결정된 것 (2026-09-04) — 반영 완료

| # | 결정 | 반영 |
|---|---|---|
| **A** | 번들 ID `kr.giokon.app` 로 통일 | ✅ `app.json` ios·android 동시 변경 |
| **B** | Expo SDK 54 로 상향 | ✅ 아래 §5.1.1 |
| **C** | 주황 `#e9822b` 대비 **현행 유지** | ⏳ **배포 직전에 다시 여쭙는다**(§5.3) |
| **D** | `supportsTablet: false` | ✅ 반영. ⏳ **배포 직전에 다시 여쭙는다**(§5.3) |
| **E** | 녹음 저장 v2 유지 — 사업 확장 후 | ⏸ 보류(코드 변경 없음) |

#### 5.1.1 SDK 54 상향 결과

`expo@54.0.37` 의 `bundledNativeModules.json` 을 그대로 따랐다(추정 없음).

- `react-native 0.79.6 → 0.81.5` · `react 19.0.0 → 19.1.0`
- `react-native-reanimated 3.17.4 → 4.1.1` — **New Architecture 전용**. 별도 패키지가 된
  `react-native-worklets` 는 pnpm 이 0.12.1(RN 0.83~0.87 전용)을 골라 SDK 54 지정본 **0.5.1** 로 고정
- `nativewind 4.1.23 → 4.2.6` (+ `react-native-css-interop 0.1.22 → 0.2.6`) — 4.1.x 는 Reanimated 3 대상이다
- `expo-linear-gradient ~14.1.5 → ~15.0.8`, `expo-router 5 → 6`, 그 외 expo-* 전량 정렬
- `@expo/metro-runtime` 6.1.2 고정(expo-router 6 요구, 호이스트가 5.x 를 남겼다)
- `@types/react` 오버라이드 19.0.10 → **19.2.14** (웹 19.2 에 맞춤 — RN 0.81 은 19.x 면 된다)
- **Android API 36 을 `expo-build-properties` 로 명시 고정**
  (`compileSdk/targetSdk 36`, `minSdk 24`, iOS deployment target 15.1).
  SDK 기본값에 기대지 않는다 — 판올림마다 달라지고, Play 요건은 못 어긴다.
- `expo-file-system` 이 새 API(File/Paths)로 바뀌어 `player.ts` 를 `expo-file-system/legacy` 로
  옮겼다(상향의 변경 범위를 좁히기 위함 — 아래 후속 참고)

**검증**: typecheck 5패키지 · lint 0 · test 249 · **Metro 번들 Android·iOS 양쪽 성공**
(각 5.8MB hbc). 번들이 되는 것이 RN 상향의 실질 시험이다.

**후속(코드, P1)**
- [ ] `expo-av` → `expo-audio` 전환 (SDK 54 에서 deprecated, SDK 55 에서 제거). `live/player.ts`·`live/mic.ts`
- [ ] `expo-file-system` 새 API 로 이관 — `File.write(Uint8Array)` 로 **WAV base64 왕복을 없앨 수 있다**
      (지금은 턴마다 전체 WAV 를 base64 로 인코딩한다)
- [ ] ⚠️ **`react-native-live-audio-stream@1.1.1` New Architecture 호환은 아직 미검증**이다.
      config plugin 없는 bare 모듈이라 **네이티브 빌드(EAS)로만 확인된다** — JS 번들 성공이
      이걸 보증하지 않는다. 첫 EAS 빌드에서 반드시 확인할 것

### 5.3 배포 직전에 다시 여쭐 것 (사용자 요청)

**⚠️ 스토어 제출 직전에 이 두 가지를 반드시 다시 언급한다.**

1. **주황 `#e9822b` 대비 2.73:1** — AA 4.5:1 · 큰 글씨 3:1 **둘 다 미달**이다. 현행 유지로
   결정했으나, 고령자 대상 + 정부심사·KWCAG 목표를 고려하면 출시 전 마지막 판단이 필요하다.
   (§3.5 대비 게이트가 만들어지면 정확한 미달 목록을 함께 올린다.)
2. **`supportsTablet: false`** — 태블릿을 지원하지 않기로 했다. 요양기관에서 태블릿 사용
   가능성이 있다면 출시 전에 다시 정해야 한다(출시 후 추가는 가능하나 UI 작업이 따른다).

### 5.1.2 ⚠️ 라이브 DB 적용 대기 — `20260908000000_users_privilege_hardening.sql`

**권한 상승 취약점 수정본이 아직 운영 DB(`MemoryOn`)에 적용되지 않았습니다.**
저장소에만 있고, 라이브는 여전히 취약합니다. 운영 DB 변경은 되돌리기 어려워
제 판단으로 적용하지 않았습니다 — **적용을 지시해 주시면 바로 진행하겠습니다**
(또는 대시보드 SQL Editor 로 직접 붙여넣어도 됩니다).

적용 전까지의 위험: 요양보호사·**보호자** 계정 누구나 publishable 키와 본인 JWT 만으로
`update users set role='org_admin' where id=auth.uid()` 를 실행해 기관 관리자가 될 수 있고,
그러면 **기관 전체 어르신의 기록·구성원·organizations** 를 읽고 쓸 수 있습니다.

### 5.2 사용자만 할 수 있는 외부 작업

**도메인·메일**
- [ ] `giokon.app` DNS · HTTPS 활성화 (컨테이너에서 조회가 막혀 제가 확인 못 했습니다)
- [ ] `/privacy` · `/terms` · `/support` · `/account-deletion` 이 **로그인 없이** 열리는지
- [ ] Supabase Auth redirect allowlist 에 앱 스킴(`giokon://auth/callback`) 등록
- [ ] 운영 SMTP · SPF/DKIM/DMARC · 재설정 메일 스팸함 테스트

**법률 — 코드가 "채워야 한다" 고 직접 표시하고 있는 항목**
- [ ] 운영 법인 · 대표자 · 사업자 정보
- [ ] 개인정보 보호책임자 이름 · 연락처
- [ ] 실제 AI·음성 처리업체 및 **국외 이전 정보**(수탁사 · 이전 국가 · 시점 · 방법 · 보유기간)
- [ ] 동의 법률 문구 확정(`packages/core/src/consent.ts` 가 외부 법률 검토 필요를 명시)
- [ ] `consents_guardian_check` 완화 여부 — 완화하면 보호자 동의에서 성함 필드를 뺄 수 있습니다
- [ ] 의료기기 해당성 · 광고 표현("인지 효과 분석"·"향상") 검토
- [ ] AI 기본법 적용성 검토

**AI 제공사**
- [ ] **Gemini Paid tier 강제** — 무료 tier 는 약관상 입력 콘텐츠가 제품 개선·사람 검토에
      쓰일 수 있습니다. **어르신 음성·가족사에는 쓸 수 없습니다**
- [ ] DPA 체결 · 로그 보관기간 · 처리 국가 확인 → 국외이전 동의 문구에 반영
- [ ] `gemini-3.1-flash-live-preview` 는 preview 입니다 → production 모델 확정 또는 중단 대비 폴백
- [ ] **실 키로 Live 엔드포인트 경로·ephemeral token 전달 방식 확인**
      (필드 대소문자는 문제가 아닙니다 — protobuf JSON 은 양쪽을 다 받습니다)

**스토어**
- [ ] Apple Developer / Google Play 콘솔 계정 · 서명 인증서 · keystore 백업
- [ ] **앱 내 계정 삭제 경로**(Apple·Google 모두 필수) — 만들 준비는 됐고 삭제 정책만 정해 주시면 됩니다
- [ ] **Sign in with Apple** 추가 여부 (Guideline 4.8 — 제3자 소셜만 있으면 거부 사유입니다)
- [ ] Data Safety form · Privacy nutrition label · Google Health Apps declaration
- [ ] 리뷰어용 테스트 계정(어르신 데이터가 들어 있는 계정은 피해 주세요)

**Supabase 운영**
- [ ] 36개 마이그레이션 ↔ 라이브 DB 객체 단위 재대조
- [ ] PITR/백업 보존기간 + **실제 복원 훈련**
- [ ] 개발·스테이징·운영 프로젝트 분리
- [ ] DB·Storage 사용량 및 비용 알림

**실기기 QA** (제가 기기가 없어 전혀 못 합니다)
- [ ] iPhone SE급 · 최신 iPhone · 저사양 Android · Samsung 최신
- [ ] 시스템 글자 200% · VoiceOver · TalkBack
- [ ] 3G급 느린망 · Wi-Fi↔LTE 전환 · 일시 단절
- [ ] 앱 강제 종료 후 세션 복구 · 전화 수신 · Bluetooth · 화면 잠금
- [ ] 사투리 · 작은 목소리 · 느린 말 · 배경 TV
- [ ] 같은 계정 두 기기 동시 세션

---

## 6. 제안하는 순서

1. **A·B 결정** → 제가 SDK 상향 + 번들 ID 반영 (빌드가 되어야 그 다음이 의미 있습니다)
2. 그 사이 제가 **§3.1 오류 상태 노출** 과 **§3.2 세션 소유권** 진행 (결정 불필요)
3. C·D 결정 → 대비 게이트(§3.5) + 태블릿 정리
4. 도메인·법률·AI 계약이 갖춰지면 → 계정 삭제 · Apple 로그인 · 실 Live 연동
5. EAS production 빌드 → TestFlight / Play closed testing → 실기기 QA → 제출

**현재 판단: 공개 배포 불가. 내부 QA / 제한 테스트까지만 가능합니다.**

## 2026-09-12 추가 실행 게이트

- [ ] [개발 실행안](business-plan-development-delta.md) D1~D5: 자동 대화·검증 Clova 출력·지원 정책·일지 승인·실측 이벤트.
- [ ] 실제 구현과 발표 목표의 차이를 기능별로 확인. 시설 3곳 접점을 실증 완료로 기록하지 않음.
- [ ] 유료 도입 전 D6~D8: 초안 품질·사용량/요금·도입 지원. 장기 D9~D11은 초기 출시 완료 조건과 구분.

이전 날짜의 SDK·배포·테스트 체크는 당시 기록이며, 현재 운영 적용 상태는 루트 AGENTS와 보안 런북으로 확인한다.
