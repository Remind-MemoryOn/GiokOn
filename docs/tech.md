# tech.md

## 1. 기술 스택 개요

| 영역 | 선택 기술 | 선택 이유 | 대안 |
|---|---|---|---|
| 모바일 앱 | React Native (Expo) | iOS·Android 동시 개발. 3인 팀 리소스 최적화 | Flutter |
| 관리자 웹 | React (Vite) | 팀 내 React 경험 보유. 빠른 프로토타이핑 | Next.js |
| 코드 구조 | pnpm 모노레포 | 웹·모바일이 로직/데이터/토큰을 공유 | Turborepo, Nx |
| 데이터·인증·서버 | Supabase | Postgres + Auth + Storage + Edge Functions 통합. 운영 단순화 | Firebase, Node/Express |
| DB (장기) | Supabase PostgreSQL | 연대기·세션 로그 정형 저장 | MySQL |
| 인증 | Supabase Auth | 이메일/비번 로그인 + RLS 연동 간편 | Firebase Auth |
| AI 오케스트레이션 | Supabase Edge Functions | provider 키 보호. STT→LLM→TTS 서버사이드 처리 | Node/Express |
| LLM | 현행 프런티어(벤치마크 후 선정) | 한국어 품질·지연·비용 비교 후 선정. `AIProvider`로 교체 용이 | GPT-5.x / Gemini 3 / Claude |
| TTS | Clova Voice | 한국어 자연스러움. 노인 대상 적합한 발화 속도 | OpenAI TTS / ElevenLabs |
| STT | gpt-4o-transcribe | Whisper-v3 대비 WER↓. 노인·사투리는 Clova Speech 보완 | Whisper / Clova Speech |
| 상태 관리 | TanStack Query(서버) + Zustand(UI) | 서버상태 캐싱·동기화 / UI상태 분리 | Redux, Jotai |
| 스타일 | Tailwind CSS (웹) / NativeWind (모바일) | 디자인 토큰을 양 플랫폼이 공유 | StyleSheet |
| 디자인 | Figma | 핸드오프 → 디자인 토큰 단일 소스 | — |
| 배포 (웹) | Netlify / Vercel | GitHub 연동 자동 배포. 무료 티어 | — |
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

별도 애플리케이션 서버를 두지 않는다. **클라이언트가 supabase-js로 Supabase에 직접 연동**하고, **API 키 보호가 필요한 AI 파이프라인만 Edge Functions**가 담당한다.

```
클라이언트(웹·모바일)
   ├─ supabase-js (CRUD) ───────────→ Supabase Postgres (RLS: auth.uid())
   └─ Edge Function 호출 (AI) ──────→ Supabase Edge Functions
                                          ↓
                                  LLM(현행 프런티어) / Clova Voice / gpt-4o-transcribe
                                          ↓
                                  Supabase Postgres / Storage
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
| `session-respond` | 어르신 발화 수신 → STT → LLM 다음 질문 → TTS → 로그 기록 + audio_url 반환 |
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

**Supabase Storage — 오디오 임시 저장**

STT 처리 전 어르신 발화 오디오를 임시 저장한다. STT(gpt-4o-transcribe) API에 전송하고 텍스트 변환 완료 후 오디오는 삭제한다. TTS 결과 오디오는 `session_logs.audio_url`로 제공하고 `audio_expires_at`(24시간)으로 추적해 만료 파일을 정리한다.

세션 로그(텍스트)는 PostgreSQL에 저장한다. 오디오 원본을 장기 보관하지 않아 개인정보 처리 부담을 최소화한다.

---

## 7. 외부 API 연동 계획

**AI 파이프라인 흐름** (Edge Function 내부에서 실행)

```
[어르신 발화]
      ↓
gpt-4o-transcribe (STT: 음성 → 텍스트)
      ↓
LLM (다음 질문 생성, Structured Outputs)
      ↓
Clova Voice (TTS: 텍스트 → 음성)
      ↓
