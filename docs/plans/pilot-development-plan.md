# 파일럿 개발 계획 — 인지활동 프로그램 + 공단 일지 자동화

> ✅ 2026-10-16 실제 사용자 음성 입력·AI 후속 응답 성공. ⏳ M1 대화 품질 후속: 사용자 요청으로 TTS 중 발화 우선 동작, 지연 단축, 한 번 미인식 뒤 즉시 중단 개선 검토. 기존 순차 재생/청취 동작의 변경이며 아직 구현되지 않았다. [실측·요구](2026-10-16-voice-turn-experience.md).

> ✅ 2026-10-16 M1 수정 APK `3949365` EAS 완료·태블릿 교체 설치. 구 APK의 실제 PCM 전달은 확인했으나 153청크 모두 음량 기준 미달·전사 0. ⏳ 새 APK 실제 발화 및 무음/낮은 입력 구분. 파일럿 음성 종단 검증은 아직 미완료.

> ✅ 2026-10-16 M1 발화 종료 순서 수정·앱 418개 회귀·실제 Gemini 공개 음성 2턴 검증. 전사 전에 activityEnd를 보내며 입력 저장 후 응답 재생 원칙 유지. 진단 중계 `voice-relay-00007-q9c` 배포. ⏳ 새 APK와 태블릿 마이크→전사→후속 응답→DB 저장 확인. [진행 기록](2026-10-15-voice-start-investigation.md).

> ✅ 2026-10-16 C3 첫 인사·TTS 실제 청취·DB 저장 확인. ⏳ 사용자 음성 입력 미진행은 별도 조사 중(중계 입력 진단 추가, 95개 회귀 통과). 파일럿 전체 종단 검증 완료가 아니다.

> ✅ 2026-10-16 C3 후속: 텍스트 전용 첫 인사의 Gemini 1007 실 API 재현·중계 호환 수정·94개 회귀 통과. 실제 중계+Live/TTS 2턴 합성 검증 및 운영 `voice-relay-00006-5sf` 트래픽 100% 배포. ⏳ 기존 APK에서 마이크·재생·저장 확인. [20개 경로 점검](2026-10-15-voice-start-investigation.md).

> ✅ 2026-10-15 C3 대화 시작 차단: live-token의 복수 키 JSON 처리 오류 수정·운영 v23 배포. ⏳ 수정 후 실제 첫 응답·TTS·재생·저장은 아직 미검증. [20개 경로 점검](2026-10-15-voice-start-investigation.md).

> ✅ 2026-10-15 Android EAS Gradle 실패 수정: Reanimated의 필수 네이티브 peer `react-native-worklets@0.5.1`을 앱 직접 의존성으로 선언했다(override만으로는 앱 루트의 Gradle resolve가 보장되지 않음). `.gitignore`·`.vercelignore` 보강, 저장소 루트 `.easignore` 추가. EAS 실제 업로드 사본에서 소스·워크스페이스 보존 및 비밀/캐시/네이티브 산출물 파일 제외 확인. ⏳ 새 APK 클라우드 빌드 결과와 실기기 T25.16은 별도 확인.


> ✅ 2026-10-15 EAS 앱 전용 프로젝트 연결: `@memoryon/giokon-mobile` · ID `00151025-03f4-47bd-b481-85577b7dd17e`. Expo 실제 소유자 식별자는 소문자 `memoryon`이며 `eas project:info`로 접근·일치를 확인했다. 기존 다른 용도 프로젝트는 변경하지 않았다. 패키지명 `kr.giokon.app` 유지. ⏳ 새 프로젝트의 preview 환경변수·Firebase 파일·FCM V1·서명·APK 빌드·실기기 검증은 별도다.


> **2026-10-14 파일럿 개시 준비 갱신**: ✅ PR #55 병합·확정 기록 보호 운영 반영 확인, 기관 AI 초안 활성화. ✅ 사용자 결정: Android 직원 사전 검증부터, 주황색은 이번 파일럿 현행 유지. ⏳ 공유 시크릿 양쪽 등록·live-token 배포, Firebase/FCM·preview 설정·배포 APK·실기기 T25.16. 이전 대기 표보다 [최신 실행 기록](2026-10-14-pilot-readiness.md)을 우선한다.


> **2026-10-14 출시 전 재검토**: T28.1~6 코드·로컬 회귀·문서 ✅(검토 브랜치). 최종 푸시·CI와 승인 병합은 별도 표시한다.
> 확정 일지·첨부 보호 마이그레이션은 운영 미적용이며 승인 후 main 병합·대조한다.
> 코드 준비와 외부 배포·실기기 완료는 구분한다. [검토·개선 계획](2026-10-13-final-code-review.md), [상태](../tasks.md).

> **이 문서가 "무엇을 만들지"의 단일 소스(SoT)다(2026-09-23 기획 변경).**
> 이전 실행 목록(N01~N35 백로그, 사업 기획 델타 D1~D11)은 이 문서로 대체되어 2026-09-24 삭제했다(git 이력에 있다).
> 목표는 **파일럿 테스트 가능 수준**이지 정식 출시가 아니다.
> ⚠️ **번호 주의**: 이 문서의 `D1~D10` 은 **DB 파트 항목 번호**다. 옛 사업 기획 델타의 `D1~D11` 과 **이름만 같고 무관**하다.
> 다른 문서에서 이 번호를 인용할 때는 "파일럿 계획 D5"처럼 출처를 붙인다.

## 1. 무엇이 바뀌었나

| | |
|---|---|
| 변경 전 | 요양보호사 업무를 전반적으로 돕는 도구(회상 대화 + 요양일지 + 보호자 소통) |
| 변경 후 | **인지활동 프로그램을 AI가 진행하고, 그 결과가 공단 형식 프로그램 일지 초안으로 자동으로 남는 도구.** 요양보호사는 계획하고 감독하며 확인한다 |

케어포·엔젤시스템·이지케어가 청구·급여기록·보호자 앱을 이미 갖고 있어 "업무 보조"로는 이길 수 없다.
반면 **인지활동은 의무인데 비어 있는 영역**이다 — 요양원은 주 3회 이상 운영해야 하고 기록이 없으면
평가에서 깎이는데, 기존 ERP의 인지활동 기능은 인쇄용 활동지와 영상 콘텐츠 수준이다.
어르신 한 분의 인생사에 맞춘 1:1 대화가 곧바로 공식 기록이 되는 것은 아무도 하지 않고 있다.

### 판단이 애매할 때 쓰는 기준 셋

1. **이 기능을 기존 ERP가 이미 하는가?** → 그렇다면 만들지 않는다.
2. **AI 산출물이 사람 확인 없이 공식 기록이 되거나 보호자에게 가는가?** → 그렇다면 막는다.
   제도상 AI 단독 진행은 인정받기 어렵다. 사람이 계획·감독·확정한 흔적을 데이터로 남기는 것
   자체가 기능이다. **테스트 케이스로 검증한다.**
3. **이 기능이 "제공 횟수·기록 품질·시간 절감"을 측정 가능하게 하는가?** → 그렇다면 로그를 남긴다.
   시설 무료 + 정부 사업(용역·R&D) 수익 구조라 측정이 곧 매출 근거다.

## 2. 파일럿 범위 (사용자 확정 2026-09-23)

| 항목 | 결정 |
|---|---|
| 기능 범위 | 프로그램 일지 자동생성 · 분석→일지 매핑 · 감독 화면 · 안전 이벤트 푸시 · 대화 정책 체계화 · 권한 재설계 · 고령자 UI |
| 요양일지 → 프로그램 일지 | 전환. 기존 `care_journals` 데이터는 **삭제** |
| ERP API 연동 | 보류(붙여넣기 포맷 복사로 대체, 파일럿 범위 밖) |
| 보호자 옛 사진 | 검수 후 연대기 반영으로 확정(파일럿 범위 밖) |
| 보호자→요양보호사 메시지 | 이번 범위 밖 — **동결이지 제거가 아니다** |
| 시설 유형 | **요양원 + 주간보호** |
| 대화 모델 | **gemini-3.8-live** |
| 음성 경로 | **중계 단일화** — 직접 Gemini Live 폐기 |
| 감독 화면 | **웹 우선**(반응형). 앱에는 만들지 않는다 |
| 파일럿 규모 | 1기관 · 동시 2~4대 |
| 세션 시간 | **어르신 1명의 대화 세션 1회 = 최대 10분**(사용자 확정 2026-09-24) |
| 동시 감독 | **요양보호사 1명이 한 번에 최대 4대**를 감독(사용자 확정 2026-09-24) |
| 태블릿 | **지원**(`ios.supportsTablet: true`, 2026-09-24 반영). 화면 방향은 세로 고정 유지 |
| 신규 화면 디자인 | **기존 디자인과 최대한 같게** 최소 구현하고, 시안이 오면 교체(사용자 확정 2026-09-24) |
| 종료 정책 | **권장안 확정**: 휴식 요청·거부 → 마무리 전환, 위기·급성 고통 → 즉시 종료 유지(2026-09-24) |

