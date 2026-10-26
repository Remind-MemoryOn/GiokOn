# 안전 수정 운영 반영 및 일지 후속

## 2026-10-27 확인

- 기준 소스: main `b4758ce` (SAFE-09/10 수정 포함).
- core 323, relay 138, mobile 476 테스트 통과. 모바일 Figma 174, 폰트 검사 통과.
- 배포 이미지 자체에서 합성 문장 실행: SAFE-09 완곡 표현은 crisis/escalate=true, SAFE-10 복용 지시는 allowed=false, 약과 회상은 allowed=true. 외부 모델/DB를 호출하지 않은 컨테이너 검증이다.
- Docker linux/amd64 이미지 빌드·Artifact Registry 업로드 완료.
- Cloud Run `voice-relay-00013-qft` Ready/Active, 트래픽 100%. 이미지 manifest digest `df24f000d57e2ca9d45d1aa5caccb2a28761387e674bb326936904dd8b336fa3`; index digest `b51c3aad9526249de8e4997e4182577325ec8b6600babdd28f4cf9d4ee4db475`.
- `/readyz`는 `ready`. 공개 `/healthz`는 Google 404 응답이므로 성공으로 기록하지 않는다. 서비스 조건 ContainerHealthy=True를 확인했다. 실제 음성/푸시 종단 검증을 의미하지 않는다.
- Android preview 빌드 `945311c0-8c1a-4236-9e59-2b8a8cb29ed1` 진행 중. 기존 태블릿 수정 APK `9c9eac7c-b48a-40f5-b3b6-79bbfd2c3e07`는 SAFE 수정 전이다.
- iOS preview는 내부 배포 서명 정보가 없어 실패. 사용자 지시로 Android 우선, iOS 보류. 과거 iOS 산출물은 시뮬레이터용으로 실기기 IPA가 아니다.
- ADB 연결 기기 0대. 실기기 SAFE-09/10, 태블릿 회전/키보드, 푸시 수신은 미실행.

## 일지 후속

- 생성 지침에 사람별 행동·빈도·시점 구분, 방문/연락 혼합 금지, 재생성 시 상대 날짜 표현 회피를 추가했다. `program-journal-draft`만 배포 완료.
- 웹 빈 AI 필드 안내는 실제로 확인한 내용만 보완하도록 변경. 의견수렴은 직접 들은 의견이 있을 때만 입력하도록 안내한다. 웹 배포 전이다.
- 기존 생성 검증 25개, 공급자/워커 46개 통과. 의미 정확성에 대한 실제 Gemini 재생성 성공 근거는 아직 없으며 프롬프트는 의미 보증 가드가 아니다.
- 웹 typecheck/lint, 카피·디자인 213·BOM 통과. frozen-lockfile 설치 후 배포 웹 high/critical 0건 확인(앱/빌드 도구 8건 별도).
- 전체 워크스페이스 typecheck, Vite 8.1.6 웹 build, `test:journal` 브라우저 회귀 통과. 초기 워커 테스트 파일명 오기로 실행 대상 0개였던 명령은 검증에서 제외하고 실제 `program-journal-draft.test.ts`로 재실행했다.
- 08:16 KST 운영 조회: final 1 / failed 7. 사용자는 6건 재생성을 알렸지만 실패 행과 작업 updated_at은 10/16~17 그대로였다. 새 요청이 반영됐다고 판정할 수 없어 웹 주소/오류 문구 확인 요청. cron은 정상 실행 중이다.
- 어르신 발화 없는 1건은 재시도로 내용 생성 불가. 확정 일지·승인·공개를 변경하지 않았다.
- 자동 참여자 채움·문장별 근거 표시·필드 보완 상태 분리 등은 아직 미구현이며 기존 출력 점검 문서의 후속 범위를 유지한다.

## 다음 확인

Android 빌드 완료·다운로드 → 기기 연결/설치 → 실음성 SAFE-09/10 및 키보드/푸시. 일지 6건은 정상 로그인 재생성 요청 도달부터 확인 후 생성 시각·확인 대기·필드·근거를 대조한다.

사용자 Downloads 실행서 폴더에 `09_SAFE수정_재검증_2026-10-27.md` 추가. 실제 위험 행위 없이 직원 테스트 계정으로 입력 안전·출력 검열·푸시·일지 상태를 확인하는 방법과 판정 한계를 적었다.
