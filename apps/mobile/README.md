# @giokon/mobile — 세션 진행 앱 (요양보호사 모드 + 어르신 표시 모드)

> ✅ 2026-10-15 Android EAS Gradle 실패 수정: Reanimated의 필수 네이티브 peer `react-native-worklets@0.5.1`을 앱 직접 의존성으로 선언했다(override만으로는 앱 루트의 Gradle resolve가 보장되지 않음). `.gitignore`·`.vercelignore` 보강, 저장소 루트 `.easignore` 추가. EAS 실제 업로드 사본에서 소스·워크스페이스 보존 및 비밀/캐시/네이티브 산출물 파일 제외 확인. ⏳ 새 APK 클라우드 빌드 결과와 실기기 T25.16은 별도 확인.


> ✅ 2026-10-15 EAS 앱 전용 프로젝트 연결: `@memoryon/giokon-mobile` · ID `00151025-03f4-47bd-b481-85577b7dd17e`. Expo 실제 소유자 식별자는 소문자 `memoryon`이며 `eas project:info`로 접근·일치를 확인했다. 기존 다른 용도 프로젝트는 변경하지 않았다. 패키지명 `kr.giokon.app` 유지. ⏳ 새 프로젝트의 preview 환경변수·Firebase 파일·FCM V1·서명·APK 빌드·실기기 검증은 별도다.


> 📌 **2026-09-23 기획 변경 반영.** "무엇을 만들지"의 SoT =
> [`docs/plans/pilot-development-plan.md`](../../docs/plans/pilot-development-plan.md) §6(앱 파트 M1~M7).
> 화면 요구는 [`docs/design.md`](../../docs/design.md)(SCR-08 어르신 표시 모드 · SCR-09 대화 시작 전).

요양보호사가 조작하는 **세션 진행 도구**다. 요양보호사가 로그인 → 어르신 선택 → 설계 확인 → 시작 → 기기를
어르신께 드리면 AI 가 회상 대화(인지활동 프로그램)를 진행한다. 종료되면 분석이 저장되고, 서버가 프로그램 일지
초안을 만든다(확정은 웹에서 사람이 한다). **어르신은 대화만 한다 — 조작하지 않는다.**

## 스택 (현재)

- **Expo SDK 54**(`expo ~54.0.37`) · React Native 0.81 · **expo-router 6**(파일 기반 라우팅) · **NativeWind 4**.
- 상태: 서버 상태 = TanStack Query(`@giokon/data`), 세션 런타임 = Zustand(`src/store/appStore.ts`).
- **음성 = 중계 경로**: 앱 ↔ `apps/voice-relay`(WSS) ↔ Gemini Live → 출력 검증 → Gemini TTS PCM → 앱 재생.
  Gemini 가 만든 오디오 원본은 재생하지 않는다. 연결 코드는 `src/lib/live/`.
- 안전: `@giokon/core` `safety.ts`(결정론 위기 감지 → **즉시 연결 종료**). 종료 분석은 비의료 관찰 지표만.
- 동의 게이팅: 처리 동의가 없으면 세션을 시작할 수 없다(DB 트리거가 최종 판정).
- Supabase 설정이 없으면 **설정 오류 화면**(`src/components/ConfigError.tsx`)을 띄운다 — 예시 데이터로 조용히 도는
  목업 모드는 2026-09-04 에 제거했다.

## 화면 (app/)

- 인증: `index`(스플래시) · `login`
- 어르신: `main`(목록·검색) · `register` · `elder/[id]` · `chronicle/[id]` · `settings/*`
- 세션: `session/start`(대화 시작 전·AI 이용 고지) · `session/talk`(대화) · `session/saved`
- 기록·분석: `log/[id]` · `analysis/[logId]` · `observations` · `analytics` · `topics/[id]`
- 동의: `consent/[id]`

## 파일럿에서 바뀌는 것 (파일럿 계획 §6)