**범위 밖이지만 데이터는 지금부터 남긴다**: 월간 계획표·현황판·"평소와 다름" 플래그·
카카오 알림톡·ERP 복사. 나중에 붙일 때 소급 계산이 불가능한 값(관찰 지표 기준선, 작성 시간 델타)이
있기 때문이다.

## 3. 현재 상태에서 출발하며 알아야 할 것

**① 권한 모델이 기획서와 정반대다.** 기획서는 기관 단위 격리를 요구하는데(교대근무라 오후
담당자가 오전 담당자의 세션 기록을 봐야 한다), 현재는 **요양보호사별 배정 격리**다 —
`20260722100000_elder_codes_caregiver_assignment.sql` 이 9개 테이블 정책을
`app.is_assigned_caregiver(profile_id)` 기반으로 재작성했다. 역할도
`org_admin|caregiver|guardian` 3종뿐이라 사회복지사·센터장이 없다. **모든 작업의 선행 조건.**

**② 일지가 기획서 요구를 담을 수 없다.** `care_journals.status` 는 `draft|final` 2상태,
공단 서식 필드 없음, `content` 자유서술 한 칸. 초안 생성은 전부 **수동 버튼**이다.

**③ 규칙 기반 대화는 중계 모드에서 이미 죽어 있다.** `packages/core/src/ai.ts`(779줄)의
`generateReply` 결과 질문은 중계 모드에서 계산되고 **버려진다**. 중계로 단일화하면 폴백 용도까지
없어져 파일 전체를 삭제할 수 있다.

**④ 어르신이 든 화면에 요양보호사 UI 가 그대로 있다.** 위기 배너(전화번호 포함), STT 수정 패널,
확인 없이 세션을 끝내는 X 버튼이 한 화면에 있다. 어르신 표시 모드 분리는 신규 기능이기 전에
**현 상태의 결함 수정**이다.

**⑤ 푸시가 통째로 없다.** FCM·APNs·expo-notifications 참조가 저장소에 0건이다.

**⑥ 생성문 검증은 이미 강하다 — 재사용 자산.** `packages/core/src/generated-session.ts` 가
모든 문장에 어르신 발화의 `turnId` + 원문 인용을 강제하고(`GroundedClaim`), 진단·효능 표현을
정규식으로 막으며, `handler.ts`·`provider.ts` 양쪽에서 검증한다. **새로 만들지 말고 확장한다.**
못 막는 것만 추가하면 된다: `인지 저하`·`우울`·`정서 불안`·`병원 진료 권장`.

**⑦ 동의 가드는 튼튼하나 철회 UI 가 없다.** DB 트리거가 `PROCESSING_CONSENT_REQUIRED` 로 막고
`app.stop_unconsented_sessions()` 도 있는데, `ElderDetailPage.tsx:434` 가 존재하지 않는 라우트를
가리켜 `/` 로 튕긴다. **파일럿 블로커.**

**⑧ 두 번째 직원이 같은 기관에 들어올 길이 없다.** ✅ 해결 2026-09-25(초대 코드 · 합류 승인 · 기관은 운영자가 만든다 — `docs/database.md` "기관 만들기 · 합류"). 당시 상황: 요양보호사 온보딩은 2026-07-25 이후 **항상 새 기관을
만들고 그 사람을 `org_admin` 으로** 만든다(`complete_onboarding` 의 어르신 코드 합류 경로 제거 — 코드는 보호자용).
당시 "여러 요양보호사의 같은 기관 합류는 추후 기관 초대 메커니즘으로"라고 미뤄 둔 것이 아직 없다.
**1기관·여러 직원 파일럿이 성립하지 않는다** — 진행자·감독자·확정자를 사람 단위로 남기려면 직원마다 계정이
같은 기관에 있어야 한다. **파일럿 블로커**(아래 D3·W9).

## 4. 설계 결정과 근거

**A. 역할은 enum 확장, 권한은 별도 테이블.** `org_role` 에 `social_worker`·`center_director` 를
추가한다 — 기존 9테이블 RLS 의 핵심 술어가 `current_org_role() <> 'guardian'` 이라
**보호자 격리가 코드 변경 0으로 유지**된다. 기관별 위임은
`org_capabilities(org_id, capability, allowed_roles org_role[])` 테이블로 둔다(RLS 에 역할을
하드코딩하면 위임을 바꿀 때마다 마이그레이션이 필요하다). 읽기 술어는 `app.is_care_team()` 으로
바꾸되 `app.is_assigned_caregiver()` 는 **삭제하지 않는다** — 알림 타깃팅과 "내 담당" 필터가 쓴다.

**B. 일지는 새 테이블 `program_journals`.** 데이터 삭제가 확정이라 가능하다. 공단 필드는 jsonb 가
아니라 **개별 컬럼**으로 둔다 — 길이 제약·진단표현 린트·부분 수정·이력 diff 가 전부 컬럼 단위여야
의미가 있다. `session_analyses.analysis` 가 불투명 jsonb 라서 지금 아무 집계도 못 하는 게 반례다.
공개 여부는 status 에 넣지 않고 **기존 `guardian_shares` 를 재사용**한다(철회·열람 이력이 이미 있다).

**C. 초안 자동 생성 = DB 트리거 → 큐 → 외부 워커.** 동기 호출은 불가능하다 —
`persistWholeSession`(폴백) 경로에서는 세션이 `ended` 가 될 때 분석 행이 아직 없다.

**D. 대화 단계는 `sessions` 컬럼.** 중계 메모리는 프로세스 재시작에 소실되고, 별도 테이블은 배선이
는다. `sessions` 는 이미 realtime publication 에 있어 감독 화면이 배선 0으로 단계를 본다.
**중계의 기존 2초 폴(`can_process_session`)을 `session_tick` RPC 로 교체**해 단계·원격 제어를
합승시킨다 — 새 타이머·소켓·인증이 없다.

**E. 원격 제어는 DB 행 + Realtime.** broadcast 는 RLS 를 타지 않아 기관 격리를 손으로 짜야 하는데,
이 시스템의 모든 격리는 RLS 가 한다. 게다가 "누가 언제 개입했나"가 제도 증빙이라 어차피 행이 남아야 한다.

**F. 푸시는 Expo Push.** 앱이 Expo SDK 54 managed 라 EAS 가 FCM/APNs 자격증명을 관리한다.
발송자는 트리거가 아니라 **`notifications` 행 소비자**로 둔다 — `app.notify_safety_event()` 가
이미 수신자 결정과 멱등 유니크를 갖고 있으므로 그 위에 얇게 얹는다.

**G. 직접(비중계) 모드 폐기.** 검열되지 않은 Gemini 오디오 경로가 코드에 살아있는 한 기준 2가
코드 레벨에서 거짓이다. 단계·원격 제어·안전 일시정지가 전부 서버 권위인데 직접 모드에는 서버가 없다.
⚠️ **앱 코드 삭제만으로는 닫히지 않는다.** `live-token` 은 요양보호사 JWT 와 활성 세션만 보고 Gemini 단기 토큰을
내준다. 중계도 **사용자 JWT 로** 같은 함수를 부르므로(`apps/voice-relay/src/main.ts:41`) 서버가 둘을 구분하지 못한다 —
구버전 앱이나 JWT 를 가진 누구든 토큰을 받아 중계를 건너뛸 수 있다. 그래서 `live-token` 을 **중계 전용**으로 잠근다(C4).

---

## 5. DB 파트

작업 순서 = 마이그레이션 파일 순서. 전부 append-only(기존 53개 파일 무수정).

