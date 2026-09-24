# Session report — 시연용 LLM 분석·일지 초안

> ## ⚠️ 2026-09-23 기획 변경 — 이 함수의 역할이 바뀐다
>
> 계획 SoT: [`docs/plans/pilot-development-plan.md`](../../../docs/plans/pilot-development-plan.md) §8 C4.
> - **생성 로직 공유**: `handler.ts` 의 생성 로직을 `_shared/report-generation.ts` 로 추출해, 이 함수와 새 워커
>   `program-journal-draft`(세션 종료 → 큐 → 프로그램 일지 초안 **자동** 생성)가 함께 쓴다. 워커는 초안을 **확인 대기까지만** 쓴다 —
>   확정은 DB 트리거가 서비스 계정에게 막는다.
> - ⚠️ **`REPORT_ALLOWED_USER_IDS` 시연 허용목록을 기관 게이트로 교체** — 그대로 두면 파일럿 참가자 전원이 403 이다
>   (아래 "사용자 직접 검증 전 설정"은 시연 단계 절차다).
> - 아래 검증 순서의 "웹 일지의 `회상 대화에서 일지 초안` → 미리보기·적용"은 **요양일지 경로**라 폐기된다
>   (요양일지 → 프로그램 일지 전환, 기존 `care_journals` 데이터 삭제 확정). 수동 생성은 프로그램 일지의 "다시 생성"으로 남는다.
> - 생성문 검증(어르신 발화 근거 인용 강제·진단/효능 표현 차단)은 **재사용·확장**한다 — 금지어에 `인지 저하`·`우울`·`정서 불안`·
>   `병원 진료 권장` 을 더하고, 적중한 **필드만 비워** 확인 대기로 넘긴다.

POST 본문은 `{ "session_id": "종료된 세션 UUID" }`만 받는다. Supabase JWT 검증을 유지하며 서버에서 현재 담당 권한·필수 동의·시연 허용 계정을 검사한다. 전사는 서버가 session_logs에서 조회한다.

## 운영 설정

- `GEMINI_API_KEY`: 기존 서버 등록 키를 재사용한다. 클라이언트로 반환하지 않는다.
- `GEMINI_REPORT_MODEL`: 보고서용 텍스트 모델. 현재 운영 등록값은 `gemini-2.5-flash`이며 실제 공급자 성공은 시연 계정으로 확인해야 한다.
- `REPORT_ALLOWED_USER_IDS`: 사용을 허용할 시연 담당자 UUID를 쉼표로 구분한다. 미등록이면 요청을 거절한다. 보호자는 생성 API를 호출할 필요가 없다.
- Supabase URL/anon key는 Edge 런타임 기본값을 사용한다. service role로 데이터 권한을 우회하지 않는다.

배포: `supabase functions deploy session-report --project-ref ufkbzpdjomtmxjipmwub --use-api`. `--no-verify-jwt`와 `--prune`를 사용하지 않는다. 환경 파일은 읽지 않는다.

### 사용자 직접 검증 전 설정

Supabase Dashboard → Authentication → Users에서 시연 담당자 계정의 User UID를 확인한다. 아래 자리표시자를 해당 UUID로 교체해 실행하거나, Dashboard의 Edge Function Secrets에서 같은 이름으로 등록한다. 이메일 주소가 아니라 UUID를 사용한다.

```powershell
supabase secrets set REPORT_ALLOWED_USER_IDS="담당자-USER-UUID" --project-ref ufkbzpdjomtmxjipmwub
```

이 설정이 없으면 `시연 분석 사용 계정 설정을 확인해 주세요.` 오류로 차단된다. 최신 앱·웹 코드로 실행한 뒤 담당자 로그인→대화 종료·저장→분석 생성→웹 일지의 `회상 대화에서 일지 초안`→미리보기·적용·최종 저장 순서로 확인한다. 보호자 코드 연결과 담당자 승인을 마친 후 일지를 공개하고 보호자 화면에서 같은 본문을 확인한다. 기존 설치 앱에는 이번 화면 변경이 자동으로 포함되지 않는다.

## 데이터와 실패 처리

- 종료 세션의 기존 session_analyses에 기본 관찰 지표가 있어야 한다.
- LLM은 summary/topics/journal과 어르신의 근거 발화 ID·인용을 반환한다. 실제 인용 존재를 확인하지만 이것만으로 의미 전체의 사실성을 보증하지 않는다. 최종 일지 확인·공개는 담당자에게 남긴다.
- 수치 지표를 보존하고 요약과 generatedReport 메타데이터만 갱신한다. 원본 해시·분석 updated_at을 비교해 늦은 결과의 덮어쓰기를 막는다.
- 같은 원본의 저장된 보고서는 재사용한다. 공급자 오류·제한·불완전 출력·허위 인용·동의 철회·저장 충돌은 실패로 처리하고 원래 기록을 유지한다.
- 입력 최대 240개 메시지/JSON 48,000자, 공급자 응답 128KiB, 공급자 대기 45초, 출력 토큰 8,192. 제한 초과 시 일부만 몰래 분석하지 않고 거절한다.
- 인스턴스 내 세션별 중복 생성 방지·사용자 분당 3회 제한이다. 다중 인스턴스 전역 한도나 과금 상한이 아니다. 일반 출시 전 별도 분산 한도 개발이 필요하다.

## 검증

`packages/data/src/session-report-{provider,handler,entrypoint}.test.ts`는 합성 인증·공급자·DB를 사용해 실제 소스의 실패 경로를 시험한다. `apps/web/scripts/report-flow-smoke.mjs`는 환경 파일 없이 브라우저에서 생성 요청·미리보기·명시적 적용·실패·재시도·취소 시 본문 보존을 시험한다. 둘 다 실제 Gemini 호출/실기기 성공을 대신하지 않는다.

운영 배포·실 API·종단 리허설 상태는 `docs/plans/demo-llm-implementation.md`를 따른다.