| # | 변경 | 이유 | 상태 |
|---|---|---|---|
| M1 | **직접 모드 제거** — `talk.tsx` 의 `RELAY_MODE` 분기와 직접 Gemini Live UI 삭제, `EXPO_PUBLIC_VOICE_RELAY_URL` 이 없으면 세션 시작 차단 | 검열되지 않은 AI 음성 경로를 없앤다. `packages/core` 정리(C1)와 **같은 PR** | ✅ 2026-09-24 |
| M2 | **어르신 표시 모드** — `talk.tsx` 안의 모드 전환 + 화면 `src/features/session/ElderView.tsx`(질문 자막·"말하는 중" 표시만). "자동 대화 시작"과 동시에 전환 | 어르신이 든 화면에 요양보호사 UI 가 섞여 있었다 | ✅ 2026-09-24 |
| M3 | 어르신 화면에서 위기 배너 전화번호·STT 수정 패널·중계 컨트롤·확인 없는 X 제거 | 위기 안내는 **없애지 않고** 요양보호사 모드·감독 화면으로 옮긴다 | ✅ 2026-09-24 |
| M4 | 복귀 게이트 = **PIN**(`expo-secure-store`, 요양보호사별) — 어르신 화면 '선생님' 버튼 → PIN. 설정 화면에서 변경 | 어르신이 실수로 나가지 못하게 | ✅ 2026-09-24 |
| M5 | 원격 제어 수신 — 감독 화면의 일시정지 → "잠시 쉬어요" + 마이크 정지 | 1인 병렬 감독 | ✅ 2026-09-24 — 원격 재개는 2초 폴로 자동 반영, 현장에서는 풀 수 없음 |
| M6 | 푸시 토큰 등록(`expo-notifications` → Expo Push) | 위기 발화 알림. ⚠️ `app.json` 플러그인 추가 → **EAS 재빌드 필요** | ✅ 2026-09-24 — 돌봄팀 로그인 시 등록(`src/lib/push.ts`), 로그아웃 전 회수. ✅ 2026-10-11 T27.1 개발 빌드·FCM 파일 연결 준비 · ⏳ 자격 증명·재빌드·실기기 |
| M7 | 폴백 저장 순서를 `finalizeSession` 과 맞춤 | 일지 초안 자동 생성의 첫 시도 성공률 | ✅ 2026-09-24 |
| — | 세션 1회 최대 10분 · 요양보호사 1명당 동시 최대 4대(서버가 막고 앱은 이유를 보여 준다) | 2026-09-24 확정 | 🔶 동시 4대: ✅ DB·앱 안내(2026-09-24, 로컬) · 10분: ✅ 목표 시간 상한(DB) · ⏳ 중계 연결 수명(C3·T21.12) |

고령 사용자 기준(큰 글씨·고대비·큰 터치 영역·핵심 흐름 3단계·선택형 우선·첫 사용 튜토리얼)은 M2 에서 함께 적용한다
(✅ 어르신 화면은 조작 요소 0·질문 28·상태 23 — ⏳ 첫 사용 튜토리얼은 후속, 사용자 결정 2026-09-24).
검증 기준은 "기술에 익숙하지 않은 50~60대가 설명 없이 세션 1회를 끝까지 진행하는가"다.

## 비의료 락다운

사용자 노출 카피에 치료·진단·효과·향상 표현 금지(CI `pnpm check:copy`). 분석은 관찰 지표(참여도·응답률·발화량·
주제 반응)로만 표현한다.

## 개발

```cmd
pnpm -F @giokon/mobile start
pnpm -F @giokon/mobile typecheck
pnpm -F @giokon/mobile lint
pnpm -F @giokon/mobile test
```

환경변수(전부 **공개 값** — `EXPO_PUBLIC_*` 는 앱 번들에 들어가므로 비밀을 넣지 않는다):
`EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` · **`EXPO_PUBLIC_VOICE_RELAY_URL`**(`wss://호스트/voice`,
파일럿에서 필수) · `EXPO_PUBLIC_WEB_URL`(선택 — 개인정보처리방침·약관을 여는 웹 주소) · `EXPO_PUBLIC_NAVER_CLIENT_ID`.
✅ `.env.example` 에 `EXPO_PUBLIC_VOICE_RELAY_URL`(필수 3/3) 추가됨(2026-09-24) — 없거나 형식이 틀리면 시작 화면에서 막힌다.

`ios.supportsTablet: true`(2026-09-24 — 기관에서 태블릿을 쓴다) · `orientation: portrait`(세로 고정). 태블릿 화면은 파일럿 전 실기기로 확인한다.


## 개발 빌드·푸시 준비 (T27.1 · 2026-10-11)

