# 기억온 앱(apps/mobile) 배포 계획

- 작성일: 2026-09-04
- 대상: **모바일 앱 스토어 배포**. 웹은 *앱이 의존하는 지점*(비밀번호 재설정·법적 고지·계정 삭제 URL)만 포함한다.
- 근거: 사용자 제출 감사 보고서(2026-09-03) 전 항목 + 저장소 코드 재검증 + 신규 발견.
- 검증 한계: 컨테이너 egress 가 `*.supabase.co`·`figma.com`·DNS 조회를 막는다. **실 API 응답·DNS·스토어 콘솔·서명 빌드는 이 문서에서 확정할 수 없다** → §6 외부 확인.

---

## 1. 감사 보고서 검증 결과

보고서 주장을 코드로 대조했다. 셋으로 나뉜다.

### 1.1 확인됨 (코드 근거 있음)

| # | 항목 | 코드 근거 |
|---|---|---|
| 1.2 | 검열 안 된 Live 원본 음성이 재생됨 | `app/session/talk.tsx:243-252` · `src/store/appStore.ts:447` |
| 1.3 | live-token 발급 권한이 로그인 여부만 검사 | `supabase/functions/live-token/index.ts:26` (CORS `*`), 역할·배정·쿼터 검사 0건 |
| 1.4 | 앱에 역할·온보딩 가드 없음 | `app/index.tsx:26` — `isConfigured && authed` 뿐 |
| 1.6 | 비밀번호 재설정 URL 불일치 | `app/login.tsx:62` `https://giokon.app/reset` ↔ 웹 라우트 `/reset-password` (`apps/web/src/App.tsx:96`) |
| 1.11 | `expo-linear-gradient` 버전 어긋남 | `package.json` `^57.0.1` (SDK 53 기대 `~14.1.5`) — **`app/index.tsx:12`에서 실사용** |
| 1.12 | Apple 로그인 없음 | 구글·카카오·네이버만 구현 |
| 1.13 | 앱에 계정 삭제 흐름 없음 | 앱 전체 grep 0건 |
| 1.16 | 주황 대비 부족 | 직접 계산: `#e9822b`/흰 = **2.73:1** (AA 4.5:1 미달, 큰 글씨 3:1도 미달) |
| 2.1 | 좀비 세션 · 동시 채택 | `appStore.ts:491` `cancelSession: () => set({active:null})` (원격 미종료) · `session-persistence.ts:293-300` 갱신 행 수 미검사 |
| 2.4 | 오류가 빈 상태로 붕괴 | `src/data/reads.ts` 에 `error`/`isError` 참조 **0건** |
| 2.5 | Storage 제한 없음 | 버킷 생성문에 `file_size_limit`·`allowed_mime_types` 없음 · 사진은 `quality 0.8` + base64, 해상도 상한 없음 |
| 2.6 | 구성 드리프트 | `supabase/config.toml` 없음 · 마이그레이션 **36** ↔ 런북 19/21 · `database.types.ts` 수기 작성 주석 |

### 1.2 반증 또는 과장 (그대로 따르면 안 됨)

| 보고서 주장 | 실제 |
|---|---|
| Live 요청의 `snake_case` 필드가 규격 위반 | **과장.** protobuf JSON 매핑은 snake_case·camelCase 양쪽을 받는다. 응답은 camelCase 로 오고 코드도 그렇게 읽는다(`client.ts:100` `sessionResumptionUpdate`). 진짜 위험은 **엔드포인트 경로와 토큰 전달 방식**뿐이다 |
| Realtime 에 `journal_photos` 누락 | **틀림.** 이미 publication 에 있다. 실제 누락은 `care_journals`·`profile_guardians`·`profile_caregivers`·`consents`·`elder_codes`·`inquiries` |
| `check:a11y` 가 잘못 통과 | 앱과 무관. `apps/web/scripts/a11y-audit.mjs` = **웹 전용**. 문제는 오히려 **앱에는 대비 검사 자체가 없다**는 것 |

### 1.3 신규 발견 (보고서에 없음)