> **진행 현황** — 마이그레이션은 **로컬 PG16 회귀로만 검증**하고 운영 DB 에는 아직 적용하지 않았다(사용자 결정 2026-09-24 — 적용은 한 건씩 별도).
> 파일럿 단언은 `supabase/tests/pilot_access.sql`(러너 `run-rls-regression.sh` 가 함께 실행).

| # | 파일 | 내용 | 상태 |
|---|---|---|---|
| **D1** | `..._org_role_add_values.sql` | `alter type org_role add value 'social_worker'/'center_director'` — ⚠️ **이 파일에 다른 DDL 금지**. 같은 트랜잭션에서 신규 enum 값을 쓸 수 없다 | ✅ 2026-09-24 로컬 — `20260924000000_org_role_add_values.sql` · ✅ 운영 적용(2026-09-24) |
| **D2** | `..._notification_kind_add_values.sql` | `session_paused`·`journal_ready`·`journal_failed`. D1과 같은 제약 | ⏳ |
| **D3** | `..._org_settings_capabilities.sql` | `org_settings`(facility_type·target_minutes·default_avoid_topics·default_program_type·default_location), `org_capability` enum, `org_capabilities`, 조직 생성 시드 트리거. 행이 없으면 기본집합으로 폴백(기존 조직 안전). **직원 합류(기관 초대 코드 + 승인)** 와 **역할 부여 RPC `public.set_member_role(target, role)`** — 아래 "직원 합류와 역할 부여" 참조 | ✅ 2026-09-24 로컬 — 설정·권한표·시드·`has_capability`·`set_member_role`(`20260924010000`) · 직원 합류 `org_invites`·`org_join_requests`·온보딩 `p_invite_code`·승인/거절/재요청/취소 RPC(`20260924020000`) · ✅ 운영 적용(2026-09-24). ⚠️ `is_care_team`·`has_capability` 헬퍼는 계획의 D4 가 아니라 여기서 만들었다 |
| **D4** | `..._org_scoped_rls.sql` | `app.is_care_team()`·`app.has_capability()` 신설. 9테이블 SELECT/UPDATE 술어를 `org_id = current_org_id() and is_care_team()` 로 교체. **보호자 브랜치는 복사해 무변경 유지**. DELETE 정책은 **교체하지 않는다**(배정·관리자 기준 유지 — 교대근무가 요구하는 것은 열람·기록이지 삭제가 아니다) | ✅ 2026-09-24 로컬 — `20260924030000_org_scoped_rls.sql`. 결정 ①: 대화 기록·연대기 INSERT 와 `can_process_profile`·`reserve_live_token` 도 돌봄팀(동의·보호자 공개 INSERT 는 배정 유지) · 결정 ②: 새 역할도 세션 진행 · restrictive UPDATE 4개 포함 · users 조회는 관리 역할까지. ⚠️ 발견·수정: `chronicle_entries` 에 (profile_id, org_id) 복합 FK 가 없어 배정 검사를 빼면 **타 기관 어르신에 기록**이 가능했다 → FK 추가 · ✅ 운영 적용(2026-09-24) |
| **D5** | `..._program_journals.sql` | `care_journals`·`journal_photos` DROP. `program_journals`·`program_journal_photos`·`program_journal_revisions`·`journal_generation_jobs` 신설 + 트리거 4종(확정 가드·이력·enqueue·공개 게이트). `care_grade` enum + `profiles.care_grade` 포함 | ✅ 운영 2026-09-24 — 웹 기존 일지 화면은 새 표로 이어 붙임(W1 전까지). 워커(C4)는 서버 파트 |
| **D6** | `..._session_phase_supervision.sql` | `session_phase` enum, `sessions` 컬럼 7개(phase·phase_started_at·paused_at/by·pause_reason·control_request·prompt_version), `session_interventions`, RPC `session_tick`/`advance_session_phase`/`request_session_control`. ⚠️ **목표 시간 컬럼은 새로 만들지 않는다** — `sessions.duration_minutes`(`20260822020000`, 5~120분, 웹 세션 설계의 "예상 소요 시간")가 이미 그 값이다. 비어 있으면 `org_settings.target_minutes` 로 폴백 | ✅ 2026-09-24 로컬 — `20260924040000_session_phase_supervision.sql`: 단계 intro→reminiscence→closing(뒤로 불가·마무리는 어디서든) · 새 컬럼은 **RPC 전용**(직접 쓰기 트리거 차단) · `session_tick`(허용·단계·경과·목표 시간 10분 상한·일시정지·종료 요청) · `advance_session_phase`(시작자만, prompt_version 저장) · `request_session_control`(돌봄팀) · 개입 기록 · 감독자당 동시 4대(최근 30분 시작분만 셈 — 좀비 방지) · ✅ 운영 적용(2026-09-24) |
| **D7** | `..._push_tokens.sql` | `push_tokens`(본인 only RLS), `notifications.pushed_at` | ✅ 로컬 2026-09-24 — 쓰기 RPC 전용(기기 인계). ✅ 운영 적용(2026-09-24) |
| **D8** | `20261006010000_product_events.sql` | `product_events(event_key, payload, ...)` + definer 삽입 함수 — 최소 범위: 일지 확인 대기 중 사람이 고친 칸 이름(`journal_draft_edited`)만. 열람 이력·화면 계측은 후속 | ✅ 2026-10-06 코드(T24.2) |
| **D9** | D5·D6 말미 | realtime publication 에 `program_journals`·`session_interventions` 추가. ⚠️ `if exists (pg_publication)` 가드 필수(CI는 순정 PG16) | ✅ 2026-09-24 — `session_interventions`(D6) · `program_journals`·`program_journal_photos`(D5) 운영 publication 반영 · data `realtime.ts` 세 곳 등록(일지 2종) |
| **D11** | `20260924080000_legal_consent_types.sql` · `20260924090000_legal_consent_requirements.sql` | (계획 외 · 법률 문서 확정본, 사용자 확정 2026-09-24) `consent_type` += `terms_required`·`elder_privacy_required`. 세션 처리에 어르신 개인정보 동의 필수 — **적용 시점 등록 어르신은 `app.elder_privacy_grandfathered` 로 이 항목만 면제**(증거는 만들지 않는다). 가입은 `terms_required` 를 받되 아직 필수 아님(배포 전환기 보호 — 웹 배포 뒤 필수화 후속) | ✅ 2026-09-24 **운영 적용** · 회귀 `supabase/tests/legal_consents.sql` · ⏳ `terms_required` DB 필수화 |
| **D10** | `20261006000000_consent_version_single_source.sql` | `public.current_consent_version()` 1개로 통일(`app.` 이 아닌 이유: 동의 트리거가 invoker · 운영 authenticated 에 `app` USAGE 없음) — SQL 3곳이 이 함수를 부르고, TS `CONSENT_VERSION` 은 data `consent-version.test.ts` 가 대조 | ✅ 2026-10-06 코드(T24.4) |

### 직원 합류와 역할 부여 (D3 · W6 · W9)

**직원 합류** — 기관 단위 열람으로 바꾸면 **합류 승인 = 기관 전체 기록 열람 권한**이 된다. 그래서 합류는
코드 소지만으로 열리면 안 되고(기존 F-36 원칙), 승인자도 좁혀야 한다.

- `org_invites`(org_id · code · 합류 후 역할 · 발급자 · 만료 시각 · 회수 시각) — 코드는 기존 `app.generate_invite_code()`
  (CSPRNG 10자) 재사용. 발급·회수는 `org_admin`·`center_director` 만. 합류 후 역할에 `guardian`·`org_admin` 은 넣지 않는다.
- 온보딩에서 요양보호사는 **초대 코드로 합류**한다(W9 — 처음 계획의 "새 기관 만들기(기관명)" 선택지는 2026-09-25 A안으로 삭제: 기관은
  운영자가 `app.provision_org` 로 만들고 첫 관리자는 운영자가 준 관리자 코드로 바로 들어온다). 직원 초대 코드로 가입하면
  `org_join_requests`(pending)만 생기고 **`users.org_id` 는 승인 전까지 NULL** 로 둔다 — "org_id 가 없으면 데이터 0건"이라는
  기존 불변식을 그대로 쓰므로 `is_care_team()` 에 멤버십 상태를 따로 넣지 않아도 된다.