✅ 코드 준비: Expo Go에서는 알림 모듈 실행 전에 `unavailable` 반환. 기본 `start`는 개발 빌드에 연결하고,
`start:go`는 화면 확인 전용이다(음성 스트리밍·원격 푸시 검증 불가).
`expo-dev-client` 추가 후 최초 네이티브 빌드가 필요하며, 네이티브 의존성·앱 설정 변경 때도 재빌드한다.

| 프로필 | 용도 | EAS 환경 |
|---|---|---|
| development | 개발 서버에 연결하는 실기기 개발 빌드 | development |
| preview | 개발 서버 없이 실행하는 실기기 내부 배포 | preview |
| preview-simulator | iOS 시뮬레이터 전용 | preview |
| production | Android AAB / iOS 스토어·TestFlight용 | production |

### Android 설정 — 최초 빌드 전에

1. Firebase에 Android 앱 `kr.giokon.app`을 등록한다. 앱 설정 `google-services.json`은
   `apps/mobile/credentials/google-services.json`에 둔다(추적 제외). 서비스 계정 비밀키와는 다른 파일이다.
2. EAS의 사용할 각 환경(development·preview·production)에 **파일형** `GOOGLE_SERVICES_JSON`을 등록한다.
   `app.config.ts`가 EAS가 제공하는 경로를 `android.googleServicesFile`로 연결한다.
   Android EAS 빌드는 이 변수가 없으면 중단한다. 로컬 빌드에서는 아래처럼 경로를 설정한다.
   이 변수는 빌드 설정용이라 `EXPO_PUBLIC_` 접두사를 붙이지 않는다.
3. Firebase FCM V1 **서비스 계정 키**는 `eas credentials`의 Android → Google Service Account →
   Push Notifications (FCM V1)에 등록한다. 이 키를 앱 설정·앱 번들·Git에 넣지 않는다.
   앱 설정은 토큰 등록용, 서비스 계정 키는 발송용이다. 토큰 발급 성공만으로 수신 성공을 판단하지 않는다.
4. EAS 각 환경에 기존 앱 공개 설정(`EXPO_PUBLIC_SUPABASE_URL`, 공개 키, 중계 주소 등)도 설정한다.
   파일형 변수는 EAS가 제공하는 경로를 사용하고, 로컬 절대 경로를 EAS 문자열 변수로 복사하지 않는다.

저장소 루트에서 Windows cmd로 실행한다:

```cmd
cd apps\mobile
set "GOOGLE_SERVICES_JSON=%CD%\credentials\google-services.json"
npx expo run:android
pnpm start
```

로컬 빌드는 Android SDK/JDK가 필요하다. 대신 EAS 환경 설정 후 아래로 클라우드 빌드한다(계정의 빌드 한도·요금 확인).

```cmd
cd apps\mobile
npx eas-cli build -p android --profile development
pnpm start
```

개발 빌드를 기기에 설치한 다음 `pnpm start`에 연결한다. 에뮬레이터는 Google Play services가 필요하다.
파일럿 배포는 `npx eas-cli build -p android --profile preview`, 스토어 내부 테스트는
`npx eas-cli build -p android --profile production`으로 만든다. 네이티브 설정은 JS 업데이트만으로 반영되지 않는다.

### iOS·출시 검증

⏳ Apple 개발자 계정·APNs 자격 증명·서명 준비 후 실기기용으로 빌드한다. 내부 배포는 기기 등록이 필요하다.
TestFlight는 `production` 프로필로 빌드·제출한다. `preview-simulator` 산출물은 실기기에 설치할 수 없다.

⏳ T25.16: 실제 파일럿 태블릿에서 음성 입력·재생·즉시 정지, 푸시 토큰 등록·실제 수신을 검증한다.
앱 전경·백그라운드·미실행, 알림 권한 거부, 로그아웃·계정 교체, 잠금화면 민감정보 미노출을 확인한다.
알림 탭 후 감독 화면 연결은 T21.10 후속 코드가 준비되어 있다. 웹 로그인 후 원래 경로 복귀는 별도 코드 과제로 남는다.
코드 준비만으로 종단 완료 처리하지 않는다.
개발 빌드 확인 후 **배포용 빌드에서도** 같은 시나리오를 통과해야 한다.

⏳ T27.2: `expo-av` → `expo-audio` 전환은 별도 과제. SDK 55 이상으로 올리기 전에 완료한다.
마이크 권한·턴 단위 재생·재생 완료 영수증·중단·위기 즉시 정지를 검증한다.
PCM 수집 모듈 `react-native-live-audio-stream`은 별개이며 이번 변경에서는 음성 경로를 바꾸지 않았다.

