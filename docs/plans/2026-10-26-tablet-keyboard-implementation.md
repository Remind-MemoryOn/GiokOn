# 태블릿 가로 고정·키보드 가림 수정 — 2026-10-26

사용자 요청: 태블릿을 가로 방향으로 고정하고, 입력 중 키보드 때문에 입력란과 다음/저장 버튼이 가려지는 문제를 고친다. 휴대폰은 기존 세로 방향을 유지한다. 제품 기준 `46dfe0b`, 작업 브랜치 `codex/tablet-landscape-keyboard`.

✅ 코드·로컬 검증 완료. ⏳ 새 네이티브 APK/IPA 빌드·설치 및 실제 기기 검증. 이번 작업은 EAS 빌드·배포·운영 DB 쓰기·AI 스위치 변경을 수행하지 않았다.

## 구현

- **Android:** Expo config plugin `withTabletOrientation`이 MainActivity에서 `smallestScreenWidthDp >= 600`이면 양쪽 가로 방향(`sensorLandscape`), 그 외에는 세로를 선택한다. 회전·키보드로 줄어든 현재 창 크기로 태블릿을 다시 판정하지 않는다. 전역 manifest 세로 고정은 제거한다. target API36의 큰 화면 정책에는 MainActivity에 한정된 호환 속성을 둔다. **API37로 target 상향 시 이 임시 opt-out을 재검토해야 한다.**
- **iPad:** 최종 Info.plist의 iPad 방향은 landscape left/right, iPhone은 portrait이며 full screen을 요구한다. iPad의 멀티태스킹/분할 창은 이 고정 정책에서 제외된다. PIN·달력·필터·동의 관계 등 RN Modal도 기기의 방향 계약을 따른다.
- **입력 화면 공통:** 앱 루트의 단일 `KeyboardSurface`가 오류 배너와 Navigator를 함께 감싸 safe-area/배너 바깥에서 네이티브 keyboard avoidance를 수행한다(iOS padding / Android height). 배너가 뜨면서 화면 원점이 내려가도 회피량이 누락되지 않는다. Android `softwareKeyboardLayoutMode=resize`를 명시한다. `KeyboardScrollView`는 키보드·레이아웃 변경 후 실제 입력 호스트와 스크롤 viewport를 재측정해 가린 거리만 이동한다. 이미 줄어든 viewport에서 키보드 높이를 중복 차감하지 않는다. 자식 focus 핸들러를 보존하고, 제어 버튼은 첫 탭부터 작동한다. 늦은 측정은 focus/화면 참조가 바뀌면 버린다.
- **로그인:** 절대 좌표의 기준 높이를 최소600으로 유지하면서 스크롤한다. 좁은 창에서 44px 필드 간격이 겹치지 않는다. 393×852의 기존 배치를 유지한다. 유효 로그인·저장·다음·화면 전환/선택창 열기 전에 키보드를 닫는다.
- **어르신 검색:** 키보드를 열면 하단 등록·분석 버튼도 검색 결과와 같은 스크롤 영역으로 옮겨 입력 공간을 확보한다. 키보드를 닫으면 기존 고정 하단바로 돌아온다.
- **등록·수정·대리 동의:** 아래 필드, 지역 후보, 반복 기억, 저장/다음 버튼을 스크롤로 접근한다. 검색 필드는 후보가 나타날 공간도 고려한다. 기존 값·필수 검증·상한·동의 로직은 유지한다.
- **대화:** 중단 발화 입력 패널은 사용 가능한 높이 안에서 스크롤하고 확인·제외 버튼을 유지한다. 짧은 가로 화면의 요양보호사·대화 준비·저장 완료는 기존 치수/요소를 최소852px 캔버스에 두고 가로 화면에서만 스크롤한다. 어르신 가로 화면은 같은 질문·파형·마이크·상태·AI 고지를 세로 흐름으로 배치하고 긴 질문 영역만 스크롤해 하단 상태를 남긴다. 글자 크기를 줄이지 않는다. 컨트롤러/연결/저장/세대 훅은 같은 화면에서 유지한다.

`src/lib/live/*`의 비동기 핵심, 법률 문서, 서버·DB·음성 검열·PIN 잠금 규칙은 수정하지 않았다. 의존성 추가 없음. 세로 Figma 상수·색·카피를 유지했고 게이트를 제품 코드에 맞춰 수정하지 않았다.

## 검증

