# program-journal-draft — 대화가 끝나면 프로그램 일지 초안을 자동으로 만든다

계획: [`docs/plans/pilot-development-plan.md`](../../../docs/plans/pilot-development-plan.md) §8 C4 · tasks T20.6.
사용자 확정(2026-09-25): **"초안 생성" 버튼은 없다** — 대화가 끝나자마자 AI 가 초안을 만들고, 사람은 확인·수정·확정만 한다.
사람이 누르는 것은 생성이 **실패한 일지의 "다시 생성"**(복구, `retry_journal_generation`) 하나뿐이다.

## 흐름

```
세션 ended ─(DB 트리거)→ 일지 generating + 생성 작업(queued)        ← 기관 AI 스위치가 꺼져 있으면 작업 없이 바로 pending_review(직접 작성)
pg_cron 30초 → app.kick_journal_worker() → (할 일이 있을 때만) pg_net POST  x-worker-secret
→ 이 함수: claim_journal_generation_jobs(비밀값 확인 + 최대 3건 잡기) → 202 응답
→ 백그라운드(EdgeRuntime.waitUntil): session_logs → Gemini(_shared/report-generation) → core 매핑·진단표현 칸 비우기
→ finish_journal_generation → 일지 pending_review(확인 대기)          ← 확정은 DB 가드가 서비스 계정에게 막는다
   실패 → fail_journal_generation → 30s·1m·2m·4m·5m 백오프 → 6회째 failed(웹 "다시 생성")
```

- 잡을 때 다시 본다: 사람이 이미 확인한 일지 · 기관 AI 꺼짐 · 처리 동의 없음 → AI 로 보내지 않는다(빈 초안 확인 대기).
- 사람이 생성 중에 먼저 쓴 칸은 덮어쓰지 않는다. 워커는 활동 내용·참여자 반응·의견 수렴·보호자 문장만 채운다
  (종합평가·다음 계획은 사람). 진단·판정 표현이 걸린 칸만 비운다(core `screenJournalDraft`).
- 실패 문구(`last_error`)는 요양보호사가 읽는다 — 공급자 원문·내부 코드는 넣지 않는다(`worker.ts` `WORKER_MESSAGES`).
- running 으로 5분 넘게 남은 작업(워커 중단)은 다음 claim 이 회수한다.

## 인증 · 배포

- `verify_jwt=false` 로 배포한다 — 호출자는 DB(pg_net)뿐이고, JWT 대신 **DB 가 마이그레이션 때 만든 비밀값**
  (`app.worker_config.secret`, API 에 노출되지 않는 스키마)으로 인증한다. 비밀값 확인은 claim/finish/fail RPC 가 DB 안에서 한다
  (RPC 는 service_role 만 실행 가능). 수동 시크릿 설정이 없다.
- 필요한 Edge 환경값: `GEMINI_API_KEY`·`GEMINI_REPORT_MODEL`(session-report 와 같은 값) · `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`(런타임 기본).
- 운영에서 한 번: 워커 주소 설정(마이그레이션은 주소를 넣지 않는다 — CI·로컬은 비어 있어 호출하지 않는다).
  ```sql
  update app.worker_config set endpoint = 'https://<project-ref>.supabase.co/functions/v1/program-journal-draft'
   where name = 'program-journal-draft';
  ```
- 기관별 AI 스위치(비용): `org_settings.ai_drafts_enabled` — **플랫폼 운영자만** 켠다. 기본 꺼짐.

## 검증

- ✅ 2026-10-26 진단 코드 운영 배포 후 사용자 재실행 1건이 1회 시도로 저장된 것을 확인했다. 아래 초기 배포 대기는 해소됐다. 모든 일지의 복구·모든 필드의 완전성을 뜻하지 않는다. [필드·상태 점검](../../../docs/testing/2026-10-26-journal-output-review.md).

- ✅ 2026-10-26 오류 진단 정보 유실 수정·로컬 회귀. ⏳ 운영 배포 승인 및 실제 생성 장애 원인 확정/복구. [조사 보고서](../../../docs/testing/2026-10-26-journal-generation-investigation.md).
- 실패 시 Edge 로그의 `journal_generation_failure`를 확인한다. `stage`, 허용된 `code`, `httpStatus`, `jobId`, `attempt`, 문법 검증된 `model`, `apiKeyConfigured`만 기록한다. 원문·공급자 본문·키·stack은 남기지 않는다. 202 응답은 생성 성공을 뜻하지 않는다.

- DB: `supabase/tests/journal_worker.sql`(스위치 잠금·꺼진 기관·권한·비밀값·백오프·failed·다시 생성·사람 칸 보존·동의 없음·회수).
- 워커: `packages/data/src/program-journal-draft.test.ts`(매핑·재시도 구분·202 백그라운드·비밀값·진입점 배선).
- 실제 Gemini 호출·운영 종단(세션 종료 → 초안)은 기관 스위치를 켠 뒤 확인해야 한다.
