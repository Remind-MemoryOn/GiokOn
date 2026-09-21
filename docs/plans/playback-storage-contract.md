# 재생 관측 저장 계약 — 2026-09-21

상태: TypeScript 저장/조회 어댑터와 가상 RPC 시험 완료. SQL·마이그레이션·앱 저장 연결·운영 적용은 아직 미구현이다. database.types.ts의 RPC 항목은 개발 계약이며 운영 스키마 존재의 근거가 아니다. Docker 검증은 사용자 보고 dockerInference 문제로 보류했다.

## 저장 계약

- 제안 RPC: `save_voice_playback_v1(p_session_id uuid, p_observations jsonb) returns integer`.
- 요청은 최대 120개의 `{turnIndex, text, result, observedAt}` 배열이다. turnIndex는 session_logs의 1부터 시작하는 순번이며 앱 임시 ID를 사용하지 않는다. result는 completed/interrupted/empty, observedAt은 기기가 관측한 정규 ISO 시각이다.
- 응답 정수는 확인한 요청 항목 수다. 같은 요청 재시도도 동일한 개수를 반환해야 한다. 0행·일부 반영을 성공으로 취급하지 않는다.
- 서버 구현은 호출자 권한으로 실행하며 기존 세션 소유·기관·동의·처리 조건과 RLS를 유지해야 한다. 저장된 AI 턴의 세션/순번/문장과 대조한 후 한 트랜잭션으로 기록한다. 중복 순번·틀린 문장·사용자 턴·허용량 초과·누락 대상은 전체 거절한다.
- 재생 완료 관측을 뒤늦은 interrupted/empty 요청으로 낮추지 않는다. 없는 과거 관측은 NULL로 유지한다. 기록 변경/삭제·소유자 변경을 이 RPC로 허용하지 않는다.
- 제안 session_logs.playback_observation은 `{text,result,observedAt}`이고 별도 서버 수신 시각/기록자 필드는 서버가 관리한다. 기기 시각과 서버 수신 시각을 혼동하지 않는다. completed는 앱 보고이며 실제 청취/이해를 증명하지 않는다.

## 앱 연결 조건

`persistPlaybackObservations`는 불일치 관측을 네트워크 전 거절하고 전송 사본을 만든다. RPC가 없으면 PLAYBACK_STORAGE_REQUIRED, 거절/확인 개수 불일치는 PLAYBACK_SAVE_FAILED다. 5초 요청 제한 후 실제 서버 반영 여부는 불확실할 수 있으므로 동일 payload 재시도가 멱등하도록 SQL을 구현해야 한다. 호출 전후 인증 범위 검사를 수행하며 자동 재시도하지 않는다.

`readPlaybackObservations`는 조회 행 ID를 키로 재생 관측을 복구한다. NULL/미지원 필드는 미관측이고 잘못된 관측/중복 ID는 복구를 거절한다. 현재 앱은 이 어댑터를 호출하지 않는다.

후속 순서: SQL 및 격리 DB 회귀 → 진행 중/종료 저장 연결 → 재생 관측 저장 성공 후 다음 청취 → 새 실행의 DB 조회 기반 복구 → 운영 적용 요청. SQL은 기존 53개 마이그레이션과 함께 검증하고 실제 스키마·이력 대조 후 별도로 적용한다. DB 보안 감사 재개가 아니다.