- `approve_org_join(request_id)` — `org_admin`·`center_director` 만, **자기 요청 승인 불가**. 승인 시 `users.org_id`·역할을 설정한다.
  승인 화면에는 "승인하면 이 기관의 모든 어르신 기록을 볼 수 있습니다"를 명시한다.
- 기존 어르신 단위 배정(`claim_elder_by_code`·`approve_caregiver_assignment`)은 접근 게이트가 아니라
  "내 담당" 표시·알림 대상으로 의미가 줄어든다. 지우지 않는다.

**역할 부여** — 지금 역할을 바꾸는 길은 **온보딩 RPC 하나뿐**이다 — `20260908000000_users_privilege_hardening.sql`
이 `users.role` 직접 쓰기를 컬럼 권한·트리거·정책 3중으로 막았고, 온보딩은 요양보호사·보호자만
고를 수 있다. enum 에 `social_worker`·`center_director` 를 추가해도 **그 역할을 가질 방법이 없다.**
그대로 두면 기본 위임(사회복지사·센터장)만 켜진 기관에서 일지를 확정할 사람이 0명이 된다.

- `public.set_member_role(target_user_id, role)` — SECURITY DEFINER RPC, 3중 방어의 **신뢰된 우회로**.
  호출자는 같은 기관의 `org_admin`·`center_director` 만. **자기 자신은 바꿀 수 없다**(셀프 승격 차단 원칙 유지).
  보호자(`guardian`) ↔ 돌봄팀 역할 간 전환은 금지(보호자 격리가 역할 하나로 무너지지 않게).
  기관의 마지막 `org_admin` 은 강등 불가. 변경은 `audit_log` 에 남긴다.
- **권한 매트릭스 편집 자체는 위임 대상이 아니다** — `org_admin`·`center_director` 고정.
  편집권을 위임할 수 있으면 위임받은 사람이 스스로 모든 권한을 켤 수 있다.
- 3개 위임 항목의 기본 허용 = 사회복지사·센터장(기획서 예시) + `org_admin`.
  매트릭스를 고칠 수 있는 역할을 기본값에서 빼 봐야 스스로 켜면 그만이라 의미가 없다.
- RLS 회귀: 요양보호사가 호출 = 실패 · 자기 자신 대상 = 실패 · 타 기관 대상 = 실패 · 보호자 → 돌봄팀 = 실패.
  합류: 승인 전(pending) 열람 = 0건 · 자기 요청 승인 = 실패 · 만료·회수된 코드 = 거부 · 요양보호사의 초대 발급 = 실패 ·
  승인 후 같은 기관 전체 열람 = 성공.

### 자동 확정 차단을 DB 가 집행한다

`program_journals` BEFORE UPDATE 트리거에서 `status='final'` 전환 시 **`auth.uid() is null` 이면
예외**를 던진다. service_role 로 도는 워커는 `final` 을 **물리적으로 쓸 수 없다.**
이것이 기준 2의 DB 레벨 집행이다.

### `program_journals` 핵심 스키마

- 식별: `session_id`(unique, 미제공 일지는 null 허용)
- 상태: `generating | pending_review | final | failed`
- 공단 서식: `program_type`(기본 "인지활동 - 회상훈련") · `operated_from/to`(세션 시작·종료) ·
  `location` · **`facilitator_user_id`**(진행자 = 감독한 요양보호사. **AI 아님**) · `participants` ·
  `goal`(세션 설계 승계) · `activity_content` · `participant_response` ·
  **`opinion_collected`**(의견수렴 — 신규) · `overall_evaluation` · `next_plan` ·
  `tool_used`(기본 "AI 대화 프로그램 보조")
- 주간보호: `delivered` · `non_delivery_reason`(결석/컨디션난조/거부/기타)
- 보호자: `guardian_text` · `guardian_text_approved_by/at`
- 확정·생성: `finalized_by/at` · `draft_generated_at` · `generation_attempts` · `last_error`

⚠️ **주간보호 출석 테이블은 만들지 않는다**(기준 1 — ERP 영역). 제공 여부는 `program_journals`
행의 유무와 `delivered`/`non_delivery_reason` 으로만 표현한다. 이게 "제공 횟수"의 분모·분자를
동시에 준다.

---

## 6. 앱 파트 (`apps/mobile`)

> **진행 현황(2026-09-24)** — ✅ **앱 M1~M7 전부 완료**(M5 는 선행 D1~D6·C2·C3, M6 은 선행 D7 과 함께 — 마이그레이션은 로컬 검증 후 ✅ 운영 적용(2026-09-24)). 푸시 **발송**(C4 `push-dispatch`)·중계 T21.4 는 서버 파트.
> 상세 기록은 git 이력(2026-09-24 앱 파트 커밋 · 루트 `AGENTS.md` 는 2026-09-28 에 현행 규칙만 남기고 압축했다).

| # | 내용 | 파일 | 상태 |
|---|---|---|---|
| **M1** | **직접 모드 제거** — `RELAY_MODE` 분기·직접 UI 전체 삭제. `EXPO_PUBLIC_VOICE_RELAY_URL` 미설정 시 세션 시작 차단 | `app/session/talk.tsx`, `src/store/appStore.ts` | ✅ 2026-09-24 — 중계 전용 엔진·클라이언트, `/session/loading`·기기 TTS 삭제, 시작 화면에서 주소 검증. RN `URL` 이 `wss` 경로를 못 읽던 검사도 수정. ✅ 2026-10-16 발화 종료/전사 교착 수정·실 API 검증. ⏳ 새 APK 실기기 입력/응답 검증 |
| **M2** | **어르신 표시 모드 분리** — `talk.tsx`(요양보호사) + `app/session/elder.tsx`(표시 전용) 신설, 공용 로직은 `src/features/session/` 으로 추출 | 신규 + 기존 | ✅ 2026-09-24 — ⚠️ 별도 라우트 대신 **`talk.tsx` 안의 표시 모드 전환**(컨트롤러 수명 분리 방지). 화면 `src/features/session/ElderView.tsx`. "시작"과 동시에 전환 |
| **M3** | 어르신 화면에서 **반드시 제거**: 위기 배너 전화번호(`talk.tsx:377-389`) · STT 수정 패널(`:570-648`) · 중계 컨트롤(`:433-466`) · 확인 없이 종료하는 X(`:371`). ⚠️ 위기 안내(전화번호·사람 연결)는 **없애는 게 아니라 옮긴다** — 요양보호사 모드와 감독 화면(W2)의 위기 카드로. 어르신 화면에서만 빠진다 | `talk.tsx` | ✅ 2026-09-24 — `check:figma` 부재 규칙으로 고정 |
| **M4** | 복귀 게이트 — 숨김 제스처(4모서리 순차 탭) 또는 PIN(`expo-secure-store`) | `elder.tsx` | ✅ 2026-09-24 — **PIN**(4자리, 요양보호사별, 서버 미전송, 5회 실패 30초 잠금). 진입은 어르신 화면의 작은 '선생님' 버튼. 설정 화면에서 변경 |
| **M5** | 원격 제어 수신 — `{relayControl:{state:'paused'}}` → "잠시 쉬어요" 화면 + 마이크 중단 | `src/features/session/` | ✅ 2026-09-24 — 원격 정지 중 현장 재개 불가(사용자 확정), 서버 재개는 2초 폴로 자동 반영 |
| **M6** | 푸시 토큰 등록 — `expo-notifications` 권한 → `getExpoPushTokenAsync()` → `push_tokens` upsert. 로그아웃 시 `revoked_at`. ⚠️ `app.json` 플러그인 추가 → **EAS 재빌드 필요** | 신규 | ✅ 2026-09-24 · ✅ 2026-10-11 T27.1 개발 빌드·FCM 파일 연결 준비. ✅ 2026-10-12 Android 빌드·설치 명령·네이티브 전용 플랫폼·Windows 경로 보정, 로컬 에뮬레이터 개발 APK 빌드·설치 확인. ⏳ FCM/APNs 등록·EAS 재빌드·T25.16 실기기 검증. 발송(C4 push-dispatch)은 서버 파트 |
| **M7** | `persistWholeSession`(폴백) 저장 순서를 `finalizeSession` 과 맞춘다(세션 생성 → 턴·분석 → `ended`). 워커 첫 시도 성공률이 오른다 | `src/data/session-persistence.ts` | ✅ 2026-09-24 — `active` → 턴 → 분석 → 이벤트 → `ended` |