| 항목 | 결과와 범위 |
|---|---|
| 모바일 전체 회귀 | **476/476**, 42파일; 기준438개 대비38개 추가 |
| 타입·모바일 린트 | 통과 |
| Figma 소스 치수 게이트 | **174/174**, 기존 게이트 수정 없음 |
| Pretendard·BOM·비의료 카피 | 통과 |
| Android/iOS Metro | 실제 Hermes 번들 각각1개 생성, 합성 공개 설정·dotenv 비활성화 |
| 실제 Expo54 Android prebuild | 별도 임시 프로젝트에서 성공. Kotlin·manifest의 태블릿 판정, 가로/세로, adjustResize, 호환 속성 확인 |
| 생성 Kotlin 컴파일·실행 | 실제 생성 onCreate를 Kotlin2.1.20/JDK17에서 Android API 스텁과 컴파일. sw320/599→portrait, sw600/800→sensorLandscape. **APK 전체 컴파일은 아님** |
| iOS 설정 | 모든 Expo mod 뒤 introspection: iPhone portrait / iPad landscape pair / UIRequiresFullScreen=true 확인. Windows에서 iOS 프로젝트 prebuild/IPA 컴파일은 미지원, 실행하지 못함 |
| 새 회귀의 실패 증거 | 구현 전 입력/배치 회귀 실패 확인. 태블릿 분기 제거→phone320 검증 실패. focus reveal 제거→5사례 실패, stale focus guard 제거→늦은 측정 회귀 실패 |
| 실기기 | `adb devices -l` 연결0대. Android 태블릿/iPad 실제 회전·키보드·픽셀·터치 검증은 미실행 |

기하 회귀는 헤더가 있는 viewport, 이미 resize된 Android 창, 화면 위/아래 필드, 짧은 가로 창, 큰 multiline, 지역 후보 여백, 음수 스크롤 방지, 이전 화면 측정 취소를 확인한다. VM UI 회귀는 실제 화면/컴포넌트를 실행하고 native host만 대체한다. 첫 탭·키보드 닫기→이동 순서, PIN 마지막 행, 1280×600/800 가로 배치 및 393×852 세로 경로를 확인했다. 실제 네이티브 키보드 프레임과 OS/OEM 동작을 VM 결과로 합격 처리하지 않는다.

원본 로그와 임시 native 프로젝트/컴파일 fixture는 `.tmp/tablet-keyboard-2026-10-26`에 있다. 실제 현재 `apps/mobile/android`·`ios` 디렉터리는 덮어쓰지 않았다. 새 설정은 다음 native prebuild/EAS 빌드에 반영해야 하며 기존 설치 앱에 바로 적용되지 않는다.

저장소에 남긴 [검증 요약](../testing/evidence/2026-10-26-tablet-keyboard/summary.json)·[개별 테스트 결과](../testing/evidence/2026-10-26-tablet-keyboard/test-results.json)·[실제 생성 native 설정](../testing/evidence/2026-10-26-tablet-keyboard/native-orientation.txt)을 확인할 수 있다. 초기 오류 배너 원점 회귀는 실패를 재현한 뒤 앱 루트 단일 Surface로 고쳐 재검증했고, 별도 검토에서 추가 구체적 결함은 발견되지 않았다.

## 실기기 인수 조건

새 빌드를 확인한 뒤 Android 태블릿/iPad에서 앱 시작부터 로그인·설정·등록·동의·대화·PIN·저장 완료·모달까지 양쪽 가로가 유지되는지 본다. 같은 빌드의 휴대폰은 세로를 유지해야 한다. 키보드를 열어 마지막 필드/후보/버튼까지 한 번의 탭으로 조작하고, 닫았을 때 위치·하단바가 복원되는지 확인한다. Bluetooth/하드웨어·iPad floating/split 키보드, 큰 글씨·짧은 화면·시스템 내비게이션 영역은 실기기에서 별도 확인한다. 기존10분·안전·푸시 인수 테스트도 계속 유효하다.

## AI 초안 호출·공개 설정 테스트 여부

사용자 질문의 **자동·격리 환경 테스트** 기준으로 AI 초안 호출: **예**, 공개 설정: **예**. 기존 worker/entrypoint·생성 공급자 adapter는 합성 HTTP/RPC 응답으로 검증했고, 공개·사람 확정·문장 승인·보호자 열람·철회는 브라우저와 격리 PostgreSQL로 검증했다. 이는 실제 운영 공급자 호출·실제 보호자 계정 종단의 성공 확인을 뜻하지 않는다. 근거는 `docs/testing/2026-10-25-whitebox-report.md`와 `2026-10-24-usecase-report.md`다. 이번 UI 작업 때문에 운영 설정을 바꾸거나 실 AI 호출을 새로 실행하지 않았다.

공식 설정 근거: [Android16 큰 화면 정책](https://developer.android.com/about/versions/16/behavior-changes-16#adaptive-layouts), [Apple 기기별 Info.plist 방향](https://developer.apple.com/library/archive/documentation/General/Reference/InfoPlistKeyReference/Articles/iPhoneOSKeys.html), [RN0.81 KeyboardAvoidingView](https://reactnative.dev/docs/0.81/keyboardavoidingview). 상세 API 동작은 설치된 RN0.81.5/Expo54 소스도 대조했다.