[어르신 청취]
```

> v1은 위 STT→LLM→TTS 파이프라인으로 시작하되, **OpenAI Realtime(speech-to-speech, gpt-realtime)** 스파이크로 지연·자연스러움·비용을 비교해 전환 여부를 검토한다(첫 응답 지연이 스티칭 대비 크게 낮음).

**API별 상세**

| API | 용도 | 과금 기준 | 비고 |
|---|---|---|---|
| LLM (현행 프런티어, 벤치마크 후 선정) | 회상 대화 생성, 주제 전환 판단 | 토큰당 | 프롬프트 최적화로 비용 통제 |
| OpenAI gpt-4o-transcribe | 어르신 발화 STT | 오디오 분당 | Whisper-v3 대비 WER↓ |
| Clova Voice (NAVER) | TTS 음성 출력 | 글자 수당 | 한국어 노인 발화 자연스러움 우선 |
| Clova Speech (NAVER) | 사투리·노인 발화 STT 보완 | 초당 | STT 오인식 보정용 |

provider 키는 **Edge Function secrets**에만 두고 클라이언트에 노출하지 않는다.

**LLM 프롬프트 설계 방향**

시스템 프롬프트에 어르신 연대기 전체를 삽입하고, 회상 대화 진행 원칙(긍정적 기억 우선, 고통 주제 전환, 반복 질문 금지)을 명시한다. 응답은 **Structured Outputs(JSON schema)** 로 강제하여 다음 질문 텍스트와 주제 전환 여부를 분리하고, JSON 파싱 실패 자체를 제거한다.

```json
{
  "question": "식당은 어디서 하셨어요? 전주 시내였나요?",
  "topic": "직업",
  "switch_topic": false
}
```

개발 단계에서는 `packages/core`의 목업 AI(`MockAIProvider`)로 전 구간을 동작시키고, 실 provider는 Edge Function에서 후반에 연결한다(시그니처 동일 유지).

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
| 관리자 웹 | Netlify / Vercel | GitHub push 시 자동 배포 |
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
단일 모델을 고정하지 않고 현행 프런티어(GPT-5.x·Gemini 3·Claude 등)를 한국어 대화 품질·지연·비용 기준으로 벤치마크해 선정한다. `AIProvider` 추상화로 모델 교체가 쉽다. 프롬프트 수준에서 회상 대화 프로토콜을 제어해 별도 파인튜닝 없이 적용한다.

**Clova Voice를 선택한 이유**
한국어 TTS 중 노인이 듣기에 가장 자연스러운 발화 속도와 억양을 제공한다. Google TTS 대비 한국어 특화 품질이 높고, 발화 속도 조절 API를 지원한다.

---

## 11. 기술적 제약사항

| 제약 | 내용 | 대응 |
|---|---|---|
| STT 정확도 | 노인 발화(사투리, 어눌함, 짧은 응답)에서 STT 오인식 빈발 | Clova Speech 병행. 요양보호사 수동 수정 UI 제공 |
| LLM 응답 지연 | LLM 평균 응답 1~3초 + TTS 변환 시간 = 체감 대기 3~5초 | 스트리밍 응답 + TTS 청크 분할 재생으로 체감 지연 최소화 |
| API 비용 | LLM + Clova Voice + STT 세션당 과금 | 프롬프트 토큰 최적화. 파일럿 세션 수 제한(일 5~10회) |
| Edge Function 콜드스타트 | 첫 호출 시 초기화 지연 가능 | 파일럿 전 웜업 호출. 함수 경량화 |
| Expo 빌드 제한 | Expo Go에서 일부 네이티브 모듈 미지원 | 오디오 녹음은 Expo AV 사용. 필요 시 EAS Build 전환 |
| Supabase 무료 티어 | 프로젝트 일시정지·용량 제한 | 파일럿 규모(5~10명) 내에서 충분. 초과 시 Pro 전환 |

---

## 12. 추후 확장 시 고려사항

| 항목 | 현재 | 확장 시 |
|---|---|---|
| LLM | 프런티어 단일 | 다모델 라우팅 / HyperCLOVA X 병행 (사투리·한국어 특화 보완) |
| 음성 루프 | STT→LLM→TTS 파이프라인 | OpenAI Realtime(speech-to-speech) 전환 |
| STT | gpt-4o-transcribe + Clova Speech | 노인 발화 특화 파인튜닝 모델 도입 |
| 실시간 동기화 | v1 미사용 | Supabase Realtime (요양보호사 모니터링 화면) |
| 보호자 연동 | 미구현 (v2) | 푸시 알림으로 세션 리포트 전달 |
| 연대기 축적 | 요양보호사 직접 입력 | 세션 로그 기반 AI 자동 연대기 보완 |
| 인지자극 모듈 | 미구현 (v2) | 별도 프롬프트 + 세션 타입 분기로 추가 |
| 모니터링 | 없음 | Sentry (에러 추적) + Edge Function 로깅 |
