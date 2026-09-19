# 전사 출처 저장 v1 — 적용 전 확인

개발 대상은 기능용 전사 출처 계약이다. 기존 DB 보안 감사의 해결 판정을 바꾸지 않는다. 운영 미적용이며 로컬 PostgreSQL 16의 전체 저장소 마이그레이션·기존 회귀·신규 전사 계약 시험으로 검증했다.

## 계약

- 마이그레이션: `20260919175923_transcript_provenance.sql`(Supabase CLI 생성). session_logs에 transcript_provenance와 transcript_revisions를 추가한다.
- version=1, kind=automatic/caregiver_confirmed, presentedText=채택 전 입력(null이면 직접 입력), inputSource=gemini_live/manual/unknown. 이는 입력 출처의 보고이며 음성과 정확히 일치한다는 독립 검증 결과가 아니다.
- caregiver_confirmed의 confirmedBy/confirmedAt은 서버가 auth.uid()/statement_timestamp()로 기록한다. 시각은 확인 버튼을 누른 기기 시각이 아니라 서버가 해당 확인 저장을 처리한 시각이다. 동일 재시도는 기존 시각·이력을 유지한다.
- 수정 시 이전 내용·교정 원문·출처와 수정자/시각을 보존한다. 클라이언트가 이력을 지워 덮어쓸 수 없다. 100회 수정 상한이며 초과 시 실패한다. 삭제·보관 기한은 부모 세션 로그 수명에 따른다.
- 과거 NULL 출처를 확인 완료로 추정하지 않는다. 기존 앱의 동일 내용 upsert는 출처를 지우지 않는다. 기존 앱이 출처 없이 새 계약 기록의 내용을 바꾸는 것은 거절한다.
- 기존 RLS·동의·레코드 식별자 검사 유지. 별도 권한 우회 함수 없음.

## 앱 호환

`transcript_storage_version()`이 1이면 새 필드를 전송한다. RPC가 없는 구서버만 수동 저장을 기존 방식으로 처리한다. 자동 채택은 구서버에서 저장하지 않는다. 네트워크/권한 오류·알 수 없는 버전은 저장 실패로 처리한다. 계정 경계가 바뀐 뒤에는 쓰지 않는다.

확인 전 표시 입력과 최종 text를 보존하며, Gemini 오디오 자체·생성/재생 이력의 영구 저장은 이 마이그레이션에 포함하지 않는다. 재생/맥락 계약은 별도 후속 작업이다.

## 외부 적용 순서(아직 실행하지 않음)

1. 운영 대상 MemoryOn(`ufkbzpdjomtmxjipmwub`)의 최신 이력과 같은 이름의 적용 여부를 확인한다.
2. 사용자 적용 승인 후 CLI로 이 마이그레이션 한 건을 적용하고 기존 방식대로 이력을 기록한다. 이미 적용돼 있으면 DDL을 재실행하지 않는다.
3. 실제 카탈로그·RPC 버전·기존 수동 저장·신규 출처 왕복과 재시도를 검증한다.
4. 자동 대화 앱/중계 개발을 끝내고 서버→앱 순서로 배포한다. 지금 이 변경만으로 자동 루프가 활성화되지는 않는다.
5. 롤백은 앱의 자동 진행을 중지하고 수동 경로로 복귀한다. 새 컬럼/기록은 보존한다. 출처 컬럼을 삭제하는 롤백은 데이터 손실 때문에 사용하지 않는다.

## 로컬 재현

Windows: `./scripts/test-transcript-storage.ps1` — 설치된 Docker의 postgres:16 이미지로 네트워크/호스트 포트 없는 임시 DB를 생성, 전체 마이그레이션과 기존·신규 SQL 시험 후 자신이 만든 컨테이너만 정리한다. 환경 파일을 읽지 않는다.

Linux/CI: 기존 `supabase/tests/run-rls-regression.sh` 및 CI DB 작업에 신규 SQL 시험을 추가했다. GitHub 원격 CI 실행 결과는 로컬 검증과 별개다.
