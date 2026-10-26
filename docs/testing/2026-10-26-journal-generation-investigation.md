# 프로그램 일지 생성 실패 조사 — 2026-10-26

## 현재 판정

✅ 진단 워커 배포 후 사용자 재실행 1건의 실제 초안 저장 성공을 확인했다(2026-10-26 22:06:57 KST, 1회). 현재 해당 일지는 사람이 확정했다. ⏳ 나머지 실패7건 및 내용 정확성·작성 부담 개선. 과거 실패의 정확한 원인은 소급 확정되지 않았다. [재실행 후 상세 점검](2026-10-26-journal-output-review.md).

최초 조사 당시 서울 MemoryOn 운영 DB와 Edge 코드 v14를 확인했다. 당시 일지 8건 모두 failed, 생성 완료 0건이었다. 아래 실패 집계는 재실행 전 기준이다.

| 분류 | 건수 | 확인한 사실 |
|---|---:|---|
| 생성 단계 실패 | 7 | 각 6회 시도. 마지막 오류는 `AI 초안을 만들지 못했어요. 잠시 후 다시 시도합니다.` |
| 근거 발화 없음 | 1 | 6회 시도. session_logs 1행, user 발화 0행. AI 발화만 있어 초안 생성 전 차단 |

생성 실패 7건은 전체 기록 3~11행, user 발화 1~5행, 본문 합계 111~549자다. 현재 처리 동의와 기관 AI 스위치는 모두 true다. 워커가 생성 단계까지 도달했다는 오류 분류와 일치한다. 원문·성함·사용자 UUID·API 키는 조사 문서에 복제하지 않았다.

## 경로별 근거

1. 세션 종료 → 생성 작업 삽입은 동작했다. 8건 작업과 일지가 존재한다.
2. cron `program-journal-draft`는 active, 30 seconds다. endpoint는 해당 프로젝트의 `/functions/v1/program-journal-draft`이고 워커 비밀값이 설정돼 있다(값 조회 안 함).
3. 2026-10-26 03:12~03:27 UTC 재실행에서 Edge POST 202가 6회 관측됐다. 03:27 최종 실패 갱신까지 이어진다. 202는 작업 접수이며 생성 성공이 아니다.
4. 배포 함수 v14(verify_jwt=false)의 worker/shared generation 코드가 현재 조사 대상 소스와 동일한 오류 처리 구조다. claim/load/check/finish와 생성 오류 문구가 분리돼 있어 7건은 generate 또는 그 직후 필드 매핑 구간으로 좁혀진다.
5. 생성은 Supabase Edge → Gemini `generateContent` 직접 호출이다. Cloud Run/Docker는 음성 중계다. 저장된 근거가 있는 7건의 생성 실패를 Cloud Run 장애로 단정할 근거가 없다.
6. 필요한 시크릿 이름은 등록돼 있다. 등록만으로 값의 유효성·모델 접근 권한·API 사용량을 증명하지 않는다. `GEMINI_REPORT_MODEL` 실제 모델 이름은 사용자 확인/수정 후 진단 로그로 확인해야 한다.
7. 1건의 발화 부재는 현재 저장 상태로 확정한다. 당시 사용자가 실제 발화했는지, 이전 앱/중계에서 유실됐는지는 원문 없는 집계만으로 확정할 수 없다. 발화를 지어내 초안을 채우지 않는다.
8. security/performance advisor도 조회했다. 워커 큐의 RLS 무정책은 service_role 전용 설계이며 실제 claim 성공 증거가 있다. advisor 경고만으로 이번 생성 실패 원인이라 판단하지 않는다.

## 확정된 내부 결함과 수정

기존 adapter는 429 외 모든 HTTP 실패를 REPORT_PROVIDER_FAILED로 뭉쳤다. worker는 구성 누락·HTTP 오류·타임아웃·JSON 파싱·근거 검증 오류까지 같은 사용자 문구로 바꾸고 원인을 기록하지 않았다. 기존 function 로그에는 boot/shutdown만 있어 과거 7건의 실제 HTTP 상태를 복구할 수 없다.

