# 기억온 (GiokOn) — 프로젝트 메모리

요양보호사가 어르신 연대기를 입력하면 AI가 1:1 음성 회상 대화를 진행·기록하는
인지활동 보조 플랫폼. 상세 계획은 `PLAN.md`, 스펙은 `docs/`.

## 구조 (pnpm 모노레포)
- `apps/web` (@giokon/web): 요양보호사 관리 웹 (React 19 + Vite + Tailwind)
- `apps/mobile`: 어르신 대화 앱 (Expo, placeholder)
- `packages/core`: 도메인 타입·규칙·AIProvider(mock)·SpeechProvider
- `packages/data`: supabase-js + TanStack Query 훅 + Supabase Auth + DB↔도메인 매퍼
- `packages/theme`: 디자인 토큰(단일 소스)
- `supabase/migrations`: DB 스키마·RLS

## 작업 방침 (중요)
- **디자인은 외부 협력**: 웹·앱 모두 UI 디자인(비주얼·Figma·디자인 토큰·재스킨)은
  외부에서 진행. **사용자가 명시적으로 요청하기 전까지 디자인 작업은 하지 않는다.**
  기능·로직·데이터·인증 배선은 계속 진행(기존 컴포넌트/스타일 재사용).
- **커밋은 `main` 브랜치에 직접** (사용자 승인).
- 비밀키는 **커밋 금지**(`.env`는 gitignore). 원격 세션은 환경 설정 env +
  `.claude/hooks/session-start.sh`가 `.env` 자동 생성. 로컬 dev는 `apps/web/.env`
  수동 작성(`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`).
- 검증: `pnpm -r typecheck` · `lint` · `test` · `build`.

## 기술 결정
- 서버상태 = **TanStack Query**, UI상태 = **Zustand**.
- AI 스택: **LLM은 현행 프런티어 벤치마크 후 선정(모델명 고정 금지)**,
  STT = gpt-4o-transcribe(Clova Speech 보완), TTS = Clova Voice, **Structured Outputs**.
  실연동은 Supabase Edge Functions(서버사이드 키 보호).
- 인증 = Supabase Auth, 정체성 = `auth.uid()`, 전 테이블 RLS(`user_id = auth.uid()`).
- 배포: 웹 = Vercel, 모바일 = EAS.

## Supabase
- 프로젝트: **`GiokOn`** (ref `xilmtqnotomuyjifenmo`, ap-northeast-1).
- 마이그레이션 적용·검증 완료(5테이블·RLS·가입 트리거 `handle_new_user`→`public.users`).
- MCP 연결이 세션 내 **간헐적**(대략 턴당 1콜 성공 후 끊김) — 실패 시 재시도보다
  대시보드 SQL Editor 등 대안 사용.
- 컨테이너 아웃바운드는 egress 정책상 `*.supabase.co` 차단(브라우저/로컬은 정상).

## 현재 위치 (2026-07-02)
- Phase A 완료 · Phase B(DB/Auth) 라이브 적용·검증 완료 · M5.2(웹 Auth) 완료.
- **다음: T2.4** — 화면 ↔ 실 Supabase 데이터(어르신 CRUD 슬라이스부터).
  프로토타입 도메인 ↔ v1 스키마 불일치 주의(아바타 꾸미기·치료세션 템플릿 개념은
  v1 스키마에 없음 → 매퍼로 기본값 처리, 관련 UI는 v2/보류).