**기기 1대 = 세션 1개는 이미 보장된다** — 중계 `main.ts` 의 `inUse` Set 이 `SESSION_BUSY` 로
막는다. 여러 기기 병렬은 각기 다른 `session_id` 라 그대로 동작한다.

**요양보호사 1명당 동시 4대(사용자 확정 2026-09-24)** — 한 요양보호사가 시작·감독하는 `active` 세션이 4개면 5번째 시작을 막는다.
판정은 DB 가 한다(세션을 `active` 로 바꾸는 순간 같은 감독자의 `active` 수를 센다 — D6). 앱은 이유를 보여 주기만 한다.
같은 이유로 `live-token` 한도(`app.live_token_limits` 사용자 분당 3 · 일 20)를 올린다 — 분당 한도는 4대를 연달아 시작할 수 있게
**4 이상**, 일 한도는 운영 시간으로 다시 계산한다(예: 4대를 하루 3시간 돌리면 10분 세션만 72회 + 재연결).

고령 사용자 기준(큰 글씨·고대비·큰 터치 영역, 핵심 흐름 3단계 이내, 텍스트 입력 최소화 — 선택형·버튼형 우선,
첫 사용 시 따라 하기 튜토리얼 1회)은 M2 재작성 때 함께 적용한다. **검증 기준**: 기술에 익숙하지 않은 50~60대가 설명 없이 세션 1회를
끝까지 진행할 수 있는지.

---

## 7. 웹 파트 (`apps/web`)

> ⚠️ **디자인 선행 조건** — 웹의 디자인 기준은 Figma 단독이고 임의 재디자인은 금지다([`apps/web/AGENTS.md`](../../apps/web/AGENTS.md) §1).
> 그런데 W1(일지 상세의 공단 서식 폼)·W2(감독 화면)·W6(권한 매트릭스·역할·초대)·W7(동의)·W9(합류 온보딩)은 **시안이 없다** —
> Figma 에는 요양일지 화면(`205:1039`·`221:283` 등)만 있다. 앱의 어르신 표시 모드(M2)도 모바일 시안(`nLfWkg2H7dFfDH1pehcH5I`)에 없다.
> ✅ **결정(2026-09-24)**: 기존 선례("시안에 없는 화면 — 끊긴 흐름을 잇는 최소 구현", 런북 `figma-web-extraction.md`)처럼
> **기존 디자인과 최대한 같은** 카드·모달·폰트·색·간격으로 만들고, 시안이 오면 그 화면만 교체한다. 새 시각 요소를 지어내지 않는다.

