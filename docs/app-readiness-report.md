# 앱(apps/mobile) 완성도 리포트

> **2026-09-12 현재 개발 기준**: [개발 실행안](plans/business-plan-development-delta.md)의 현재 구현/변경 목표/인수 조건을 적용한다. 앱은 Live 직접 입력·대화와 검증 Clova 출력, 담당자 시작·회수형 진행으로 변경할 계획이다. 웹 일지는 자유서술형이며 현재 초안은 규칙 기반이다. 사람의 최종 확인·선별 공개는 유지한다. 신규 LLM·과금·계측·학습 기능과 과거 구현/배포 이력을 구분한다.

> ## 🔄 적용 결과 업데이트 (2026-08-23 · 리포트 작성 직후 2차 작업)
>
> | 항목 | 리포트 상태 → 현재 |
> |---|---|
> | iOS 마이크 권한 문구 / Android RECORD_AUDIO | 🔴 누락 → **✅ app.json 선언 완료** |
> | 마이크 런타임 권한 요청 | 🔴 없음 → **✅ `ensureMicPermission()`**(청취 시작 전 요청, 거절 시 안내 Alert) |
> | app.json 버전 | 0.0.0 → **1.0.0** |
> | Live 결함 ① "다시 듣기" 데드 분기 | 🟠 → **✅ 수정**(엔진 생존과 무관하게 플레이어 직접 호출) |
> | Live 결함 ② 응답 지연 시 UI 정체 | 🟠 → **✅ 개선**(저장 버튼 "AI 응답 대기 중…" 상태 + 이중 탭 차단) |
> | Live 결함 ③ 타임아웃 조용한 폴백 | 🟡 → **✅ 개선**('timeout' 명시 반환 + 세션당 1회 안내 Alert) |
> | Live 결함 ④ 끊김 시 다운그레이드 | 🟡 → **✅ 구현**(sessionResumption 핸들 보관 → 1회 자동 재접속, 실패 시에만 폴백) |
> | 소셜 로그인 3종 | 🟠 준비 중 → **✅ 코드 연동 완료** — 구글·카카오=Supabase PKCE OAuth(클라이언트 flowType pkce 전환), 네이버=**naver-auth Edge Function 신규 구현·배포·스모크 통과**(대시보드의 "Custom Providers"는 authorize 흐름과 무관해 원안계획대로 함수 경유 확정) |
> | 모바일 테스트 전무 | 🟠 → **🟡 시작**(pcm/base64·WAV 헤더 4건, mobile vitest 도입) |
>
> **남은 것(사용자/외부)**: ① 아이콘·adaptive-icon·스플래시 이미지(제작 중 — 수령 후 app.json 반영)
> ② Supabase Auth → Redirect URLs에 `giokon://auth/callback` 추가 ③ EAS env 등록
> (`EXPO_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY/WEB_URL/NAVER_CLIENT_ID`) ④ 웹 최소 배포 후 WEB_URL 연결.
>
> ### 🔄 3차 업데이트 (같은 날 — 사용자 외부 작업 완료 + 잔여 코드 개선)
>
> | 항목 | 상태 |
> |---|---|
> | Supabase Redirect URLs(`giokon://auth/callback`) | ✅ 등록 완료(사용자) |
> | EAS 프로젝트 연결 + env 4종(URL·KEY·NAVER_CLIENT_ID·WEB_URL) | ✅ 등록 완료(사용자, `eas env:list`로 검증) |
> | 앱 자산(icon 1254²·adaptive-icon 1254²·splash 1572×3408) | ✅ 수령 → `assets/` 표준 경로 복사 + app.json 연결(`expo config` 검증). ※ avatar-ai.png(148px)는 규격 미달+채팅 아바타 공유라 미사용 — 전용 1024² 수령 시 icon.png 교체 |
> | 개인정보처리방침·약관 페이지 | ✅ 웹 가이드 문구 그대로 정적 사이트화 → **https://giokon-legal.vercel.app** 배포(사용자) · `/privacy` `/terms` 동작(vercel.json cleanUrls) |
> | app.json | version 1.0.0 · EAS projectId 연결 · slug 확인(giok-on, 딥링크 scheme=giokon과 무관) |
> | loading 인터스티셜 고정 1.2s | 🟡 → **✅ 개선**(다음 질문 교체 감지 복귀, 최소 0.5s/최대 8s) — Live 응답 대기를 화면이 덮음 |
> | liveAudioChunks 메모리 | 🟡 → **✅ 세션 종료 시 clear** |
>
> ### 🔄 4차 업데이트 (2026-08-25 — Live 주제 태깅)
>
> | 항목 | 상태 |
> |---|---|
> | Live 응답 주제 보수화(§6 — `switch_topic=false` 고정) | 🟢 → **✅ 개선** — core `detectTurnTopic`(analysis.ts): Live 질문 텍스트에서 표준 주제 근거를 결정론 판별(동점 시 나중 언급 우선), 근거 없으면 직전 주제 유지. `appStore.confirmUtterance` 배선 + core 테스트 5건 추가(총 180). 이후 세션 분석의 topicsEngaged/topicsLow·주제 전환 지표가 Live 모드에서도 근거 기록됨 → 웹 설계 프리필 등 후속 반영 루프의 데이터 신뢰도 확보 |
>
> **스토어 제출은 사용자 일정에 따라 보류** — 코드·설정·서류 준비는 위 표 기준 완료 상태이며,
> 제출 시점에는 `eas build --profile production` + 리스팅(Data Safety 등)만 남는다.
>
> 검증: typecheck 4패키지 · lint · test(core 175+data 37+mobile 4=216) · web build · copy/font/figma 172 전부 통과.

