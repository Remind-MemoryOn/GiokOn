# @giokon/mobile — 세션 진행 앱 (요양보호사 모드 + 어르신 표시 모드)

> 📌 **2026-09-23 기획 변경 반영.** "무엇을 만들지"의 SoT =
> [`docs/plans/pilot-development-plan.md`](../../docs/plans/pilot-development-plan.md) §6(앱 파트 M1~M7).
> 화면 요구는 [`docs/design.md`](../../docs/design.md) §0(SCR-08 어르신 표시 모드 · SCR-09 대화 시작 전).

요양보호사가 조작하는 **세션 진행 도구**다. 요양보호사가 로그인 → 어르신 선택 → 설계 확인 → 시작 → 기기를
어르신께 드리면 AI 가 회상 대화(인지활동 프로그램)를 진행한다. 종료되면 분석이 저장되고, 서버가 프로그램 일지
초안을 만든다(확정은 웹에서 사람이 한다). **어르신은 대화만 한다 — 조작하지 않는다.**

## 스택 (현재)

- **Expo SDK 54**(`expo ~54.0.37`) · React Native 0.81 · **expo-router 6**(파일 기반 라우팅) · **NativeWind 4**.
- 상태: 서버 상태 = TanStack Query(`@giokon/data`), 세션 런타임 = Zustand(`src/store/appStore.ts`).
- **음성 = 중계 경로**: 앱 ↔ `apps/voice-relay`(WSS) ↔ Gemini Live → 출력 검증 → CLOVA Voice PCM → 앱 재생.
  Gemini 가 만든 오디오 원본은 재생하지 않는다. 연결 코드는 `src/lib/live/`.
- 안전: `@giokon/core` `safety.ts`(결정론 위기 감지 → **즉시 연결 종료**). 종료 분석은 비의료 관찰 지표만.
- 동의 게이팅: 처리 동의가 없으면 세션을 시작할 수 없다(DB 트리거가 최종 판정).
- Supabase 설정이 없으면 **설정 오류 화면**(`src/components/ConfigError.tsx`)을 띄운다 — 예시 데이터로 조용히 도는
  목업 모드는 2026-09-04 에 제거했다.

## 화면 (app/)

- 인증: `index`(스플래시) · `login`
- 어르신: `main`(목록·검색) · `register` · `elder/[id]` · `chronicle/[id]` · `settings/*`
- 세션: `session/start`(대화 시작 전·AI 이용 고지) · `session/talk`(대화) · `session/loading` · `session/saved`
- 기록·분석: `log/[id]` · `analysis/[logId]` · `observations` · `analytics` · `topics/[id]`
- 동의: `consent/[id]`

## 파일럿에서 바뀌는 것 (파일럿 계획 §6)

| # | 변경 | 이유 |
|---|---|---|
| M1 | **직접 모드 제거** — `talk.tsx` 의 `RELAY_MODE` 분기와 직접 Gemini Live UI 삭제, `EXPO_PUBLIC_VOICE_RELAY_URL` 이 없으면 세션 시작 차단 | 검열되지 않은 AI 음성 경로를 없앤다. `packages/core` 정리(C1)와 **같은 PR** |
| M2 | **어르신 표시 모드** `app/session/elder.tsx` 신설(큰 사진·자막·"말하는 중"만) + 공용 로직 `src/features/session/` 추출 | 지금은 어르신이 든 화면에 요양보호사 UI 가 섞여 있다 |
| M3 | 어르신 화면에서 위기 배너 전화번호·STT 수정 패널·중계 컨트롤·확인 없는 X 제거 | 위기 안내는 **없애지 않고** 요양보호사 모드·감독 화면으로 옮긴다 |
| M4 | 복귀 게이트(숨김 제스처 또는 PIN — `expo-secure-store`) | 어르신이 실수로 나가지 못하게 |
| M5 | 원격 제어 수신 — 감독 화면의 일시정지 → "잠시 쉬어요" + 마이크 정지 | 1인 병렬 감독 |
| M6 | 푸시 토큰 등록(`expo-notifications` → Expo Push) | 위기 발화 알림. ⚠️ `app.json` 플러그인 추가 → **EAS 재빌드 필요** |
| M7 | 폴백 저장 순서를 `finalizeSession` 과 맞춤 | 일지 초안 자동 생성의 첫 시도 성공률 |

고령 사용자 기준(큰 글씨·고대비·큰 터치 영역·핵심 흐름 3단계·선택형 우선·첫 사용 튜토리얼)은 M2 에서 함께 적용한다.
검증 기준은 "기술에 익숙하지 않은 50~60대가 설명 없이 세션 1회를 끝까지 진행하는가"다.

## 비의료 락다운

사용자 노출 카피에 치료·진단·효과·향상 표현 금지(CI `pnpm check:copy`). 분석은 관찰 지표(참여도·응답률·발화량·
주제 반응)로만 표현한다.

## 개발

```bash
pnpm -F @giokon/mobile start        # Expo Dev Server — 마이크 모듈 때문에 Expo Go 가 아니라 개발 빌드 필요
pnpm -F @giokon/mobile typecheck
pnpm -F @giokon/mobile lint
pnpm -F @giokon/mobile test
```

환경변수(전부 **공개 값** — `EXPO_PUBLIC_*` 는 앱 번들에 들어가므로 비밀을 넣지 않는다):
`EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` · **`EXPO_PUBLIC_VOICE_RELAY_URL`**(`wss://호스트/voice`,
파일럿에서 필수) · `EXPO_PUBLIC_WEB_URL`(선택 — 개인정보처리방침·약관을 여는 웹 주소) · `EXPO_PUBLIC_NAVER_CLIENT_ID`.
⚠️ `.env.example` 에 `EXPO_PUBLIC_VOICE_RELAY_URL` 이 아직 없다 — 추가 대상(루트 `AGENTS.md`).

⚠️ `ios.supportsTablet:false` · `orientation: portrait` 이다. 기획서는 "태블릿 N대"를 전제하므로 **파일럿 기기가 정해지면
다시 결정**한다(iPad 에서는 아이폰 호환 모드로 돈다).
