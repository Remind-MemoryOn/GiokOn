# Google Play 제출 준비 — 심사 기준 점검표 (2026-11-27)

> 사용자 지시(2026-11-27): 계정 삭제 요청 경로 · AI 응답 앱 내 신고 · 앱 번들 취약 의존성 · 릴리스 권한 · 가입/로그인 흐름을
> 하나씩 정리하고, **Play 심사 통과 기준**으로 더 보완할 것을 점검한다. 테스크 상태는 `docs/tasks.md` PLAY-20261127.
> 정책 근거(2026-11-27 확인): 계정 삭제 [13327111](https://support.google.com/googleplay/android-developer/answer/13327111) ·
> AI 생성 콘텐츠 [13985936](https://support.google.com/googleplay/android-developer/answer/13985936) ·
> 심사용 로그인 정보 [15748846](https://support.google.com/googleplay/android-developer/answer/15748846).
>
> ⚠️ 이 문서의 "코드 ✅" 는 저장소에 있다는 뜻이다. 웹 배포·앱 빌드·Play Console 입력·실기기 확인은 각각 별개다.

## 1. 코드로 끝낸 것

| 정책 | 무엇을 했나 | 남은 것 |
|---|---|---|
| 계정 삭제(앱 경로) | 설정 → 계정 → **계정 삭제 요청**(앱 안에서 바로 접수) · 막힌 계정 알림의 '계정 삭제 안내' | 새 빌드 |
| 계정 삭제(웹 경로) | 공개 `https://www.memoryon.life/account-deletion` — 앱·웹·이메일 3가지 방법, 삭제/보존 기준, 10일 이내 처리 | **main 병합 = 웹 배포** 후 비로그인으로 열리는지 확인 |
| 삭제 처리 절차 | `docs/runbooks/account-deletion-and-ai-reports.md` | 실제 요청→삭제 1회 시험 · 법무(기한·본인 확인) |
| AI 생성 콘텐츠 신고 | 대화 화면(질문 카드 아래)·대화 기록(AI 말풍선) → 사유 + 메모 → 운영자 비공개 문의 | 신고 확인 주기 운영 |
| 앱 번들 취약 의존성 | 번들 소스맵 × audit 대조 → `decode-uri-component` 교체 · `check:audit` 앱 경로 승격 | — |
| 릴리스 권한 | 요청 권한 = 마이크 하나 · 카메라·저장소·미디어·오버레이 권한 제거 · 자동 백업 끔 | AAB 최종 권한 확인(Play Console 앱 번들 탐색기) |
| 가입·로그인 | 아이디 찾기·회원가입 → 웹 화면 · 로그인 오류 한국어 · 막힌 계정 → 웹으로 이어 감 | — |
| 대상 API·16KB | target/compile SDK 36 · 미리 빌드된 `.so` 없음(NDK 소스 빌드, RN 0.81 기본 16KB 대응) | — |
| OAuth | 소셜 로그인은 시스템 브라우저(`openAuthSessionAsync`) — 내장 WebView 아님 | — |
| AI·비의료 고지 | 대화 화면 AI 고지 상시 · 동의 화면 비의료 면책(`banners.tsx`) | — |

## 2. Play Console 입력 초안 (사용자 입력)

### 2.1 앱 액세스(App access) — 영어 필수 · 항상 유효 · 2단계 인증 없음

심사자는 **기관에 합류(온보딩 완료)한 요양보호사 계정**이 있어야 앱에 들어올 수 있다(보호자·가입 미완료 계정은 앱 진입이 막힌다).
운영 DB 에 심사 전용 기관·계정·예시 어르신(가상 인물)·필수 동의 4종을 만든다 — **운영 DB 쓰기라 사용자 승인 후 진행**.
실존 인물 정보를 쓰지 않는다. 비밀번호는 만료되지 않게 둔다.

```
This app is a tool for caregivers at senior-care facilities. Accounts are created by a facility
administrator; there is no public sign-up inside the app.

Test account (email + password, no 2FA):
  Email: <reviewer account email>
  Password: <password>

1. Open the app and sign in with the email and password above (ignore the social login buttons).
2. The home screen lists a sample (fictional) senior profile. Tap it, then "대화 시작하기" (Start conversation)
   at the bottom, then "시작하기" (Start).
3. Tap "자동 대화 시작" (Start automatic conversation). Allow microphone access.
   The first time, the app asks you to set a 4-digit caregiver PIN (any digits, e.g. 1234) — this PIN is
   stored only on the device. The AI then speaks Korean.
4. The screen switches to the senior view. To return to the caregiver view, tap "선생님" (Teacher)
   in the corner and enter the PIN you set in step 3.
5. Report an AI response: caregiver view, "AI 응답 신고" under the question card, or in a saved
   conversation log tap "신고" next to an AI message.
6. Account deletion: Settings (gear icon, top right) > 계정 > 계정 삭제 요청.
   Web: https://www.memoryon.life/account-deletion
```

> PIN 은 기기 보안 저장소(SecureStore)에만 있어 미리 정해 둘 수 없다 — 처음 어르신 화면으로 넘길 때 앱이 정하게 한다(`talk.tsx`).
> 심사 계정의 대화는 운영 비용·사용량 한도(`live_token_limits`)에 포함된다.
> **계정 생성 방식(2026-11-27 사용자 승인 — 운영 DB 쓰기)**: 사용자가 받은 메일을 확인할 수 있는 이메일을 정하면, 무작위(아무도 모르는)
> 비밀번호로 계정·기관·가상 어르신·필수 동의를 만들고, 사용자가 웹 '비밀번호 찾기'로 비밀번호를 정한다 — 비밀번호가 대화·저장소에 남지 않는다.
> ⏳ 이메일 주소 대기.

### 2.2 데이터 보안(Data safety) — 초안, 법무 확인 대기

| 데이터 유형 | 수집 | 목적 | 비고 |
|---|---|---|---|
| 개인 정보: 이름·이메일·사용자 ID | 예(필수) | 계정 관리·앱 기능 | 요양보호사·보호자 계정 |
| 사진 | 예(선택) | 앱 기능 | 어르신 프로필 사진(기관 등록) |
| 오디오: 음성 | 예(필수, **일시 처리**) | 앱 기능 | 대화 음성은 저장하지 않고 중계·Gemini 에서 처리 후 폐기 — "processed ephemerally" |
| 메시지/기타 사용자 콘텐츠 | 예 | 앱 기능 | 대화 전사·연대기·프로그램 일지 |
| 건강 정보 | 법무 판단 | 앱 기능 | 정서·참여 관찰 기록을 '건강 정보'로 신고할지 — 보수적으로는 '예' |
| 앱 활동 | 예 | 분석 | 제품 이벤트(`product_events`, 발화 원문 없음) |
| 기기 ID | 예 | 앱 기능 | 푸시 토큰(안전 알림) |

- 전송 중 암호화: 예(HTTPS/WSS) · 데이터 삭제 요청 가능: 예 → URL `https://www.memoryon.life/account-deletion`
- 제3자 '공유' 아님(서비스 제공자 처리): Supabase(서울) · Google Gemini(국외 이전 동의) · Expo Push · Vercel.
- 근거 문서: `docs/compliance.md`(처리 항목 표) · 개인정보 처리방침 — 처리방침과 다른 값을 적지 않는다.

### 2.3 그 밖의 앱 콘텐츠

- **건강 앱 선언**: 비의료 포지셔닝(`docs/compliance.md` §3·§4). 의료기기 아님. 스토어 설명에
  "not a medical device; does not diagnose, treat, cure, or prevent any disease" 면책을 넣는다.
- **AI 생성 콘텐츠**: 앱 안 신고 기능 위치(2.1 의 5번)와 출력 검열(서버 `screenAiUtterance`)을 설명.
- **대상 연령**: 18세 이상(요양시설 직원). 아동 대상 아님.
- **콘텐츠 등급** 설문 · **광고 없음** · **개인정보 처리방침 URL** `https://www.memoryon.life/privacy`.

## 3. 사용자만 할 수 있는 것 (순서대로)

1. **PR 병합 → 웹 배포** — `/account-deletion` 이 비로그인으로 열리는지 확인(Play 가 URL 을 확인한다).
2. **EAS `production` 환경 변수** — preview 와 별개다. `GOOGLE_SERVICES_JSON`·`EXPO_PUBLIC_SUPABASE_URL`·
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`EXPO_PUBLIC_VOICE_RELAY_URL`·`EXPO_PUBLIC_WEB_URL` 가 없으면 빌드가 실패하거나
   앱이 설정 오류 화면에서 멈춘다(심사 거절 사유).
3. **AAB 빌드**: `eas build --platform android --profile production` → 첫 업로드는 Play Console 에서 직접(앱 서명은 Play App Signing).
   업로드 키·EAS 자격 증명 백업.
4. **비공개 테스트(개인 개발자 계정 — 2026-11-27 사용자 확인)**: 프로덕션 신청 전에 **테스터 12명 이상이
   14일 연속 참여한 비공개 테스트**가 필요하다. 순서: 내부 테스트 트랙에 AAB 업로드(동작 확인) → 비공개 테스트 트랙에
   테스터 12명 이상(Google 계정 목록·그룹) 초대·설치 → 14일 유지 → Play Console 에서 프로덕션 액세스 신청(테스트 내용 설문) → 프로덕션 출시.
   비공개 테스트 출시도 심사를 받으므로 아래 6번(앱 콘텐츠 입력)을 비공개 테스트 전에 끝낸다. 파일럿 기관 직원을 테스터로 쓰면 실기기 검증(T25.16)과 겹쳐 진행할 수 있다.
5. **심사 계정 만들기**(2.1) — 운영 DB 쓰기 승인.
6. **Play Console 입력**: 앱 액세스 · 데이터 보안 · 건강 앱 · 대상 연령 · 콘텐츠 등급 · 스토어 등록정보(스크린샷·아이콘 512·그래픽 1024×500).
7. **법무 확인**: 삭제 처리 기한·본인 확인·데이터 보안 '건강 정보' 여부.

## 4. 심사 위험으로 남겨 둔 것 (결정 필요)

- **화면 카피 "인지 효과 분석"·"향상률"**(앱 분석 화면, Figma 카피 — 2026-08-12 사용자 '보류' 결정). 건강 효과 주장으로 읽힐 수 있다.
  스토어 설명·스크린샷에는 쓰지 않기를 권한다. 앱 카피를 바꿀지는 사용자 결정.
- **주황 대비**(결정 C) — 접근성 심사 사유는 아니나 출시 전 재확인 항목.
- **iOS**(App Store)는 이번 범위가 아니다 — 계정 삭제·신고 경로는 iOS 앱에도 같은 화면으로 들어 있다. 사진 선택 시
  iOS 권한 문구 등 App Store 별도 점검 필요.