---
- **작성일**: 2026-08-23 · 기준 커밋 `30d7f58` (main)
- **목적**: "앱을 먼저 완벽하게 → 웹 완료 후 동시 배포" 전략에 따라, 앱을 태스크 단위로 세분화해
  **구현 상태 / 문제점 / 미구현 / 개선 필요**를 전수 평가한다.
- **검증 근거**: 소스 정적 분석 + 전 게이트(typecheck·lint·test 212·build·copy·font·figma 172) 통과 상태 +
  실기기 Live 음성 사용자 검증(2026-08-23) + 라이브 DB 실측(마이그레이션 #29 적용 완료)

---

## 0. 한눈에 보는 요약

| 영역 | 상태 | 판단 |
|---|---|---|
| 핵심 대화 플로우(19 Figma 화면 + 컴플라이언스 화면) | ✅ 전부 구현 | 피그마 실측 ≤1.8px, check:figma 172항목 |
| Gemini Live 연동(TTS·STT·LLM 통합) | ✅ 실기기 검증 완료 | 폴백 경로 보존, 다만 엣지케이스 결함 4건 (§4) |
| 웹 설계 세션(planned) 채택 | ✅ 신규 구현 | 좀비 제거·안전입력 반영 |
| DB 동기화(진행 중 저장·안전이벤트·분석) | ✅ | 마이그레이션 #29 적용 완료 |
| **스토어 게시 자산(아이콘·스플래시)** | 🔴 **전무** | EAS production 빌드 불가 수준 — 최우선 |
| iOS 마이크 권한 선언 | 🔴 누락 | `NSMicrophoneUsageDescription` 없음 → 크래시 |
| 소셜 로그인 | 🟠 "준비 중" 하드코딩 | 이메일 로그인만 실동작 |
| 대화 녹음 저장(`audio_url`) | ⚪ v2 명시 연기 | 재생바 "녹음 없음" 처리는 원칙 준수 |
| 자동화 테스트(모바일 레이어) | 🟠 없음 | core/data만 테스트됨 |

**결론**: 기능은 거의 완성(약 90%). 남은 것은 ① 스토어 게시 자산·설정 ② Live 엔지니어링 디테일 4건
③ 소셜 로그인 ④ 품질 장치(테스트)이다. §8 체크리스트 순서대로 진행하면 게시 가능.

---

## 1. 화면(route)별 완성도 — 20개 전수

| Route | 화면 | 구현 | 데이터 | 비고 / 이슈 |
|---|---|---|---|---|
| `index.tsx` | 스플래시 | ✅ | — | 1.6초 자동 이동, 탭 즉시 |
| `login.tsx` | 로그인 | ✅ | live+mock | 🔴 소셜 3버튼 `Alert '준비 중'` 하드코딩(login.tsx:70). 이메일 로그인·비번재설정 실동작 |
| `main.tsx` | 어르신 목록 | ✅ | live | 검색·최근대화·등록/전체분석 CTA |
| `register.tsx` | 어르신 등록 | ✅ | live | 사진 업로드(base64), 주요기억→chronicle |
| `elder/[id].tsx` | 상세(3탭) | ✅ | live | 프로필/세션/분석 탭, 동의 게이트 |
| `chronicle/[id].tsx` | 연대기 수정 | ✅ | live | 디프싱크 동기화, 사진 교체 시 구파기 |
| `consent/[id]/index.tsx` | 동의 주체 선택 | ✅ | live | 주체→capacity 파생(core consent.ts SoT) |
| `consent/[id]/terms.tsx` | 필수 동의 | ✅ | live | 중복 동의 skip, guardian_name 제약 대응(C1 결정 대기) |
| `session/start.tsx` | 대화 시작 핸드오프 | ✅ | live | **신규: due planned 채택**(B1-a/c) — 설계 값 beginSession 주입 |
| `session/talk.tsx` | 대화 | ✅ | live | **신규: Live 모드 + 폴백**. 결함 4건 §4 |
| `session/loading.tsx` | 다음 질문 대기 | ✅ | — | ⚠️ 고정 1200ms 후 복귀 — Live 지연과 무관한 인터스티셜(§4-3) |
| `session/saved.tsx` | 저장 확인 | ✅ | live | 실패 시 재시도/포기 Alert(기록 유실 방지) |
| `log/[id].tsx` | 대화 전문 | ✅ | live | 재생바 "녹음 없음"(녹음 미구현 표기 — 원칙 준수) |
| `analysis/[logId].tsx` | 세션 분석 | ✅ | live | 관찰 지표만(null→'—'), 감정 분포=응답 분포 |
| `observations.tsx` | 인지효과(추이) | ✅ | live | 기간 pill(3/6/12), null 브리지 금지 차트 |
| `analytics.tsx` | 전체 분석 | ✅ | live | TOP5·요약카드 |
| `topics/[id].tsx` | 주제별 분석 | ✅ | live | 조직/개인 스코프 |
| `settings/index.tsx` | 설정 | ✅ | live | 로그아웃·법적문서 링크(WEB_URL 의존)·**어르신 삭제(Storage 파기 선행)** |
| `settings/elders.tsx` | 담당 어르신 관리 | ✅ | live | 삭제 플로우 동일 |
| `_layout.tsx` | 루트 | ✅ | — | ErrorBoundary, DemoModeNotice(목업 1회 안내), queryFocus(AppState 재조회) |

---

## 2. 핵심 플로우 검증 (세션 라이프사이클)

```
로그인 → 어르신 선택 → [동의 게이트] → 시작(planned 채택 or 신규)
  → 오프너(Live 모델 인사 / 로컬 규칙 질문)
  → [AI 발화 재생] → [청취: 마이크 토글 or 침묵 자동종료]
  → [확인·수정 패널] → 확정 → (위기? 로컬 안전응답 : 모델 턴)
  → … ×10턴(자동종료 권고) → 마무리 → 저장(진행중 upsert + 종료 일괄) → saved/log/분석
```

| 단계 | 상태 | 근거 |
|---|---|---|
| 동의 게이트(미동의 차단) | ✅ | `canStartElderSession`(core), 2단계 수집 subject/capacity 기록 |
| 진행 중 DB 저장 | ✅ | sessions insert(active) → 턴마다 session_logs upsert((session_id,turn_index) 멱등) |
| 위기 에스컬레이션 | ✅ | 3중 방어(입력 감지→배너·ack 기록 / 출력 가드 / 프롬프트). **Live 모드에서도 위기 텍스트는 모델 미전송** |
| 자동 종료 | ✅ | core `resolveSessionRecommendation` — 안전 우선, 10턴 |
| 저장 실패 복구 | ✅ | 재시도(3회 백오프)→Alert 재시도/포기, 포기 시 active 잔행 ended 정리 |
| 어르신 삭제 | ✅ | Storage 두 버킷 파기 **선행** → 행 삭제(cascade) — RLS 경로 제약 준수 |
| 오프라인/키 미설정 | ✅ | 목업 폴백 전면 보존 + 1회 안내 Alert |

---

## 3. 데이터·연동 매트릭스

| 기능 | Live | Mock 폴백 | 비고 |
|---|---|---|---|
| 로그인 | ✅ 이메일 | ✅ 브리지 | 소셜=준비 중 |
| 어르신 CRUD·연대기·동의 | ✅ | ✅ | 부분갱신 규약(undefined=미변경) |
| 사진 업로드/signed URL | ✅ elder-photos(private) | 로컬 uri | 교체 시 구파기, 삭제 시 전량 파기 |
| 세션·로그·분석·안전이벤트 | ✅ 실시간 upsert | ✅ | Realtime publication 7테이블 일치(웹 관전 가능) |
| 대화 AI(TTS+STT+LLM) | ✅ **Gemini Live** | expo-speech+mockStt | ephemeral token(live-token 함수) 경유 |
| 웹 설계 세션 수신 | ✅ planned 채택 | — | 목업엔 planned 원천 없음 |
| 녹음 저장(audio_url 등 3컬럼) | ❌ v2 | ❌ | 빈 값 유지(임의값 금지 원칙) |

---

## 4. Live 연동 — 알려진 결함·한계 (구현자 자체 발견 포함)

> 실기기 검증은 통과했으나, 코드 리뷰상 아래 4건은 **게시 전 수정 권장**.

1. **🟠 "다시 듣기" 데드 분기 (talk.tsx)**
   `peekLiveEngine()`이 null(세션 종료 처리 중 등)일 때 청크가 있어도 재생하지 않고 조용히 반환한다.
   → 엔진 의존을 제거하고 `playPcmTurn(chunks)` 직접 호출로 수정 필요(player.ts 함수 재사용).
2. **🟠 모델 응답 지연 시 UI 정체**
   `submitUserTurn`은 turnComplete까지 최대 20s 대기한다. 그동안 talk 화면에 패널+"말씀을 정리하고 있어요..."라벨만 있고 진행 표시가 약하다. → 3~4초 경과 시 스피너 표시 또는 즉시 loading 화면 이동 후 결과 수신 방식 검토.
3. **🟡 타임아웃 시 무음 폴백**
   20s 초과 시 `null` 반환 → **로컬(mock) 질문으로 이어진다**. 대화가 갑자기 규칙 기반 문장으로 바뀌어 위화감. → 타임아웃 시 "연결이 불안정해요" 안내 후 재시도 유도가 더 자연스럽다.
4. **🟡 네트워크 끊김 시 세션 다운그레이드**
   WebSocket 유실 → `client=null` → 이후 턴부터 조용히 폴백 파이프라인(음성 톤 변경). `sessionResumption` handle은 수집만 하고 **재접속 로직은 미구현**. → handle 재접속 or 세션 종료 안내 중 택일.
5. **🟢 참고(설계상 의도)**: proactive audio/affective 미지원은 입력 게이트+커스텀 VAD+텍스트 안전 계층으로 치환 완료. 장기 기억은 DB 주입(buildSystemPrompt v1.1)으로 해소. 오디오는 턴 완료 후 일괄 재생(barge-in 없음이므로 UX 영향 없음).
6. **🟢 마이크 무음 자동종료**: 전사 2자 이상 + 1.6초 침묵에서만 자동 확정 — 무음 대기 시 수동(재탭) 요구. 실기기에서 호흡 맞는지 관찰 필요(파라미터 조정 여지).

### 4.1 마이크 권한 런타임 요청 — 🔴 게시 차단급 확인 필요
`startMicStream`이 권한 요청 없이 바로 recording을 시작한다.
- **iOS**: `app.json`에 `NSMicrophoneUsageDescription` **미선언**(현재 infoPlist 없음) → 심사 거절 + 런타임 크래시 위험.
- **Android**: RECORD_AUDIO는 expo-av가 매니페스트에 병합하지만 **런타임 PermissionsAndroid 요청 코드가 없다** → 최초 거절 시 이후 무반응 가능.
→ 권한 요청 유틸(mic.ts 진입 전) + app.json 선언 필수. (실기기에서 동작한 건 개발자 빌드라 권한이 자동 부여됐을 가능성.)

---

## 5. 미구현 기능 목록 (우선순위)

| P | 기능 | 내용 | 비고 |
|---|---|---|---|
| 🔴 P0 | 앱 아이콘·적응형 아이콘·스플래시 이미지 | `assets/icon.png`·`adaptive-icon.png`·`splash.png` **모두 없음**(app.json에 image 필드 자체가 없음). EAS production 빌드/스토어 심사 불가 | 디자인팀 산출물 필요(1024/foreground/splash) |
| 🔴 P0 | iOS 마이크 권한 문구 + Android 런타임 요청 | §4.1 | 코드 몇 줄 + app.json |
| 🔴 P0 | EAS 환경변수 등록 | `EXPO_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY/WEB_URL` — 로컬 .env는 빌드에 미포함 | `eas env:create` |
| 🟠 P1 | 소셜 로그인 3종 활성화 | Supabase Providers(구글·카카오)+딥링크 Redirect, 네이버=naver-auth 함수 구현·배포, login.tsx 분기 교체 | OAuth 콘솔 등록 선행(외부) |
| 🟠 P1 | Live 결함 4건 수정 | §4-1~4 | 반나절 내 |
| 🟠 P1 | 버전/빌드 메타 | app.json `version 0.0.0` → 1.0.0, eas.json submit 프로필(Apple ID 등) | |
| 🟡 P2 | 대화 녹음 저장 | session_logs.audio_url 3컬럼 idle, 재생바 "녹음 없음" | v2 합의됨 — 게시와 무관 |
| 🟡 P2 | 모바일 레이어 테스트 | live/pcm·wrapWav, client 파싱, store 액션은 순수 로직이라 node 테스트 가능 | vitest 확장 |
| ⚪ P3 | 자산 @3x/@4x 재추출 | 일부 1x 아이콘 선명도(예정 과제, 같은 파일명 덮어쓰기) | |
| ⚪ P3 | C1 결정 반영 | consents_guardian_check 완화 시 보호자 화면에서 성함 필드 제거 | 사용자 결정 대기 |

---

## 6. UX·품질 세부 관찰 (비차단)

- **loading 인터스티셜 고정 1200ms**(loading.tsx): Live 지연과 무관하게 표시되는 연출용 화면. 모델 응답이 늦으면 talk 복귀 후에도 질문이 잠깐 이전 것으로 보일 수 있음(§4-2와 동일 뿌리).
- **liveAudioChunks 메모리**: 턴당 수백 KB × 10턴 ≈ 수 MB — 허용 범위. 세션 종료 시 ref 클리어 권장.
- **주제(switch_topic) 보수화**: ~~Live 응답은 직전 주제를 유지해 `switch_topic=false` 처리~~ → **✅ 해소(2026-08-25, 4차)** — core `detectTurnTopic` 으로 Live 질문의 주제를 텍스트 근거로 태깅한다(근거 없으면 직전 주제 유지).
- **오프너 레이스**: Live 오프너 도착 전 요양보호사가 즉시 다음 동작을 하면 로컬 질문이 유지된다(무결성 문제는 없음).
- **폰트·접근성**: `check:font`(36파일 Pretendard 강제)·터치 타깃≥57px·role/label 유지. KWCAG 기본기 충족.
- **다국어**: 한국어 하드코딩 — KR 시장 한정이므로 OK.

## 7. 보안·컴플라이언스 상태

| 항목 | 상태 |
|---|---|
| Gemini 키 노출 | ✅ 없음 — ephemeral token(live-token 함수가 JWT 검증 후 발급, 모델 잠금, 90s/30min 수명) |
| 위기 대응 | ✅ 텍스트 기반 8상황 분류 + 이벤트 영속 + ack 기록. Live 모델에 위기 발화 미전송 |
| AI 투명성 | ✅ 대화 화면·시작 화면 고지 배너, AI 생성물 라벨 |
| 동의 | ✅ 어르신 2단계(주체/능력/근거 기록). 계정 동의도 #29로 기록 시작 |
| 개인정보 | ✅ 사진 private 버킷+signed URL, 삭제 시 파일先行 파기, 감사(audit_log 트리거) |
| 비의료 언어 | ✅ check:copy CI 게이트 |

⚠️ 스토어 심사 서류: **개인정보처리방침 URL이 살아있어야 함** — 웹 미배포 상태라 앱 제출 직전에 최소 `/guide#privacy` 배포 필요(동시 배포 계획과 정합).

## 8. 게시 가능성 체크리스트 (순서대로)

```
[ ] 1. 아이콘/adaptive-icon/splash 이미지 확보 → app.json image 필드 추가        (P0, 외부 산출)
[ ] 2. app.json: NSMicrophoneUsageDescription + version 1.0.0                    (P0, 코드)
[ ] 3. mic.ts: 런타임 권한 요청(Android PermissionsAndroid/iOS 자동)             (P0, 코드)
[ ] 4. Live 결함 4건 수정(§4)                                                    (P1, 코드)
[ ] 5. eas env:create — EXPO_PUBLIC_ 3종                                         (P1, 외부)
[ ] 6. 웹 최소 배포(/guide#privacy·약관) → WEB_URL 연결                           (P1, Vercel)
[ ] 7. 소셜 로그인(콘솔 등록 → Providers → login.tsx 분기)                        (P1, 외부+코드)
[ ] 8. EAS build(preview) 실기기 회귀 → production build → 스토어 제출            (P1)
```

## 9. 권장 다음 액션 (제가 바로 할 수 있는 것)

1. **§8-2~4 코드 작업**(권한 문구·런타임 요청·Live 결함 4건) — 당일 가능
2. **live/pcm·client 파싱 단위테스트 추가**(vitest, node 환경) — 품질 장치 첫 걸음
3. 아이콘 에셫은 사용자/디자인 확보 후 app.json 반영

---
*본 리포트의 파일 참조는 커밋 `30d7f58` 기준이다.*
