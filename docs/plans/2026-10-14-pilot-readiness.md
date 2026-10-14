# Android 파일럿 개시 준비

> ✅ 2026-10-15 EAS 앱 전용 프로젝트 연결: `@memoryon/giokon-mobile` · ID `00151025-03f4-47bd-b481-85577b7dd17e`. Expo 실제 소유자 식별자는 소문자 `memoryon`이며 `eas project:info`로 접근·일치를 확인했다. 기존 다른 용도 프로젝트는 변경하지 않았다. 패키지명 `kr.giokon.app` 유지. ⏳ 새 프로젝트의 preview 환경변수·Firebase 파일·FCM V1·서명·APK 빌드·실기기 검증은 별도다.


## 범위와 사용자 결정 (2026-10-14)

직원과 시험 데이터로 Android 사전 검증을 먼저 한다. 실제 어르신 참여는 동의·권한·위기 종료·알림·기록 보호의 종단 검증을 통과한 뒤다.
파일럿 중 남은 개선을 병행할 수 있지만, 안전·개인정보·필수 기능 실패는 개시 조건에서 제외하지 않는다.

- ✅ PR #55 운영 반영 승인. 확인 시점에 이미 main 병합됨(`df2d220`). 중복 적용하지 않았다.
- ✅ 선문대학교 기관 AI 초안 활성화 승인·운영 UPDATE·재조회 확인. 자동 확정·공개 권한은 바꾸지 않았다.
- ✅ 주황색은 이번 파일럿에서 현행 유지. 대비 미달은 해결된 것이 아니며 실제 기기 가독성 확인과 정식 출시 전 재검토가 남는다.
- ✅ 공유 시크릿 설정·Cloud Run 갱신·live-token 배포 승인.

## 확인한 운영 사실

| 항목 | 결과 |
|---|---|
| 확정 기록 보호 | 운영 이력 `20261013120557`, DELETE 트리거, Storage UPDATE의 USING/WITH CHECK 및 DELETE 보호 존재 |
| 기관 AI 초안 | `ai_drafts_enabled=true` 재조회 확인. 실제 생성 성공은 미검증 |
| Cloud Run | 서울 `voice-relay`, 이미지 태그 `a0cadee`, `/readyz` → ready. 현재 저장소와 중계·live-token 소스 차이 없음 |
| 중계 운영 설정 | 최대 인스턴스 1, 동시 요청 10, 타임아웃 900초, CPU 항상 할당 확인 |
| 중계 인증 | Cloud Run에 VOICE_RELAY_SECRET 참조 있음. Supabase 시크릿 목록에는 없음. live-token v18은 이전 배포본 |
| EAS | 로그인 가능. preview에 GOOGLE_SERVICES_JSON 및 확인 대상 앱 공개 변수 4개 미등록 |
| Firebase/FCM | 사용자 확인: 아직 등록하지 않음 |
| 실기기 | adb 연결 기기 없음. 실제 음성·푸시·배포 APK 검증 미완료 |

## 남은 개시 순서

1. 같은 새 VOICE_RELAY_SECRET을 Cloud Run Secret Manager와 Supabase에 등록한다. Cloud Run은 해당 버전으로 갱신하고 ready 확인 후 live-token을 배포한다(verify_jwt=true 유지).
2. EAS preview에 Firebase 파일과 공개 연결 변수를 등록하고 FCM V1 발송 자격 증명을 연결한다.
3. 실제 운영 주소를 담은 preview APK를 빌드하고 Android 기기에 설치한다. 개발 PC/Metro 없이 실행되는지 확인한다.
4. 직원 시험 계정·시험 어르신으로 launch-checklist §3 및 T25.16을 수행한다. 실제 개인정보를 시험 발화에 넣지 않는다.
5. 기관 담당자·유효 동의·실음성 적합성·장애 대응을 확인한 뒤 어르신 파일럿을 시작한다.

**배포 실행 제한**: 2026-10-14 공유 시크릿 생성·양쪽 등록·Cloud Run 갱신 명령이 실행 전 자동 승인 검토에서 차단됐다.
반환 이유는 `blocked by policy`뿐이다. 해당 시도는 실행되지 않았고 live-token 배포도 하지 않았다.
시크릿 값을 채팅이나 Git에 남기지 말고 운영자가 각 콘솔에서 같은 값을 등록한다.
환경변수 방식 시크릿은 특정 버전에 고정한다([Google 공식 문서](https://docs.cloud.google.com/run/docs/configuring/services/secrets)).

등록 뒤 Windows cmd에서 실행할 명령(아래 버전 번호를 실제 등록한 번호로 바꾼다):

```cmd
gcloud run services update voice-relay --project=norse-case-510509-e8 --region=asia-northeast3 --update-secrets=VOICE_RELAY_SECRET=VOICE_RELAY_SECRET:VERSION
curl.exe -f https://voice-relay-cgf75f273q-du.a.run.app/readyz
supabase functions deploy live-token --project-ref ufkbzpdjomtmxjipmwub
```

배포 후 정상 직원 세션 연결 및 중계 헤더 없는 직원 JWT 요청의 거절을 각각 검증한다. health/ready 성공만으로 Gemini·권한·푸시를 검증했다고 표시하지 않는다.

## 파일럿과 병행 가능한 항목

- SDK 55 상향 전 expo-audio 전환, 테스트 도구 상향/개발 도구 취약점 처리.
- 공개 Play Store 제출 전 계정 삭제 요청 앱 진입·웹 접수·처리 절차.
- 자동 세션 재인수 고도화. 그전에는 프로세스 종료 시 감독 화면에서 기존 세션을 명시적으로 종료하고 재시작하는 절차를 시험한다.
- Storage/DB 파기의 원자성 개선. 그전에는 직원 파일럿 중 삭제와 확정을 동시에 수행하지 않는다.
- 로그인 후 감독 URL 복귀 개선. 그전에는 감독 브라우저에 미리 로그인하고 알림 탭 도착을 실제로 확인한다. 이것이 실패하면 안전 체인 미통과다.

공단 인정 전제가 확인되지 않은 동안 공식 인정/효능을 주장하지 않는다. 실제 개인정보 처리에 필요한 동의·법무 조건은 실제 참여 전에 확인한다.
측정 지표의 최종 합의는 병행할 수 있으나 첫날부터 제공 횟수·기록 품질·시간 측정 방법을 기록한다.