- adapter는 오류 본문을 읽지 않고 HTTP 상태만 `ReportProviderError`에 보존한다.
- 워커는 claim/load/input/check/generate/finish/fail 경계에서 구조화 진단을 기록한다.
- 정확히 허용한 코드만 기록한다. 알 수 없는 메시지는 UNKNOWN, JSON 오류는 INVALID_JSON, 중단은 REPORT_ABORTED다. stack/원문/키/공급자 응답 본문은 기록하지 않는다.
- 진입점은 문법을 검증한 모델명과 API 키 존재 여부만 덧붙인다. 키 값은 기록하지 않는다.
- 로그 실패가 DB 실패 보고를 막지 않는다. 동의 검사·인용 검증·의료 표현 차단·재시도·사람 확인/확정/공개 규칙은 유지한다.

이 수정은 관측 불가능 문제를 고친다. 운영 생성 장애를 이미 고쳤다는 뜻이 아니다.

## 검증

- 기존 코드에서 새 진단 회귀 12개 실패 확인 → 수정 후 통과. 진입점 배선 회귀도 수정 전 실패 확인.
- 데이터 전체 265개, core 290개 통과(진입점 추가 회귀 전 실행). 진입점 추가 후 최종 관련 회귀 46개 및 data typecheck 통과.
- 전체 workspace typecheck, check:copy, check:bom 통과.
- 오류 allowlist를 제거한 변형에서 민감 문자열 비노출 회귀가 실패함을 확인, 즉시 원본 복원.
- DB/schema 변경 없음. 운영 데이터 변경·재시도·배포·API 키 교체 없음. 실 Gemini 호출 성공 검증은 아직 없다.

## 승인 후 실행할 최소 진단·복구

1. `program-journal-draft`만 수정 코드로 배포한다. verify_jwt=false와 기존 비밀값 인증을 유지한다. Cloud Run/앱 재빌드는 필요 없다.
2. 웹에서 실패한 일지 중 user 발화가 있는 1건만 '다시 생성'한다. 권한·동의 검사를 우회한 일괄 SQL 재큐잉은 하지 않는다.
3. Edge 로그의 `journal_generation_failure`에서 stage/code/httpStatus/model/apiKeyConfigured를 확인한다. 성공 시 DB의 pending_review 및 draft_generated_at을 확인한다.
4. 아래 분기에 따라 해결한다. 수정 후 한 건 성공을 먼저 확인하고 나머지 6건을 재시도한다. 근거 없는 1건은 직접 작성 또는 별도 저장 유실 조사 대상으로 둔다.

| 관측 | 다음 조치 |
|---|---|
| REPORT_CONFIGURATION | Supabase의 GEMINI_REPORT_MODEL 문법·GEMINI_API_KEY 등록값 확인(값을 채팅으로 공유하지 않음) |
| HTTP 400 | 모델의 generateContent/구조화 출력 지원과 요청 계약 점검. 코드 문제면 최소 수정 후 회귀 |
| HTTP 401/403 | 사용자가 Google AI Studio/Cloud의 해당 키 프로젝트, 키 제한, API 사용 설정·접근 자격 확인 |
| HTTP 404 | 모델명·프로젝트별 모델 접근 확인. 실제 호출 가능한 보고서 모델로 변경 검토 |
| HTTP 429 | 사용자가 Gemini 쿼터·결제·요청 제한 확인. 모델 변경만으로 해결된다고 가정하지 않음 |
| HTTP 5xx / REPORT_ABORTED | 공급자 상태·지연·45초 타임아웃 구분. 무조건 타임아웃을 늘리지 않음 |
| INVALID_EVIDENCE 등 검증 오류 | 공급자 정상 응답 후 내용 검증 실패. 허위 인용 검증을 풀지 않고 출력 계약/프롬프트 개선 |
| FINISH_FAILED | DB 저장 가드·필드 제약 별도 추적. 생성 API 문제와 구분 |

Google 공식 모델 안내는 2.5 Flash를 과거 사용 이력이 있는 프로젝트로 제한한다고 설명한다. 최신 페이지에는 종료일이 없으므로 검색에 남은 '10월 16일 종료'만으로 장애 원인을 단정하지 않는다. 현재 운영 모델·실 HTTP 응답 확인이 먼저다.

출처: https://ai.google.dev/gemini-api/docs/deprecations · https://ai.google.dev/gemini-api/docs/structured-output