| # | 내용 | 파일 | 상태 |
|---|---|---|---|
| **W1** | **프로그램 일지 화면** — 목록(상태 칩 · "확인 대기 N건" 최상단) + 상세(공단 서식 12필드 폼, AI 초안 배지, 확정 버튼은 `has_capability` 일 때만) + **확정 후 수정 시 사유 입력 필수** + 이력 탭 + 생성 실패 재시도 · 기존 수동 경로 `components/SessionJournalDialog.tsx`(세션 선택 → `session-report` → `renderSessionJournal`)는 기획 6-1 의 "현재"다 — **다이얼로그는 지운다.** ✅ 2026-09-25 사용자 확정: **"초안 생성" 버튼은 두지 않는다**(초안은 대화 종료 시 C4 워커가 자동 생성). "다시 생성"은 **`failed` 일지에만** 보이는 복구 버튼으로 `retry_journal_generation` RPC 를 부른다(`session-report` 아님) | `pages/caregiver/ProgramJournal{List,Detail}Page.tsx`(기존 `Journal*Page.tsx` 대체) | ✅ 2026-09-26 웹 — 목록은 기존 2단계(어르신 고르기 → 어르신별 목록, 각 최상단 "확인 대기 N건") · 상세 `ProgramJournalDetailPage`(작성 카드 체계 · 12칸 · 보호자 문장 승인 · 확정 · 수정 사유 · 이력 탭 · 실패만 다시 생성) · `JournalWritePage`·`SessionJournalDialog`·`buildJournalDraft`·웹 음성 입력 삭제. 계획과 다른 점: 파일명은 목록 `ProgramJournalListPage`·상세 `ProgramJournalDetailPage`, 어르신 고르기는 `JournalPage` 유지 · 'AI 초안'은 칸별 출처가 DB 에 없어 워커 4칸에 표시 |
| **W2** | **감독 화면** — 기관 내 `status='active'` 세션 카드(어르신·기기·경과·**현재 단계**·상태) + 일시정지/재개/종료. **반응형 우선**(요양보호사 휴대폰 브라우저). 위기 발화 카드에 위기 안내(전화번호·대응 절차)를 둔다 — 어르신 화면에서 옮겨 온 것(M3) | `pages/caregiver/SupervisionPage.tsx` 신규 | ✅ 2026-09-25 웹(PR #18) — `/caregiver/supervision`(1440 셸 밖 반응형 단독 화면, 사이드바 맨 끝 '감독') · 기관의 진행 중 세션 카드(어르신·시작한 사람·단계·경과/목표·상태) · 원격 일시정지(선택 사유)·재개·종료(확인창 — 저장은 기기에서) · 위기 카드(서버 `caregiver_alert` 그대로 + 확인) · 개입 기록 3건 · Realtime `session_interventions` 등록. 계획과 다른 점: 세션에 기기 정보가 없어 '기기' 대신 '시작한 사람'. ⚠️ 위기 카드는 T21.4(중계 즉시 기록) 전에는 세션 종료 뒤에야 뜬다 — ✅ T21.4 코드 완료(2026-09-27), **중계 배포 후** 감지 즉시 뜬다 |
| **W3** | 네비게이션 — 요양보호사 `요양일지`→`프로그램 일지`, **보호자** `분석`→`대화 관찰 리포트`(기획 6-5 는 보호자 메뉴 한정 — 요양보호사 `분석` 은 기관 내부 화면이라 이름 유지), 보호자 소식 필터 `요양일지`→`오늘의 이야기` | `components/shell/nav.ts` | ✅ 2026-09-27 — 요양보호사 '프로그램 일지'(09-26) · 보호자 소식 '오늘의 이야기' · 보호자 메뉴 '관찰 리포트'(사이드바 폭 — 화면에서는 '대화 관찰 리포트') |
| **W4** | **보호자 표현 전환** — 판정형→기술형, 하단 고정 문구 공용 컴포넌트, 일지 상세는 **`guardian_text` 만** 렌더(공단 서식 직접 노출 금지). 함께: `session_summary` 가 생성돼도 렌더되지 않는 기존 버그 수정, 죽은 `'report'` item_type 정리 | `pages/guardian/*` | ✅ 2026-09-27 — 보호자 종합은 판정형 카드2 를 그리지 않음 · 고정 문구 공용 부품 · 일지 상세 `guardian_text` 만(기존) · `session_summary` 는 요약 전용 RPC `get_my_shared_summaries`(`20260927000000`, 운영 적용) · 죽은 `'report'` 화면 코드 삭제 |
| **W5** | 세션 설계의 기존 "예상 소요 시간"(`duration_minutes`)을 **목표 시간**으로 쓴다 — 초기값을 지금의 고정 15분 대신 `org_settings.target_minutes` 에서 가져온다. 단계 미리보기·기관 기본 피할 주제 | `SessionPlanDialog.tsx` | ✅ 2026-09-27 — 라벨 '목표 시간' · 5~10분 · 기본값=기관 설정 · 단계 미리보기(core `phasePlan`) · 새 세션 피해갈 내용에 기관 기본값 미리 채움(서버 합침 없음) · 10분 초과 기존 설계는 10분으로 표시 |
| **W6** | 기관 설정 + **권한 매트릭스 UI**(일지 확정·공개 철회·보호자 연결 승인 × 역할 체크박스) + **구성원 역할 지정**(`set_member_role` — 지금 구성원 표는 역할을 보여주기만 한다) + **직원 초대 코드 발급·회수 · 합류 승인** | `pages/caregiver/OrgPage.tsx` | ✅ 2026-09-26 — **현행**: 기관 관리(`OrgPage.tsx`)에 기관 설정(AI 스위치는 읽기만) · 권한 위임 표(일지 확정·공개 철회·보호자 연결 승인 × 역할, 저장 버튼) · 구성원 역할 지정(행 드롭다운 + 확인창) · 직원 초대 코드(합류 후 역할·유효 기간·복사·회수) · 합류 요청 승인/거절(승인 전 "기관의 모든 어르신 기록을 볼 수 있습니다" 확인창). 관리 역할 = 관리자+센터장(`isOrgManagerRole`), 그 밖의 역할은 읽기 전용. 권한 표는 DB 가 강제(T25.4). <br>**이력**: 2026-09-24 DB 준비(`set_member_role`·`create_org_invite`/`revoke_org_invite`·`approve_org_join`/`reject_org_join`·`org_settings`·`org_capabilities`) → 2026-09-25 초대·합류 승인·관리 역할 인식(T22.4 웹 발견분 — 센터장 누락 `isAdmin`·역할 라벨·TopBar 호칭 — 정리, 기존 "기관 합류" 라벨은 "담당 요청"으로) → 2026-09-26 역할 지정·권한 표·기관 설정 |
| **W7** | ⚠️ **어르신 동의 부여/철회 UI** — 지금 `ElderDetailPage.tsx:434` 가 없는 라우트를 가리킨다. **파일럿 블로커** | 신규 라우트 | ✅ 2026-09-24 — 코드 `jinwoo` 브랜치(PR #17, main 병합 대기) · DB `20260924080000`·`090000` 운영 적용. `ElderConsentsPage`(부여·철회·이력) + 등록 시 동의 단계. 계획과 다른 점: 법률 문서 확정본에 맞춰 **필수 동의 4종**(어르신 개인정보 추가)·계정 **이용약관 동의** 추가 — 아래 D11 |
| **W8** | 어르신 `care_grade` 드롭다운(주간보호 필수) | 등록·수정 화면 | ✅ 2026-09-27 — 등록·수정 사진 오른쪽 칸(`CareGradeSelect`) · 주간보호(`facility_type='day_care'`)면 등급 없이 저장 막음 · 상세 프로필 카드 넷째 줄 표시(주간보호 미입력 경고) |
| **W9** | ⚠️ **온보딩 합류 경로** — 요양보호사는 **초대 코드로만** 가입한다(기관명 입력·새 기관 만들기 없음 — 2026-09-25 A안: 기관은 운영자가 `app.provision_org` 로 만든다). 직원 초대 코드로 가입하면 승인 전까지 "승인 대기" 화면만 보인다. **파일럿 블로커**(§3 ⑧) | `pages/public/OnboardingPage.tsx` | ✅ 2026-09-25 — **현행**: 온보딩 '초대 코드로 합류하기'(Figma 좌표 불변) — 운영자 관리자 코드면 바로 그 기관의 관리자, 직원 초대 코드면 `/join-pending` 승인 대기(상태·재요청·취소·15초 재확인) · `routeForUser`·`CaregiverGuard` 가 기관 없는 가입 계정을 대기 화면으로 보낸다 · 요청자는 기관 이름을 못 읽으므로(RLS) 표시하지 않는다. 코드 없이·기관명으로 가입하면 `ORG_INVITE_REQUIRED`. <br>**이력**: 2026-09-24 DB 준비(`complete_onboarding(..., p_invite_code)` · `request_org_join` · `cancel_org_join`) — 당시 웹은 요양보호사에게 기관명을 필수로 요구했고 합류 대기자를 /caregiver(빈 화면)로 보냈다 → 2026-09-25 위 현행으로. 같은 날 A안으로 "새 기관 만들기" 경로를 DB·웹에서 삭제 |

**카피 동반 개정** — ⛔ **2026-09-25 변경: 법률 문서는 변호사 검토본이라 코드로 고치지 않는다**(사용자 확정). 아래 두 항목은 법무 검토 문서 갱신으로 요청한다. 원래 계획: 처리방침(`pages/public/LegalPages.tsx`) 1항의 "세션·요양일지·보호자 공개 관리"·"기관과 담당 어르신 연결"은
W1·D4 와 함께 고친다(요양일지 → 프로그램 일지, 기관 전체 열람). Expo Push 는 새 국외 처리자라 위탁·국외이전 고지에 넣는다
([`compliance.md`](../compliance.md) 2026-09-23 절).

### 보호자 표현 규칙 (W4)

| 금지 | 허용 |
|---|---|
| "인지 기능 저하 의심", 점수·등급 | "이번 달 대화 시간 추이", "고향·가족 이름을 말씀하심" |
| "우울 경향", "정서 불안" | "긍정 표현이 많았던 주제 Top 3", "웃음이 나온 순간" |
| "병원 진료 권장" | 보호자용에는 넣지 않음. 기관 내부 플래그로만 |

모든 리포트 하단에 고정: **"본 리포트는 대화 기록 요약이며 진단·평가 목적이 아닙니다."**

---

## 8. 웹·앱 연동 파트

**C1. `packages/core` 정리** — ✅ **2026-09-24 완료**(단 `buildJournalDraft` 는 웹 `JournalWritePage` 가 아직 써서 W1 때 삭제 ·
웹 `lib/ai.ts` 는 `export *` shim 이라 영향 없어 그대로). 세션은 빈 기록으로 시작하고 중계 첫 인사가 출력 가드를 통과해야 첫 AI 턴이 된다(`acceptOpener`).
원래 내용: `ai.ts` + `ai.test.ts` **파일 삭제**, `voice-flow.ts`(호출처 0) 삭제,
`journal.ts` 의 `buildJournalDraft`(명시적 mock) 삭제, 웹의 `apps/web/src/lib/ai.ts`(`@giokon/core` 재수출 shim, importer 0) 삭제. `conversation.ts` 의 `respondToUserTurn` →
**`evaluateUserTurn()` 으로 축소**(안전 계산만, `generateReply` 호출 제거).
**절대 유지**: `safety.ts` 전체(`assessUtterance`·`screenAiUtterance`·`buildCaregiverAlert`·
`buildSafetyEventDraft`·`assessEngagement`), `analysis.ts` 의 `detectTurnTopic`·`recommendNextTopics`.
⚠️ `assessEngagement`·`detectTurnTopic` 은 **분석·화면에서도 쓴다** — 대화에서 떼어내도 함수는 남는다.

**C2. `packages/core` 신규·확장**
- `session-phase.ts`(신규): `buildPhaseDirective(phase)`, `shouldAdvancePhase(...)` — 순수 함수, 중계와 공유
  ✅ 2026-09-24 — 도입은 첫 대답 또는 60초 뒤 회상으로 · 회상은 목표 시간(10분 상한) − 90초에 마무리로(짧은 목표에서도 회상 최소 절반) ·
  마무리 지시는 시간/휴식 요청 두 가지(T21.11 대비). `PROMPT_VERSION='v2.0'` + 시스템 프롬프트에 단계·"(내부 지시)" 규칙.
  ⚠️ `buildSystemPrompt(..., phase?)` 인자는 만들지 않았다 — 현재 단계는 연결 직후 지시문 주입으로 전달된다(중복 방지).
- `program-journal.ts`(신규): `mapAnalysisToJournalFields()`, `screenJournalDraft()`(진단표현 결정론
  차단 — 적중한 **필드만 비우고** `pending_review` 로 넘긴다. 전체 실패가 아니다), `buildGuardianText()`
- `generated-session.ts` **확장**: 스키마에 공단 필드·보호자 문장 추가, `disallowedConclusion` 에
  `인지 저하`·`우울`·`정서 불안`·`병원 진료 권장` 추가, 지시문 보강
- `prompt.ts`: `buildSystemPrompt(..., phase?)`, **`PROMPT_VERSION='v2.0'` 을
  `sessions.prompt_version` 에 persist**(지금은 선언만 되고 아무도 읽지 않는다).
  ~~`RESPONSE_JSON_SCHEMA` 삭제(직접 모드 폐기로 사문화)~~ ✅ 2026-09-24 삭제(C1 과 함께)
- `analysis.ts`: `opinionSignals?`·`baselineDeltas?` 추가 — 파일럿 범위 밖이지만 **데이터는 지금부터**

**C3. `apps/voice-relay`**
> ✅ **2026-09-24 1차 완료(T21.3)** — `session_tick` 폴·단계 지시 주입(턴 사이에만)·원격 일시정지/종료(`relayControl` → 2초 뒤 닫기). ✅ `safety_events` 즉시 INSERT(T21.4, 2026-09-27 — 중계 배포 후 반영). ~~휴식 요청 → 마무리 전환(T21.11)~~ ✅ 2026-10-04(고정 인사 한 문장 → 재생 뒤 종료 · `elder_closing` 기록), ~~수명 10분(T21.12)~~ ✅ 2026-10-04(서버 경과 시간 · 진행 중 AI 발화 최대 30초), ~~DB 기준 세션 점유(T26.1)~~ ✅ 2026-10-03 코드(`voice_session_leases` · DB 운영 적용 승인 대기). 배포 순서 = DB 마이그레이션 → 중계. 호스팅 = Cloud Run 서울(2026-10-01 확정 — 운영 런북 "호스팅").
- 2초 폴을 **`session_tick` RPC 로 교체** → `{allowed, phase, target_minutes, paused, control_request}` 일괄 수신(`target_minutes` 는 `coalesce(sessions.duration_minutes, org_settings.target_minutes)` 로 계산한 값이지 컬럼이 아니다)
- 단계 전환 시 `forward({clientContent:{turns, turnComplete:false}})` 로 지시 주입 —
  **`resumeContext` 주입과 완전히 같은 경로**다. 어르신에게 들리지 않고, 출력은 여전히 서버 검증 후 Gemini TTS를 통과한다
- `control_request` 처리: `pause`→입력 forward 차단 + `relayControl` 송신, `end`→`close()`
- ⚠️ **`assessUtterance` 적중 시 `safety_events` 즉시 INSERT 추가** — 안전 푸시의 선결 조건
- 타이머·턴 캡·수명·재생 영수증 게이팅은 **손대지 않는다**

**C4. Edge Functions**
- `session-report/handler.ts` 의 생성 로직을 `_shared/report-generation.ts` 로 추출(양쪽 공유)
- ✅ 2026-09-25 **`REPORT_ALLOWED_USER_IDS` 데모 허용목록 폐기 → 기관 AI 스위치**(`org_settings.ai_drafts_enabled`, 기본 꺼짐, 운영자만 켬)
- ⚠️ **`live-token` 중계 전용화** — 중계만 가진 자격(서버 시크릿 공유 비밀 헤더 등)을 사용자 JWT 에 **더해** 요구하고,
  없으면 403. 앱의 직접 호출 코드는 M1 에서 지운다. 배포 순서: 중계에 비밀 설정 → `live-token` 배포 → 비중계 호출 403 확인.
  이것이 들어가야 "검열되지 않은 AI 음성이 어르신에게 가는 경로가 없다"가 서버에서 참이 된다
  ✅ 2026-10-02 코드 — 공유 시크릿 `VOICE_RELAY_SECRET`(32자 이상) → 중계가 `x-relay-secret` 헤더로 보냄 · `live-token` 은 JWT·DB 한도 검사 **전에** 확인해 없거나 틀리면 403(한도 소모 없음) · 시크릿 미설정·짧으면 발급 안 함(500) · ⏳ 배포(중계 먼저 → `live-token`). 새 발급만 막는다 — 이미 나간 토큰(최대 30분)은 못 끊는다
- ✅ 2026-09-25 `program-journal-draft/`(신규): 큐 소비 → 지수 백오프(30s→5m) → `attempts>5` 면 `failed`. pg_cron 30초 + pg_net, DB 비밀값 인증.
  **사용자 확정: 대화가 끝나면 자동 생성 — 웹에 "초안 생성" 버튼을 두지 않는다. "다시 생성"은 failed 일지 복구 전용**(W1).
  **`pending_review` 까지만 쓴다**
- ✅ 2026-09-27 `push-dispatch/`(신규): `pushed_at is null` 소비 → Expo Push. pg_cron 10초 · 최대 한 번 · 30분 지난 알림 제외 · 무효 토큰 회수.
  안전 알림 수신자 = 담당 배정자 ∪ **세션 진행자**(사용자 결정 2026-09-27 — 배정 없는 어르신도 진행자는 받는다).
  ⚠️ **본문에 어르신 성함·발화 금지**(잠금화면 노출) — 고정 문구 + deep link 만
- 스케줄 30초. 두 워커를 한 함수에 합쳐도 무방

**C5. `packages/data`**
- `journals.ts`·`journalPhotos.ts` → `programJournals.ts` 등으로 교체 +
  `useFinalizeProgramJournal`·`useRetryJournalDraft`·`useJournalRevisions`·`useApproveGuardianText`
- 신규: `supervision.ts` · `orgSettings.ts`(`useHasCapability` = UI 활성화의 단일 근거) ·
  `pushTokens.ts` · `events.ts`
- `analyses.ts` 의 `useUpsertSessionAnalysis` **삭제**(현재 dead code)
- `realtime.ts`: `RealtimeTable`·`DEFAULT_TABLES`·`invalidateFor` **세 곳 모두**에 신규 테이블 등록.
  ⚠️ publication 에만 넣으면 아무도 듣지 않는다(2026-09-04 에 이미 겪은 함정)

---

## 9. 대화 정책 (6-3)

대화 통제를 코드 분기가 아니라 **대화 정책**으로 정의하고 세션 설정·시스템 지시로 AI 에 주입한다.

1. **세션 구조(단계형)** — 도입(인사·컨디션 확인) → 회상(설계된 주제) → 마무리·의견수렴
   ("오늘 이야기 어떠셨어요?" → `opinion_collected`). 목표 시간(세션 설계 · 기관 설정, **최대 10분**)이 되면
   마무리로 넘어가도록 지시한다. **현재 단계는 서버가 상태로 관리하고 AI 지시에 반영한다** —
   AI 자율 판단에 맡기지 않는다.
2. **주제 정책** — 설계 주제 목록, 피할 주제 목록(예: 사별한 배우자), 반복 회피
3. **대화 스타일** — 짧은 문장, 한 번에 질문 하나, 응답이 짧거나 침묵하면 쉬운 질문(예·아니오·선택형),
   재촉 금지
4. **위기 대응** — ⚠️ **현재 동작(결정론 감지 시 즉시 연결 종료)을 약화시키지 않는다.**
   `close` 를 유지하고 `paused_at` 기록 + `safety_events` 즉시 기록 + 감독 화면·푸시 알림으로
   **확장**한다. AI 판단을 최종 근거로 삼지 않는다
5. **종료 정책** — "그만할래", "힘들어" 같은 말이 나오면 마무리 단계로 넘어가 짧게 끝내고 감독 화면에 알린다
   ⚠️ **지금 중계는 이 말들에 즉시 연결을 끊는다** — `relay.ts:123-127` 이 위기(`escalate`)뿐 아니라 급성 고통 신호("너무 힘들어"·
   "못 견디겠어")·휴식 요청("그만할래")·거부("듣기 싫어")에도 `INPUT_REVIEW_REQUIRED` 를 보내고 닫는다. 종료 정책대로 하려면
   **휴식 요청·거부만** "마무리 단계 전환(짧은 인사 한 문장, 의견수렴 생략) + 감독 화면 알림"으로 바꾸고, **위기·급성 고통은 즉시
   종료를 유지**한다 — ✅ **사용자 확정(2026-09-24)**. 단계 체계(D6·C3)가 들어온 뒤 구현한다(tasks T21.11).
6. **시간 상한** — ✅ 세션 1회 **최대 10분**(사용자 확정). 중계의 연결 수명(지금 25분, `relay.ts:40`)을 10분으로 줄이고 **서버 고정값**으로 둔다
   (기관 설정으로 늘릴 수 없다). 마무리·의견수렴이 잘리지 않도록 마무리 단계 진입 시점은 10분 안에서 정한다. 세션 설계의 목표 시간
   선택지(지금 10·15·20·30·40분)도 10분을 넘지 않게 바꾼다.

| 기관·세션별 변경 가능 (`org_settings`) | 고정 (코드 상수) |
|---|---|
| `target_minutes`(세션별 `duration_minutes` 가 우선), `default_avoid_topics`, `facility_type`, `default_program_type`, `default_location` | `safety.ts` CRISIS_*, `screenAiUtterance`, 출력 200자 제한, 진단표현 금칙어, 턴 캡, 세션 수명(**최대 10분**) |

**DB 설정으로 안전 가드를 끌 수 있으면 안 된다.**

---

## 10. 순서 의존

```
D1·D2(enum 단독) → D3 → D4(RLS) ──→ W2 감독목록 · W6 권한UI
                 └→ D5 ──→ C4 워커 ──→ W1 일지화면
                 └→ D6 ──→ C3 중계 ──→ W2 원격제어 · M5 앱수신
                 └→ D7 ──→ C4 push ──→ M6 토큰등록
                 └→ D8 product_events ──→ 전 화면 계측(1주차)

C1(core 삭제) ⟷ M1·M2   ← 반드시 같은 PR. core 만 먼저 머지하면 앱이 깨진다
M7(저장 순서) → C4 워커 첫 시도 성공률
W7(동의 UI) → 파일럿 개시 전 블로커
디자인 경로 결정(§13) → W1·W2·W6·W7·W9 · M2 화면 착수
D3(직원 합류) → W9 온보딩 · W6 합류 승인 → 파일럿 개시 전 블로커
```

**권장 머지 단위 5개**: ① D1~D4 + RLS 회귀 + 직원 합류(W9·W6 일부) ② D5 + C4(draft) + W1 ③ D6 + C3 + W2 + M5
④ C1 + M1~M4 + `live-token` 중계 전용화(C4) ⑤ D7 + C4(push) + M6. **①이 나머지 전부의 선행.**

---

## 11. 착수 전 처리해야 할 것

### 블로커
1. **`alter type ... add value` 트랜잭션 제약** — D1·D2를 단독 파일로. 합치면 CI 가 실패한다.
2. ~~**`REPORT_ALLOWED_USER_IDS` 데모 허용목록**(`session-report/index.ts:19`) — 교체하지 않으면
   파일럿 전원 403.~~ ✅ 2026-09-25 기관 AI 스위치로 교체(C4).
3. **`safety_events` 가 세션 종료 시 일괄 기록된다** — 실시간 안전 푸시가 구조적으로 불가능하다.
   중계 즉시 기록(C3)이 선결.
4. **어르신 동의 철회 UI 부재**(W7) — AI 진행 프로그램이 제품 본체가 되는데 철회 경로가 화면에 없다.
5. **직원이 같은 기관에 합류할 경로 부재**(§3 ⑧ · D3 · W9) — 가입하는 요양보호사마다 새 기관이 생긴다.
6. **`live-token` 이 중계가 아닌 호출자에게도 Gemini 토큰을 준다**(§4 G · C4) — 앱 코드를 지워도 구버전 앱·JWT 소지자는
   중계를 건너뛴다. 중계 전용화 전에는 기준 2가 서버에서 거짓이다.

### 주의
7. 기관 전체 열람 ↔ 개인정보 최소수집 충돌 — `product_events.profile_viewed` 로 열람 이력을 남겨 보완.
8. **`= 'caregiver'` 비교 잔존** — `<> 'guardian'` 은 새 역할을 자동 포함하지만 `= 'caregiver'` 는
   자동 제외한다. SQL·TS 전면 grep 후 `is_care_team()` 으로 치환.
9. `check:copy` 비의료 린트 ↔ 공단 서식 문구 충돌 가능 — W1 착수 전 사전 검증.
10. `pnpm install --prefer-offline` 이 `apps/voice-relay/node_modules` 를 만들지 않는다 —
   `pnpm install --filter @giokon/voice-relay` 선행.
11. **새 역할을 부여할 경로가 없다** — `users.role` 은 3중으로 잠겨 있고 온보딩은 요양보호사·보호자만 고른다.
   `set_member_role` RPC(D3)·역할 지정 UI(W6) 없이 D1 만 넣으면 사회복지사·센터장은 영원히 0명이다.

### 안전 아키텍처를 약화시키지 말 것
12. **공단 일지의 진행자 칸에 AI 를 쓸 수 없다.** `facilitator_user_id` 를 확정 시 NOT NULL 로
   강제하고 `tool_used`("AI 대화 프로그램 보조")를 별도 필드로 둔다.
13. **위기 시 즉시 `close` 를 `paused` 로 약화시키지 말 것**(§9-4).
14. **위임 대상은 3개뿐**(일지 확정·공개 철회·보호자 연결 승인). 위기 대응·출력 검열·진단표현 금지·
    Gemini TTS 경유를 `org_capabilities` 에 넣는 순간 안전 구조가 설정 한 줄로 무력화된다.
15. 주간보호 출석 테이블을 만들지 말 것(기준 1).

---

## 12. 검증

### 게이트 (매 머지 단위마다 전부)
```
pnpm install --filter @giokon/voice-relay   # 선행 필수
pnpm -r typecheck && pnpm -r lint && pnpm -r test
pnpm check:bom && pnpm check:font && pnpm check:figma && pnpm check:copy
bash supabase/tests/run-rls-regression.sh   # PG16 실기동, 마이그레이션 전부 적용
```

### RLS 회귀에 추가할 단언 (권한 전환의 유일한 실증 게이트)
- 같은 기관 **다른 담당자**의 세션 기록 열람 = 성공(교대근무 요구)
- 타 기관 0건 · guardian 0건 · `social_worker`/`center_director` 역할 동작
- 위임 on/off 에 따른 일지 확정 성공/실패
- **service_role 로 `status='final'` 시도 = 실패**(기준 2)
- `guardian_text_approved_at` 없이 공개 시도 = 실패
- 확정 후 수정 시 revision 행 자동 생성
- `set_member_role`: 요양보호사 호출·자기 자신 대상·타 기관 대상·보호자↔돌봄팀 전환 = 전부 실패
- 직원 합류: 승인 전 0건 · 자기 요청 승인 실패 · 만료·회수 코드 거부 · 승인 후 기관 전체 열람

### 기준 2 전용 테스트
"AI 산출물이 사람 확인 없이 공식 기록이 되거나 보호자에게 가는 경로가 없다"를
**DB·워커·UI 세 층에서 각각** 단언한다.
같은 원칙의 음성 쪽: **요양보호사 JWT 만으로 `live-token` 호출 = 403**(중계 자격이 있어야만 발급).

### 수동 E2E (파일럿 개시 전)
두 브라우저에서 한쪽 일시정지 → 다른 쪽 2초 내 반영 · 세션 종료 → 초안 자동 생성 → 확인 대기 ·
확정 → 공개 → 보호자 화면 확인 · 철회 → 즉시 닫힘.

---

## 13. 기획이 정해 줘야 개발이 확정되는 것

- 공단 질의: "요양보호사 계획 + AI 진행 + 1인 병렬 감독"이 프로그램 제공으로 인정되는가 (영향: 전체 구조, 특히 감독 화면)
- 개인정보 국외 이전·법정대리인 동의 법률 검토 (영향: 동의 문구·버전)
- 관찰 리포트의 의료기기 규제 경계 — 식약처 가이드라인 (영향: 보호자 리포트·플래그)
- 고령자 발화 인식률 Gemini vs 다른 STT(Whisper·Qwen 등) 비교 — CLOVA 는 2026-10-04 키·코드 삭제 (영향: 전사 출처 구조)
- Gemini Live 동시 세션 한도·요금 (영향: 기기 수 확장)
- 카카오 알림톡 템플릿 심사 — **리드타임이 기니 일찍 착수** (영향: 파일럿 이후 보호자 알림)

✅ 2026-09-24 사용자 확정으로 닫힌 항목: 신규 화면 디자인 경로 · 종료 정책 범위 · 기기·계정 운영(10분 · 동시 4대) · 태블릿 지원 — §2 표.

### ✅ 2026-09-28 — 웹 디자인 수정사항 반영
- 사용자 제공 `디자인 수정사항.txt`: 보호자 날짜 필터·연결 어르신 선택·화살표 정렬, 가입 하단 로그인 링크, 읽은 알림 숨김·긴 텍스트 말줄임을 구현했다.
- 웹 전체 선택 메뉴를 공통 `Select`로 통일했다. 기간 선택은 `PeriodSelect`, 세션/보호자 날짜 필터는 `DateFilter`를 공유한다. 사용자 요청으로 달라진 정렬은 Figma 검사에 사유를 기록했다.
- 검증: `pnpm -F @giokon/web test:design-feedback` 및 `test:org`·`test:plan`·`test:grade` 통과. 운영 배포는 별도다. 구현 규칙은 `apps/web/AGENTS.md`의 같은 날짜 기록을 따른다.