| # | 항목 | 심각도 |
|---|---|---|
| N1 | **`NSPhotoLibraryUsageDescription` 누락.** `ProfileForm.tsx:116` 이 `requestMediaLibraryPermissionsAsync()` 를 호출하는데 `app.json` `infoPlist` 에 마이크 설명만 있다 → **iOS 즉시 크래시 + 심사 거부** | P0 |
| N2 | **`package.json` `description` 인코딩 깨짐** (`?대Ⅴ?????Expo ??`). PowerShell 재작성 흔적(`":  "` 4-space 포맷). BOM 이 없어 `check:bom` 이 못 잡는다 | P1 |
| N3 | `react-native-live-audio-stream@1.1.1` 은 **config plugin 없는 bare 모듈** → Expo Go 실행 불가, `newArchEnabled: true` 와 호환성 미검증(구 브리지) | P0 |
| N4 | `ios.config.usesNonExemptEncryption` 미설정 → 제출마다 수출규정 문답 반복 | P2 |
| N5 | `eas.json` 에 `env` 블록 없음 · `submit.production` 비어 있음 | P1 |
| N6 | `orientation: portrait` 인데 `supportsTablet: true` — 태블릿 심사 시 불일치 | P2 |
| **N7** | **어르신이 하지 않은 말이 실제 기록으로 저장됐다.** Live 미가용 시 마이크를 누르면 `pickElderUtterance()`(`src/lib/mockStt.ts`)가 미리 써 둔 발화("전주 남부시장 근처에서 오래 살았지")를 입력칸에 채웠고, 그대로 저장하면 `session_logs` 에 남았다 | **P0** |

---

## 2. P0 — 이것이 끝나기 전에는 스토어에 올리지 않는다

### P0-1. 검열되지 않은 AI 원본 음성 차단 (안전)

가장 위험하다. 지금은 **화면과 스피커가 다른 말을 할 수 있다.**

```
talk.tsx  confirm(finalText, livePayload)      → 스토어가 screenAiUtterance 로 원문을 막고
                                                  safeAlternative 로 교체 (화면은 안전)
          liveAudioChunks.get(livePayload.question) → 그러나 오디오는 **원문 키**로 꺼낸다
          engine.playTurn(chunks)                   → 막힌 발화가 그대로 재생 (스피커는 위험)
```

오프너는 더 나쁘다 — `overrideQuestion()` 은 검열을 아예 하지 않는다(`appStore.ts:447`).
"다시 듣기"는 우연히 안전하다(화면 텍스트 키로 조회 → 미스 → 기기 TTS 폴백).

**할 일**
- [x] 오디오를 **채택된 질문 텍스트**를 키로만 재생한다(`src/lib/live/playback.ts`). 막히면 캐시에서 버리고 안전 대체문을 기기 TTS 로 읽는다. — `829a242`
- [x] `overrideQuestion` 에 `screenAiUtterance` 적용(오프너도 검열). — `829a242`
- [x] 회귀 테스트 4건. — `829a242`
- [x] **N7**: 조작된 어르신 발화 생성기 삭제. 폴백 입력은 빈 칸으로 열리고, 빈 발화는 저장을 막는다. — `72ce705`

### P0-2. 스토어 빌드가 실제로 통과하게 만들기

- [x] `expo-linear-gradient` `^57.0.1` → `~14.1.5` (설치 확인). — `829a242`
- [x] `NSPhotoLibraryUsageDescription` 추가 (N1). — `829a242`
- [ ] `react-native-live-audio-stream` 의 New Architecture 호환 확인. 불가하면 `expo-audio` 계열로 교체하거나 `newArchEnabled: false` 로 내린다 (N3).
- [ ] `expo-av` → `expo-audio`/`expo-video` 전환 계획 (SDK 54+ 에서 제거됨). 현재 `live/player.ts`·`live/mic.ts`·`live/pcm.ts` 3곳.
- [ ] Expo SDK 상향 판단: Google Play 는 2026-08-31부터 **API 36**, Apple 은 2026-04-28부터 **iOS 26 SDK** 요구. SDK 53 기본값으로는 신규 등록이 막힌다 → **SDK 54+ 필요**.
- [ ] `kr.gieokon.app` ↔ 브랜드 `giokon` 불일치. **첫 출시 후에는 변경 불가** → 지금 확정.
- [x] `package.json` `description` 복구 + `check:bom` 에 mojibake 검사 추가 (N2). — `829a242`

