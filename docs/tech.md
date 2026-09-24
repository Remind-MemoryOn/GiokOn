# tech.md

> **2026-09-13 개발 기준 추가**: [음성 계획 §3.4](plans/voice-ai-personalization.md#34-서버-통제턴기록-계약-2026-09-13-승인-미구현)의 서버 중계·자동 턴·기록 출처 계약을 따른다. 장시간 음성 중계 실행 환경은 미정이며 Edge Functions로 전부 처리한다고 가정하지 않는다. [DB 제외 개발 목록](plans/non-db-development-backlog.md)에 서버·앱·웹·계측·검증 작업을 분리했다.

> ## ⚠️ 2026-09-23 기획 변경 — 이 문서보다 새 계획이 우선한다
>
> 제품 정의가 **"요양보호사 업무 보조 도구"** 에서
> **"인지활동 프로그램을 AI가 진행하고, 그 결과가 공단 형식 프로그램 일지 초안으로 자동으로
> 남는 도구"** 로 바뀌었다. 요양보호사는 계획하고 감독하며 확인한다.
>
> **"무엇을 만들지"의 SoT = [`docs/plans/pilot-development-plan.md`](../docs/plans/pilot-development-plan.md)**.
> 이 문서에서 **요양일지·per-caregiver 격리·규칙 기반 대화·직접 Gemini Live** 를 전제한 서술은
> 낡았다. 새 계획과 충돌하면 새 계획을 따른다.
>
> **이 문서 안에서는 §0(파일럿 기술 기준)이 새 기준이다.**

> 🏢 **엔터프라이즈·정부심사 트랙(2026-07-03)**: 리전=**서울(ap-northeast-2)**, 보안스택·암호화·관측성·커넥션 풀링·부하/DR은 `docs/security.md`·`docs/infrastructure.md`. 멀티테넌시(organizations/RBAC)는 PLAN §2′ M14.

## 0. 파일럿 기술 기준 (2026-09-23 기획 변경 — 이 절이 §1~§12 보다 우선한다)

> 무엇을 만들지는 [`pilot-development-plan.md`](plans/pilot-development-plan.md), 구조는 [`structure.md`](structure.md) §0.
> 아래 §1~§12 에는 "중계는 미구현", "앱 직접 Live 입력" 같은 이전 시점 서술이 남아 있다 — 이 표와 다르면 이 표를 따른다.

| 영역 | 파일럿 기준 | 비고 |
|---|---|---|
| 음성 경로 | **중계 단일**: 앱 → `apps/voice-relay`(Node + ws, Docker) → Gemini Live → 출력 검증(`screenAiUtterance`) → CLOVA Voice → 앱 | 중계는 **코드 구현·로컬 검증 완료, 운영 호스팅 미정·실기기 미검증**. 앱 직접 모드는 폐기(M1) |
| 대화 모델 | **`gemini-3.8-live`** | 모델은 `live-token` 이 `GEMINI_LIVE_MODEL` 시크릿으로 정해 돌려준다 — `.env` 는 런타임에 안 읽힌다. 폴백 상수 2곳이 아직 3.1(T24.5). 3.1 기준 제약(Structured Outputs·proactive/affective 미지원)은 3.8 에서 재확인 |
| 토큰 발급 | `live-token` 을 **중계 전용**으로 잠근다 | 지금은 중계도 사용자 JWT 로 불러 서버가 직접 호출과 구분 못 한다(C4) |
| 대화 통제 | 대화 정책(단계형 도입 → 회상 → 마무리·의견수렴)을 시스템 지시로 주입. 단계는 `sessions.phase`(서버 권위) | 중계의 2초 폴을 `session_tick` RPC 로 바꿔 단계·원격 제어를 함께 받는다. 규칙 기반 대화(`packages/core/src/ai.ts`)는 삭제 |
| 안전 | 결정론 위기 감지 → **즉시 연결 종료**(유지) + `safety_events` 즉시 기록 + 감독 화면·푸시 | 위기 대응·출력 검열·진단표현 금지는 설정으로 끌 수 없다 |
| 일지 초안 | 세션 종료 → DB 트리거 → `journal_generation_jobs` 큐 → Edge Function 워커(30초 스케줄) → 확인 대기 | 동기 호출 불가(폴백 저장 경로에서는 종료 시점에 분석이 아직 없다). 생성문 검증은 `generated-session.ts` 확장 |
| 확정 | 사람만 — `auth.uid() is null` 이면 `final` 전환 거부(DB 트리거) | 서비스 계정 워커는 확정을 물리적으로 못 쓴다 |
| 감독·원격 제어 | Supabase Realtime(`sessions`·`session_interventions`) + DB 행 | broadcast 는 RLS 를 안 타서 쓰지 않는다 |
| 푸시 | **Expo Push**(EAS 가 FCM/APNs 자격증명 관리) — `notifications` 행 소비자 | 본문에 어르신 성함·발화 금지. `expo-notifications` 추가 → EAS 재빌드 |
| 권한 | RLS 기관 단위 + 역할(`is_care_team()` · `has_capability()`) | 지금은 담당 배정 격리(`20260722100000`) |
| 계측 | `product_events` + definer 삽입 함수 | 시간 절감(초안 → 확정 소요)의 유일한 증거. 1주차부터 |
| 웹 일지 음성 | `stt-transcribe`(CLOVA STT) **보류** | 요양일지 음성 입력 폐기 — 재검토 대상 |
| 장기 트랙 | Whisper 특화·공개 LLM(Ollama) 전환 | **파일럿 범위 밖**([음성 계획](plans/voice-ai-personalization.md) A2~A5) |

---

## 1. 기술 스택 개요

| 영역 | 선택 기술 | 선택 이유 | 대안 |
|---|---|---|---|
| 모바일 앱 | React Native (Expo) | iOS·Android 동시 개발. 3인 팀 리소스 최적화 | Flutter |
| 관리자 웹 | React (Vite) | 팀 내 React 경험 보유. 빠른 프로토타이핑 | Next.js |
| 코드 구조 | pnpm 모노레포 | 웹·모바일이 로직/데이터/토큰을 공유 | Turborepo, Nx |
| 데이터·인증·서버 | Supabase | Postgres + Auth + Storage + Edge Functions 통합. 운영 단순화 | Firebase, Node/Express |
| DB (장기) | Supabase PostgreSQL | 연대기·세션 로그 정형 저장 | MySQL |
| 인증 | Supabase Auth | 이메일/비번 로그인 + RLS 연동 간편 | Firebase Auth |
| AI 오케스트레이션 | Supabase Edge Functions + 필요 시 별도 처리 서버 | 인증·동의·한도·응답 검증. GPU 학습/추론은 별도 국내 서버 | 운영 부하에 맞춰 분리 |
| 대화 이해·생성 | 초기 Gemini 오디오 직접 입력 + 정책·프롬프트 | 한국어 현장 평가 후 모델/API 버전 선정 | 장기 공개 LLM 외부 학습 → Ollama 추론 |
| TTS | 검증 텍스트의 Clova Voice 음성화 | 한국어 청취·속도·지연 실측 후 채택 | 검증 문장의 기기 TTS 폴백 |
| 전사 | 초기 Gemini 오디오 이해의 전사 후보 + 확인 | 불명확 구간 보존, ASR 후보와 비교 | 장기 Whisper 특화, 평가 통과 시 도입 |
| 상태 관리 | TanStack Query(서버) + Zustand(UI) | 서버상태 캐싱·동기화 / UI상태 분리 | Redux, Jotai |
| 스타일 | Tailwind CSS (웹) / NativeWind (모바일) | 디자인 토큰을 양 플랫폼이 공유 | StyleSheet |
| 디자인 | Figma | 핸드오프 → 디자인 토큰 단일 소스 | — |
| 배포 (웹) | Vercel | GitHub 연동 자동 배포. 무료 티어 | — |
| 배포 (모바일) | EAS Build / Submit | Expo 공식 빌드·제출 파이프라인 | — |
| 파일 저장 | Supabase Storage | 세션 오디오 임시 저장 | AWS S3 |

---

## 2. 프론트엔드 기술

웹과 모바일은 **역할이 다르므로 UI를 공유하지 않는다.** 대신 도메인 로직·데이터 액세스·디자인 토큰을 공유 패키지(`packages/core|data|theme`)로 묶어 한 번만 작성한다.

**모바일 앱 — React Native (Expo)**

어르신용 대화 화면을 담당한다. Expo로 빌드 환경 구성을 최소화하고, TestFlight(iOS) / 내부 테스트(Android)로 파일럿을 진행한다.

- 어르신 대화 화면: 글자 크기 최소 18pt, 버튼 최소 60px, 조작 최소화
- 상태 관리: 서버 데이터는 TanStack Query, UI 상태는 Zustand (`packages/core`·`packages/data` 공유)
- 스타일: NativeWind (웹 Tailwind와 동일한 디자인 토큰 사용)
- 오디오: Expo AV(녹음/재생)
- 인증: 요양보호사가 모바일 기기에 로그인(세션 지속) 후 어르신에게 전달 — 어르신 화면은 무인증

**관리자 웹 — React + Vite**

요양보호사가 PC·태블릿 브라우저에서 접근하는 반응형 관리 화면. 어르신 연대기 입력, 세션 시작·종료, 로그 조회를 담당한다. 모바일 앱과 같은 `packages/data`(Supabase) 레이어를 공유한다.

---

## 3. 백엔드 기술

현재 일반 데이터 접근은 클라이언트의 supabase-js와 RLS, 토큰 발급·웹 STT 등은 Edge Functions가 담당한다. 2026-09-13 승인 목표에서는 장시간 음성 중계 서버를 추가한다. 실행 환경은 미정이며, 아래 음성 경로는 아직 미구현이다.

> ⚠️ 2026-09-23: 아래 음성 경로는 `apps/voice-relay` 로 **코드 구현됐다**(운영 호스팅 미정). RLS 는 `auth.uid()` 가 아니라 기관 + 배정(현재) → 기관 + 역할(파일럿). §0 참조.

```
클라이언트(웹·모바일)
   ├─ supabase-js (CRUD) ───────────→ Supabase Postgres (RLS: auth.uid())
   ├─ 토큰 발급·웹 STT ────────────→ Supabase Edge Functions (현재)
   └─ 앱 음성 연결 ────────────────→ 인증·동의·한도를 집행하는 중계 서버 (목표)
                                      → Gemini Live → 출력 전사 검증
                                      → Clova TTS → 앱 재생
                                    기록은 출처·채택·실제 재생을 구분
```

**데이터 액세스 (supabase-js 직접)**

| 작업 | 방식 |
|---|---|
| 프로필 CRUD | `profiles` 테이블 supabase-js 쿼리 (RLS로 소유자 격리) |
| 연대기 CRUD | `chronicle_entries` 테이블 supabase-js 쿼리 |
| 세션 이력/로그 조회 | `sessions` / `session_logs` 테이블 supabase-js 쿼리 |

**AI 파이프라인 (Edge Functions)**

| 함수 | 설명 |
|---|---|
| `session-respond`(신규 계획) | 오디오 이해 → 발화 확인·개인화 → 서버 스키마/안전 검증 → TTS → 로그 기록. 교정 시 기존 질문 폐기 |
| `session-start` / `session-end` | 세션 초기화(첫 질문 생성) / 종료 (respond에 통합 가능) |

---

## 4. 데이터베이스

**Supabase PostgreSQL — 연대기 및 세션 로그 장기 저장**

어르신 프로필(연대기), 세션 메타데이터(날짜·턴 수·발화 시간), 세션 전문 텍스트를 정형 데이터로 저장한다. 스키마·RLS·인덱스는 `supabase/migrations/`의 마이그레이션으로 관리한다.

**주요 테이블 구조**

```sql
-- 어르신 프로필
profiles (id, user_id, name, birth_year, hometown, job, family, memories, hobbies, created_at, updated_at)

-- 세션 메타
sessions (id, profile_id, user_id, status, turn_count, duration_seconds, started_at, ended_at)

-- 세션 로그 (대화 전문)
session_logs (id, session_id, profile_id, user_id, role, content, topic, audio_url, audio_expires_at, spoken_at)
```

세션 진행 중 상태는 클라이언트 메모리 + Supabase에 직접 기록한다. v1에서는 별도 실시간 동기화 DB를 쓰지 않으며, 실시간 모니터링이 필요해지면 Supabase Realtime을 검토한다. 자세한 스키마와 접근 모델은 `docs/database.md` 참고.

---

## 5. 인증·로그인 방식

**Supabase Auth**

요양보호사 계정 관리에 사용한다. 이메일+비밀번호 로그인을 기본으로 적용한다. 인증 정체성은 `auth.uid()`이며, 모든 테이블 RLS가 `user_id = auth.uid()` 기준으로 소유자 데이터를 격리한다. supabase-js가 JWT를 자동으로 첨부하므로 클라이언트는 별도 토큰 관리를 최소화한다.

어르신 대화 화면은 로그인 없이 요양보호사가 세션을 시작하면 자동으로 진입하는 구조로 설계한다. 어르신이 직접 인증 절차를 거치지 않도록 UX를 단순화한다.

---

## 6. 파일 업로드 및 저장 방식

일반 서비스 원음은 처리에 필요한 동안만 임시 보유하고 삭제한다. 학습 자료는 별도 선택 동의·사용 권리·목적별 보유기간이 확인된 구간만 private 저장소에 격리한다. 미동의·철회 대상은 학습 수집에서 제외하며 기본 대화 서비스는 이용할 수 있다. 원음·사람 전사·모델 결과·수정본의 출처를 구분한다.

TTS 결과는 공급자 계약에 맞게 재생하며 저장·재사용은 허용 확인 전 기능으로 전제하지 않는다. 텍스트 기록, 학습 원음, TTS 출력의 수명을 같은 24시간 정책으로 묶지 않는다. 원음 보관·학습 동의/계보·철회는 아직 신규 설계이며 [전환 계획 §6](plans/voice-ai-personalization.md#6-운영-데이터-축적과-학습-권리) 및 `compliance.md`를 따른다.

## 7. 외부 API 연동 계획

```text
앱 음성 → 자격·동의·한도를 집행하는 연결 구조(중계 설계 필요)
  → Gemini Live 직접 입력·대화 진행(출력 전사 수신)
  → 필요시 어르신에게 재확인 + 개인별 승인 정보·대화 지원 정책
  → 다음 문장 생성 → 서버 구조·의미·안전 검증
  → 채택된 문장만 Clova Voice → 앱 재생
```

Gemini Live가 초기 입력·대화 주 경로이며 모델/API 기능·한국어 성능은 A0에서 검증한다. 현재 저장소의 Live는 AUDIO 출력·전사·단기 토큰 경로로, 일반 텍스트 출력 API와 계약이 다르다. Live 3.1은 Structured Outputs 미지원이므로 프롬프트에 JSON을 요구해도 보장되지 않는다. 상세 기술 근거는 [전환 계획 §2](plans/voice-ai-personalization.md#2-기술-근거와-확인-한계).

| 구성요소 | 초기 | 장기 전환 조건 |
|---|---|---|
| 음성 이해 | Gemini Live 직접 입력 + 예외 재확인 | 권리 확인된 원음–사람 전사로 Whisper 특화, 미등록 화자·무음 환각·의미 보존 평가 통과 |
| 대화 정책 | 프롬프트 + 서버 행동 규칙 + 개인별 승인 의미 조회 | Qwen3.5-9B를 외부 SFT/LoRA 도구로 학습 후 Ollama 추론 검증 |
| 출력 음성 | 검증 문장만 Clova TTS | ASR/LLM과 독립 평가; 교정 전 생성 음성 재사용 금지 |
| Gemini Live | 초기 입력·대화 주 경로(자동 진행·Clova 배선 변경 필요) | 검증 전 재생 금지, 연결·전사·교정·비용·재연결 회귀 검증 |
| 웹 일지 음성 | ~~기존 `stt-transcribe` CLOVA STT~~ → 2026-09-23 **보류**(요양일지 폐기) | 재검토 대상 |

개인별 정보는 최소한만 조회해 제공하고, 영구 인지 등급을 모델이 생성하지 않는다. 인지 지원 방식·개인 의미·위험 확인은 서로 다른 상태다. 프로필·전사에 포함된 지시문은 시스템 정책보다 우선하지 못한다.

Structured Outputs 지원 모델에서도 서버 스키마 검사·안전 검증·거절·타임아웃 처리가 필요하다. 전사 교정은 다음 질문을 무효화하고 확정 맥락으로 재생성한다. API 장애 시 사람이 입력하거나 휴식하도록 하며 실제 어르신 발화를 대신 생성하지 않는다. GPU 학습/추론은 Edge Functions 밖에서 수행한다.

Gemini 결과를 공용 대화 모델의 학습 정답으로 자동 축적하지 않는다. API 약관의 경쟁 모델 개발 제한과 학습 후보 출처를 확인해야 한다. Paid 계약은 국내 처리·무보관·자체 학습 허가를 뜻하지 않는다. [전환 계획 §6](plans/voice-ai-personalization.md#6-운영-데이터-축적과-학습-권리)에 수집·철회 조건을 명시했다.

---

## 8. 배포 환경

**개발 단계**

| 환경 | 도구 | 비고 |
|---|---|---|
| 로컬 개발 | Vite dev(웹) + Expo Go(모바일) | 팀원 각자 로컬 실행 |
| 로컬 DB | Supabase CLI (`supabase start`) | 로컬 스택에서 마이그레이션·Edge Function 테스트 |
| API 테스트 | supabase-js / Edge Function 호출 | 엔드포인트 단위 검증 |

**파일럿 단계**

| 영역 | 도구 | 비고 |
|---|---|---|
| 데이터·인증·AI | Supabase (관리형) | DB · Auth · Storage · Edge Functions |
| 관리자 웹 | Vercel | GitHub push 시 자동 배포 |
| 모바일 앱 | EAS Build → TestFlight(iOS) / 내부 테스트(Android) | 파일럿 배포 |

앱스토어 정식 출시는 파일럿 검증 이후로 미룬다. 파일럿 기간에는 TestFlight 초대 링크 / Play 내부 테스트로 배포한다.

---

## 9. 개발 도구 및 협업 도구

| 구분 | 도구 | 용도 |
|---|---|---|
| 버전 관리 | GitHub | 코드 저장·PR 리뷰 |
| 협업 | Notion | 회의록·스펙 문서 관리 |
| 디자인 | Figma | 와이어프레임·UI 목업 → 디자인 토큰 핸드오프 |
| 커뮤니케이션 | KakaoTalk | 팀 일상 소통 |
| 환경변수 관리 | Supabase secrets + .env + GitHub Secrets | API 키 보안 관리 |
| 패키지 관리 | pnpm (워크스페이스) | 모노레포 의존성 관리 |

---

## 10. 기술 선택 이유

**React Native를 선택한 이유**
iOS·Android를 별도로 개발하면 3인 팀의 리소스가 분산된다. React Native + Expo로 단일 코드베이스를 유지하면서 두 플랫폼에 동시 배포할 수 있다. 팀 내 React 경험을 그대로 활용할 수 있어 러닝커브도 낮다.

**모노레포를 선택한 이유**
웹(요양보호사)과 모바일(어르신)은 화면이 다르지만 도메인 로직·데이터·디자인 토큰은 동일하다. 모노레포로 `packages/core|data|theme`를 공유하면 두 앱에 로직을 복붙하지 않아도 되고, 불일치(드리프트)를 막을 수 있다.

**Supabase를 선택한 이유**
Postgres·Auth·Storage·Edge Functions를 한 서비스에서 제공한다. supabase-js가 웹·React Native 양쪽에서 동작하므로 데이터 레이어를 하나로 공유할 수 있고, 별도 서버를 운영·배포하지 않아 3인 팀의 부담이 작다. RLS로 데이터 접근 제어를 DB 차원에서 보장한다.

**LLM 선정 방식**
초기는 Gemini 오디오 이해·프롬프트·개인정보 조회·명시적 정책으로 시작한다. 모델명은 고정하지 않고 한국어 품질·안전·계약·지연·비용으로 선정한다. 공개 LLM 특화는 기준선보다 이익이 입증될 때 별도로 도입하며, `AIProvider`가 있어도 음성 API의 계약과 배선 변경은 필요하다.

**Clova Voice를 선택한 이유**
Clova Voice는 사용자 지정 초기 TTS 목표다. 대상 어르신의 청취 편안함·발화 속도·이름 발음·지연을 비교해 채택한다. 서비스 대상 실측 전 타사 대비 우월성을 단정하지 않는다.

---

## 11. 기술적 제약사항

| 제약 | 내용 | 대응 |
|---|---|---|
| 음성 이해 | 사투리·어눌함·TV·무음에서 오류 가능 | 불명확 구간 확인·원전사 보존·하위군 평가. Whisper 특화도 같은 검증 적용 |
| 응답 지연 | 오디오 이해·확인·검증·TTS 지연은 아직 미측정 | 검증된 첫 재생 P50/P95 측정, 사람 확인 대기는 별도 보고. 미검증 청크 재생 금지 |
| API 비용 | LLM + Clova Voice + STT 세션당 과금 | 프롬프트 토큰 최적화. 파일럿 세션 수 제한(일 5~10회) |
| Edge Function 콜드스타트 | 첫 호출 시 초기화 지연 가능 | 파일럿 전 웜업 호출. 함수 경량화 |
| Expo 빌드 제한 | Expo Go에서 일부 네이티브 모듈 미지원 | 오디오 녹음은 Expo AV 사용. 필요 시 EAS Build 전환 |
| Supabase 무료 티어 | 프로젝트 일시정지·용량 제한 | 파일럿 규모(5~10명) 내에서 충분. 초과 시 Pro 전환 |

---

## 12. 추후 확장 시 고려사항

| 항목 | 현재 | 확장 시 |
|---|---|---|
| 대화 LLM | Gemini + 프롬프트·개인 조회 | 외부 학습 공개 LLM → Ollama, 안전/품질/운영 게이트 후 전환 |
| 음성 루프 | ~~앱 직접 Live 입력·수동 전사 확인·Live PCM/기기 TTS~~ → 중계·자동 진행·검증 문장 Clova 출력 **코드 구현**(2026-09-23 기준) | 운영 호스팅·실기기 종단 평가 · 직접 경로 삭제(M1) · `live-token` 중계 전용화 |
| 전사 | Gemini 전사 후보·확인 | Whisper 특화 후보·타 ASR 비교, 사투리/무음/미등록 화자 게이트 |
| 실시간 동기화 | Supabase Realtime 구독·캐시 무효화 구현 | 철회·연결 소실·재접속 시 화면 및 권한 종단 검증 |
| 보호자 연동 | 연결 승인·항목별 공개·보호자 화면 구현 | 철회 접근 검증. 보호자 휴대폰 알림은 카카오 알림톡(기획 7-9 — 파일럿 범위 밖) |
| 연대기 축적 | 요양보호사 직접 입력 | 세션 로그 기반 AI 자동 연대기 보완 |
| 인지자극 모듈 | 미구현 (v2) | ⚠️ 2026-09-23: 회상 대화 세션 자체가 인지활동 프로그램(회상훈련) 1회로 기록된다 — 별도 모듈이 아니다 |
| 모니터링 | 없음 | Sentry (에러 추적) + Edge Function 로깅 |
