# 기억온 (GiEok-On)

> 요양보호사가 입력한 어르신 연대기를 바탕으로 AI가 회상 대화를 돕고 세션 기록을 자동으로 남기는 **AI 기반 인지활동 보조 앱**.

기억온은 요양보호사가 어르신의 생애 정보(연대기)를 입력하면, LLM·TTS·STT 기반 AI가 어르신과 1:1 음성 회상 대화를 진행하고 세션 결과를 자동 저장한다. 의료·치료 효과를 단정하지 않으며, **회상 대화와 기록 보조**가 핵심 가치다.

- **팀:** 리마인드 (팀장 임성훈 · 팀원 이도은, 예병성)
- **상세 계획:** [`PLAN.md`](./PLAN.md) · **설계 문서:** [`docs/`](./docs)

---

## 핵심 가치

1. **요양보호사의 손이 닿지 못하는 시간을 AI가 채운다** — 연대기를 입력하면 그 이후 AI가 어르신과 대화를 이어간다.
2. **어르신의 실제 삶에 기반한 개인화 대화** — 출신지·직업·가족·주요 기억을 바탕으로 질문을 생성한다.
3. **세션 로그 자동 저장으로 기록 부담 제거** — 대화 전문이 자동 저장되어 수기 기록이 필요 없다.

---

## 아키텍처 (개요)

웹+모바일 하이브리드 **모노레포**. 웹은 요양보호사 관리 화면, 모바일은 어르신 대화 화면을 담당하고, 로직·데이터·디자인 토큰은 공유 패키지로 묶는다.

```
giokon/
├─ apps/
│  ├─ web/        # 요양보호사 관리 웹 (React + Vite + Tailwind)
│  └─ mobile/     # 어르신 대화 앱 (Expo / React Native + NativeWind)
├─ packages/
│  ├─ core/       # 도메인 타입 · Zustand 스토어 · AI 인터페이스(+목업) · 도메인 규칙
│  ├─ data/       # supabase-js 클라이언트 · 데이터 액세스 · Supabase Auth
│  └─ theme/      # 디자인 토큰(색·타이포·간격) — 웹 Tailwind + 모바일 NativeWind 공용
├─ supabase/      # 마이그레이션 · Edge Functions(AI/STT/TTS) · Storage 정책
└─ docs/          # 기획·설계 문서
```

**데이터/인증 흐름:** 클라이언트(웹·모바일)가 **supabase-js로 Supabase에 직접 연동**하고, **Supabase Auth + RLS(`auth.uid()`)** 로 소유자별 데이터를 격리한다. AI/STT/TTS처럼 API 키 보호가 필요한 부분만 **Supabase Edge Functions** 가 담당한다. (별도 Node/Express 서버·Firebase 미사용)

| 영역 | 기술 |
|---|---|
| 관리자 웹 | React 19 + Vite + Tailwind CSS |
| 모바일 앱 | Expo (React Native) + NativeWind |
| 공유 로직/상태 | TypeScript + Zustand (`packages/core`) |
| 데이터·인증 | Supabase (PostgreSQL · Auth · Storage · Edge Functions) |
| LLM / STT / TTS | 현행 프런티어 LLM / gpt-4o-transcribe / Clova Voice (Edge Functions에서 호출) |
| 디자인 | Figma 핸드오프 → 디자인 토큰 단일 소스 |
| 배포 | 웹: Vercel · 모바일: EAS Build/Submit |

---

## v1 범위

**핵심 루프**에 집중한다.

- ✅ 포함: 요양보호사 로그인, 어르신 연대기 등록/수정, 세션 시작, 음성 대화(TTS·STT), STT 수정, 세션 종료, 세션 로그 조회 — **관리는 웹, 어르신 대화는 모바일**.
- ⏭️ v2 이후: 보호자 화면, 아바타 꾸미기, 음악·미술·인지자극 모듈, 기관 어드민, 수익화.

접근성 제약(어르신 화면): 텍스트 ≥18pt, 마이크 버튼 ≥60px, AI 질문 TTS 자동 재생, 조작 최소화.

---

## 개발 (개략)

> 모노레포 전환은 진행 중이다. 현재 시연용 웹 프로토타입은 [`frontend/`](./frontend)에 있다(향후 `apps/web`로 이전 예정). 단계별 작업은 [`docs/tasks.md`](./docs/tasks.md), 전체 계획은 [`PLAN.md`](./PLAN.md) 참고.

```bash
# 현재 프로토타입 (frontend/)
cd frontend
npm install
npm run dev      # http://localhost:5173 (Chrome/Edge 권장 — 음성 기능)
```

환경변수(예정): 클라이언트는 `SUPABASE_URL` + `SUPABASE_ANON_KEY`, Edge Functions는 `SUPABASE_SERVICE_ROLE_KEY` 및 provider 키(OpenAI/Clova)를 secrets로 관리한다. 실제 키는 커밋하지 않는다.

---

## 엔터프라이즈·컴플라이언스 (2026-07-03 목표 상향)

출시 즉시 상용 서비스 + 깐깐한 정부심사 통과·초과를 목표로, **데이터 국내 보관(Supabase 서울 리전)** · 엔터프라이즈 보안(암호화·조직 RBAC·감사로그·침투테스트) · 개인정보(민감정보 별도동의·대리동의) · **비의료 포지셔닝** · AI 안전(위기 에스컬레이션·투명성) · **KWCAG 접근성** · 멀티테넌시(기관 단위)를 신규 트랙 **M9–M15**(PLAN §2′)로 추진한다. 웹·앱 프론트는 외부 협력 업체와 별개로 **Claude Design**으로도 직접 구현해 비교한다.

| 문서 | 내용 |
|---|---|
| [`docs/compliance.md`](./docs/compliance.md) | 개인정보(PIPA)·동의·대리동의·SaMD 비의료·PIA/CPO |
| [`docs/security.md`](./docs/security.md) | 안전성확보조치·암호화·RBAC·감사로그·pentest·ISMS-P |
| [`docs/infrastructure.md`](./docs/infrastructure.md) | 리전·풀링·부하·백업/DR·SLO·비용 |
| [`docs/ai-safety.md`](./docs/ai-safety.md) | 위기 에스컬레이션·가드레일·투명성(AI기본법) |
| [`docs/accessibility.md`](./docs/accessibility.md) | KWCAG 2.2·인증·자동/수동 테스트 |

---

## 문서

| 문서 | 내용 |
|---|---|
| [`PLAN.md`](./PLAN.md) | 전체 개발 계획 (모듈 설계 · 태스크 · 마일스톤) |
| [`docs/product.md`](./docs/product.md) | 제품 개요 · 문제 정의 · 타깃 · 비즈니스 모델 |
| [`docs/requirements.md`](./docs/requirements.md) | 기능/비기능 요구사항 (MoSCoW) |
| [`docs/design.md`](./docs/design.md) | 화면·API·데이터·오류·상태 설계 |
| [`docs/structure.md`](./docs/structure.md) | 서비스 구조 · 폴더 구조 · 엔티티 관계 |
| [`docs/tech.md`](./docs/tech.md) | 기술 스택 · 외부 API · 배포 |
| [`docs/database.md`](./docs/database.md) | Supabase 스키마 · 인증/접근 모델 |
| [`docs/tasks.md`](./docs/tasks.md) | 모듈·Phase 기반 작업 분해 |