참고: [FCM 설정](https://docs.expo.dev/push-notifications/fcm-credentials/),
[개발 빌드](https://docs.expo.dev/develop/development-builds/introduction/).


### Android 시작 오류 구분 (2026-10-12)

`pnpm start -c`는 JS 개발 서버를 시작하고 캐시를 비운다. 개발 앱을 빌드하거나 설치하지 않는다.
`No development build (kr.giokon.app)`은 선택한 기기에 개발 APK가 없다는 뜻이다.
최초 설치·네이티브 의존성 변경 후에는 Android Studio에서 에뮬레이터를 켜고 아래를 실행한다.

```cmd
cd apps\mobile
set "JAVA_HOME=C:\Program Files\Java\jdk-17"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
pnpm exec expo prebuild --platform android --no-install
pnpm android
```

JDK 경로는 자신의 JDK 17 설치 위치에 맞춘다. 이 PC의 기본 Java는 26, Android Studio 내장 Java는 25여서
SDK 54의 Gradle 8.14.3용으로 설치된 JDK 17을 명시했다. 위 환경변수는 현재 터미널에만 적용된다.
`pnpm android`는 개발 APK 빌드·설치·실행을 수행한다. 다음부터는 `pnpm start -c` 후 `a`로 Android를 연다.
Firebase 파일을 준비했다면 앞 절의 `GOOGLE_SERVICES_JSON` 경로도 설정하고 네이티브 설정을 재생성한다.
파일 없이 로컬 개발 앱을 만들 수 있지만 원격 푸시 검증은 완료할 수 없다.

모바일은 `platforms: ["android", "ios"]`로 명시했다. `w`는 사용하지 않는다.
브라우저 관리 웹은 별도 `apps/web`이며 저장소 루트의 `pnpm web`으로 실행한다.
모바일 웹 의존성을 추가해 음성 앱을 브라우저용으로 전환하지 않는다.


Windows 네이티브 빌드의 긴 경로 문제를 피하려고 저장소 `pnpm-workspace.yaml`에서
`virtualStoreDir: .pnpm`, `virtualStoreDirMaxLength: 32`를 사용한다(의존성 버전은 그대로).
이 설정을 처음 받은 뒤에는 저장소 루트에서 `pnpm install --frozen-lockfile`을 실행하고 기존 Metro를 재시작한다.
Windows에서는 `plugins/withWindowsCmake.js`가 네이티브 모듈의 CMake 중간 산출물도
Android 프로젝트 아래 짧은 공통 경로에 둔다. 기존 네이티브 폴더에는 `prebuild`로 설정을 반영한다.
이미 Android 빌드를 시도했다면 옛 의존성 경로가 남은 자동 연결 캐시만 제거한 뒤 재빌드한다:

```cmd
cd apps\mobile
if exist android\build\generated\autolinking\autolinking.json del android\build\generated\autolinking\autolinking.json
pnpm exec expo prebuild --platform android --no-install
pnpm android
```

`.pnpm/`은 설치 산출물이므로 커밋하지 않는다. `build.ninja still dirty after 100 tries`가 발생하면
경로 길이와 자동 연결 캐시에 옛 경로가 남았는지 먼저 확인한다.

✅ 2026-10-12: JDK 17로 Android 개발 APK 빌드 성공, 로컬 에뮬레이터에 `kr.giokon.app` 설치 확인.
Android/iOS Metro export도 통과했다. ⏳ 실제 태블릿의 음성·푸시·안전 체인 검증(T25.16)은 별도다.

### 출시 전 앱 계약 재검토 (T28.2 · 2026-10-14)

✅ 사진 바이트 보존, 안전 알림 확인의 동기화 경합, 휴식·거부 시 고정 인사 뒤 종료, 일반 애도 시 지지 대화,
즉석 세션 생성 응답 유실 복구, 주제별 응답률 집계를 수정했다. 위기·급성 고통의 즉시 정지는 유지한다.
세션 생성 UUID에 사용하는 `expo-crypto`는 이미 간접 설치된 SDK 54 버전을 직접 의존성으로 선언했다.
앱 테스트 406개·타입·린트·Figma·폰트·BOM 검사 통과. ⏳ 새 배포용 빌드와 실제 기기 검증은 별도다.