### P0-3. 인증·접근 통제

- [x] **역할·온보딩 가드** — `src/auth/appAccess.ts`(순수 판정 + 테스트 8건), 스플래쉬·로그인 양쪽에서 집행. 미달이면 사유를 알리고 로그아웃. — `72ce705`
- [ ] `live-token` 에 역할·기관·배정·발급 쿼터 검사 추가. CORS `*` 제거. 지금은 **보호자 계정도 AI 비용을 발생시킬 수 있다.**
- [x] 비밀번호 재설정 URL → `/reset-password`, 도메인은 `EXPO_PUBLIC_WEB_URL`(`src/lib/webUrl.ts`). — `829a242`

### P0-4. 스토어 정책 필수 기능

- [ ] **앱 내 계정 삭제 시작 경로** (Apple 필수, Google Play 필수) + 로그인 없이 열리는 외부 삭제 안내 페이지.
- [ ] **Sign in with Apple** 추가 (Guideline 4.8). 제3자 소셜을 쓰면서 Apple 로그인이 없으면 거부 사유다. 대안: iOS 빌드에서 소셜 제거.
- [ ] 실제 도메인 발급 + `/privacy`·`/terms`·`/support`·`/account-deletion` 접근 확인.
- [ ] 법률 문서의 미기재 항목(법인·대표자·개인정보 보호책임자·수탁사·국외이전) 확정.

### P0-5. Gemini Live 실연동 검증

- [ ] 실 키로 **엔드포인트 경로**와 ephemeral token 전달 방식을 확인한다. (필드 대소문자는 문제가 아니다 — §1.2)
- [ ] `gemini-3.1-flash-live-preview` 가 preview 라는 점: **production 제공 모델로 교체하거나 중단 대비 폴백을 정한다.**
- [ ] **Paid tier 강제.** 무료 tier 는 약관상 입력 콘텐츠가 제품 개선·사람 검토에 쓰일 수 있다 → 어르신 음성·가족사에는 사용 금지.
- [ ] DPA 체결 · 로그 보관기간 · 처리 국가 확인 → 국외 이전 동의 문구에 반영.

---

## 3. P1 — 공개 베타 전

- [x] **목업 모드 제거** — `CFG` 분기 35곳·`MOCK_*`·`DemoModeNotice` 삭제. 키가 없으면 `ConfigError` 화면에서 부팅을 멈춘다. — `72ce705`
- [ ] **오류 ≠ 빈 상태.** `reads.ts` 가 error 를 전혀 노출하지 않는다 → RLS 거부·네트워크 실패가 "기록 없음"으로 보인다. 어르신 기록 시스템에서 이건 사실 왜곡이다.
- [ ] **세션 소유권·복구.** `cancelSession` 이 원격 세션을 ended 로 닫게 하고, `adoptPlannedSession` 은 갱신 행 수를 검사해 0이면 새 세션을 만든다. 앱 강제 종료 후 active 세션 복구 경로.
- [ ] **Storage 제한.** 버킷에 `file_size_limit`·`allowed_mime_types` 설정, 업로드 전 리사이즈, EXIF 제거.
- [ ] **Realtime 보강** — `consents`·`profile_caregivers`·`profile_guardians` 추가(앱이 배정·동의 변경을 즉시 반영해야 한다).
- [ ] **대비 개선.** `#e9822b` 를 본문 텍스트로 쓰는 곳을 진한 톤으로 교체. ⚠️ 브랜드 색 변경은 **디자인 결정** — 임의 재디자인 금지 원칙에 따라 사용자 확인 후 진행.
- [ ] 앱용 대비 검사 게이트 신설(`check:contrast`).
- [ ] 다단계 쓰기 원자성(어르신 생성→사진→연대기) — RPC 이관 또는 보상 트랜잭션.
- [ ] 크래시·오류 수집(Sentry/Crashlytics) — 지금은 장애를 사용자 신고로만 안다.
- [ ] AI 비용 알림·기관별 상한.

---

## 4. P2 — 정식 운영 안정화

