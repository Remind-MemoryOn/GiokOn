# @giokon/mobile — 어르신 대화 Expo 앱

요양보호사가 조작하는 **세션 실행 도구**. 요양보호사가 로그인 → 어르신 선택 →
(동의 확인) → 세션 시작 → 기기 전달 → **어르신 음성 회상 대화** → 종료 시
**AI 자동 요약·분석** → 저장. 어르신은 대화만 한다.

Figma 디자인(`nLfWkg2H7dFfDH1pehcH5I`, 19화면)에서 토큰·구조를 추출해 구현했다.

## 스택
- **Expo SDK 53** + **expo-router**(파일 기반 라우팅) + **NativeWind 4**(Tailwind).
- 상태: 서버상태 = TanStack Query(@giokon/data), UI/세션 런타임 = Zustand(`src/store/appStore.ts`).
- 백엔드는 **웹과 공용**(신규 도메인 로직 없음):
  - 대화 진행·안전 가드: `@giokon/core` `openConversation`/`respondToUserTurn`.
  - 종료 분석(비의료 관찰 지표): `@giokon/core` `analyzeSession`/`recommendNextTopics`.
  - 동의 게이팅: `@giokon/core` consent 카탈로그(`canStartElderSession`).
  - 데이터: `@giokon/data`(Supabase·TanStack Query) — 미설정 시 목업 스토어로 동작(웹과 동일).
- 음성: TTS = `expo-speech`(느린 속도). STT는 실연동(Edge Function) 전까지 모의(`src/lib/mockStt.ts`).
  `SpeechProvider` 계약(`src/lib/speech.ts`)은 Clova/gpt-4o-transcribe 교체 시 유지.

## 화면 (app/)
- 인증: `index`(스플래시) · `login`
- 환자: `main`(목록·검색) · `register` · `elder/[id]`(프로필/세션기록/종합분석 탭) · `chronicle/[id]`
- 대화: `session/start`(핸드오프+AI 고지) · `session/talk`(대화·위기배너) · `session/loading` · `session/correct`(STT 수정) · `session/saved`
- 기록·분석: `log/[id]`(전문) · `analysis/[logId]`(단일) · `observations`(관찰 지표) · `analytics`(전체) · `topics/[id]`(주제별)
- **컴플라이언스(Figma 미포함·필수)**: `consent/[id]`(동의 게이팅) · AI 이용 사전 고지 배너 · 위기 감지 요양보호사 배너.

## 비의료 락다운
사용자 노출 카피에 치료·진단·효과·향상 표현 금지(CI `pnpm check:copy`). Figma의
"인지 효과 분석 · 23% 향상"은 **관찰 지표**(참여도·응답률·발화량·주제 반응·활동량)로 순화했다.

## 개발
```bash
pnpm -F @giokon/mobile start        # Expo Dev Server (Expo Go/시뮬레이터)
pnpm -F @giokon/mobile typecheck    # tsc --noEmit
pnpm -F @giokon/mobile lint         # eslint
```
실 STT/TTS/LLM·Supabase 연동은 서울 리전 프로젝트 + 키가 있어야 한다.
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 설정 시
코드 변경 없이 실데이터로 전환된다(미설정 시 목업).