- [ ] 화면 적응성: 320px·iPhone SE·시스템 글자 200%·가로 모드·태블릿(또는 `supportsTablet:false`).
- [ ] 음성 UX: 1.6초 침묵 종료 판정 재조정, 사투리·작은 목소리, Bluetooth 보청기, 전화 수신·오디오 포커스, echo.
- [ ] 푸시 알림(APNs/FCM) — 안전 이벤트를 앱이 닫혀 있어도 전달.
- [ ] 위기 키워드 오탐/미탐 검증 + 야간·휴일 담당자 SLA.
- [ ] `supabase/config.toml` 신설 · 런북 마이그레이션 수 36 으로 정정 · `database.types.ts` 자동 생성 전환 + 드리프트 CI.
- [ ] 의존성 취약점 분류(런타임/빌드타임/도달불가) 후 차단형 CI.
- [ ] `usesNonExemptEncryption`·`eas.json env`·`submit.production` 정리.

---

## 5. 실행 순서

| Phase | 내용 | 선행 |
|---|---|---|
| ~~R1~~ | ✅ P0-1 안전(음성)·N7 · 목업 제거 · 진입 자격 가드 · 재설정 URL · 빌드 차단 3건 | 완료 (`829a242`·`72ce705`) |
| **R1′** | 남은 P1 코드 작업 — 오류 상태 노출 · 세션 소유권/복구 · Storage 제한 | — |
| **R2** | P0-2 빌드(SDK·의존성·권한·번들 ID) | 사용자: SDK 상향 승인 |
| **R3** | P0-3 인증 가드 · live-token 강화 | — |
| **R4** | P0-4 도메인·계정삭제·Apple 로그인·법률 | 사용자: 도메인·법률 검토 |
| **R5** | P0-5 Live 실연동 · 실기기 QA · 스토어 제출 | R1~R4 |

---

## 6. 저장소 밖에서 확인해야 하는 것

여기 있는 것은 **코드로 끝낼 수 없다.** 사용자 작업이다.

**도메인·메일** — DNS·HTTPS, 4개 법적 URL 접근, Supabase redirect allowlist, SMTP, SPF/DKIM/DMARC
**Supabase** — 36 마이그레이션 재대조, RLS 전수, Storage 제한, Edge Function JWT 설정, PITR/백업 복원 훈련, 비용 알림
**OAuth** — 구글(웹·Android·iOS)·카카오(key hash·URL scheme)·네이버 실로그인, Apple 로그인 또는 4.8 예외
**AI** — Live 실연동, Paid tier, DPA, 모델 중단 대비, 장시간 세션 부하
**스토어** — EAS production 빌드(iOS/Android), TestFlight·Play closed testing 실설치, 서명 백업, Data Safety·Health declaration, 리뷰어 계정, Privacy Manifest
**법률** — 법인 정보, 보호책임자, 수탁·국외이전 표, 대리동의 적법성, 의료기기 해당성, AI 기본법 적용성

---

## 7. 현재 판단

**공개 배포 불가. 내부 QA / 제한 테스트까지만 가능.**

2026-09-04 에 **코드만으로 끝낼 수 있는 P0 는 전부 처리했다** — AI 음성 안전 경로, 조작된 어르신 발화(N7), 목업 모드, 진입 자격 가드, 빌드 차단 3건, 재설정 URL.

남은 P0 는 성격이 다르다. **코드가 아니라 결정과 외부 계약**이다.

1. **Expo SDK 상향** — Google Play API 36 / Apple iOS 26 SDK 요구. SDK 53 으로는 신규 등록이 막힌다. `expo-av`→`expo-audio` 전환과 `react-native-live-audio-stream` 의 New Architecture 호환 확인이 뒤따른다.
2. **번들 ID 확정** — `kr.gieokon.app` ↔ 브랜드 `giokon`. 첫 출시 후에는 못 바꾼다.
3. **도메인·법률 문서·계정 삭제·Apple 로그인** — 전부 스토어 심사 차단 사유.
4. **Gemini 실연동 + Paid tier + DPA** — 무료 tier 는 약관상 어르신 음성에 쓸 수 없다.

이 넷은 사용자 결정이 있어야 움직인다.
