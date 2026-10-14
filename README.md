# 기억온 (GiEok-On)

> 📌 **2026-09-23 기획 변경을 반영했다.** "무엇을 만들지"의 SoT =
> [`docs/plans/pilot-development-plan.md`](docs/plans/pilot-development-plan.md) · 프로젝트 메모리 = [`AGENTS.md`](AGENTS.md).

> **AI 가 어르신 한 분의 인생사에 맞춘 회상 대화(인지활동 프로그램)를 진행하고, 그 대화가 공단 형식
> 프로그램 일지 초안으로 자동으로 남는 도구.** 요양보호사는 계획하고 감독하며 확인한다.
> 보호자는 어르신이 나눈 이야기를 받아 본다.

의료·치료 효과를 단정하지 않는다(비의료 포지셔닝 — [`docs/compliance.md`](docs/compliance.md) §3).
**AI 산출물은 사람이 확인하기 전에는 공식 기록도, 보호자에게 가는 글도 되지 않는다.**

- **팀:** 리마인드 (임성훈(기획·개발) · 박진우(개발·영업) · 고서연(UI/UX·프론트엔드 디자인))
- **현재 목표:** **파일럿** — 1기관 · 기기 2~4대 · 요양원 + 주간보호. 정식 출시가 아니다.

---

## 핵심 흐름

```
[설계]  요양보호사가 세션 설계(주제 · 피할 주제 · 목표 시간)를 확인한다
[진행]  기기 N대에서 1:1 세션 병렬 진행 — AI 가 대화하고, 요양보호사는 감독 화면으로 지켜본다
        위기 발화 → 즉시 중단 + 요양보호사 휴대폰 푸시
[기록]  세션 종료 → 분석 → 프로그램 일지 초안 자동 생성 (확인 대기)
[확정]  요양보호사·사회복지사가 확인·수정·확정 — 서버는 확정을 쓸 수 없다
[공유]  공개를 고르면 보호자 웹 "오늘의 이야기"에 보호자용 문장만 나간다
```

판단이 애매할 때의 기준 셋: ① 기존 ERP(케어포·엔젤시스템·이지케어)가 하는 기능은 만들지 않는다 ·
② AI 산출물이 사람 확인 없이 공식 기록이 되거나 보호자에게 가는 경로는 막는다(테스트로 검증) ·
③ 제공 횟수·기록 품질·시간 절감을 측정할 이벤트를 1주차부터 남긴다.

---

## 아키텍처 (개요)

pnpm 모노레포, 워크스페이스 7개. 웹·모바일은 UI 를 공유하지 않고 도메인 로직·데이터·디자인 토큰만 공유한다.

```
giokon/
├─ apps/
│  ├─ web/          # 요양보호사 웹 + 보호자 웹 (React 19 + Vite + Tailwind)
│  ├─ mobile/       # 세션 진행 앱 — 요양보호사 모드 + 어르신 표시 모드 (Expo SDK 54 + NativeWind)
│  └─ voice-relay/  # 음성 중계 서버 (Node + ws, Docker)
├─ packages/
│  ├─ core/         # 도메인 타입 · 안전 계층(safety) · 프롬프트 · 생성문 검증 · 분석
│  ├─ data/         # supabase-js · TanStack Query 훅 · Realtime · Supabase Auth
│  └─ theme/        # 디자인 토큰 — 웹 Tailwind + 모바일 NativeWind 공용
├─ supabase/        # 마이그레이션 · RLS · Edge Functions · RLS 회귀 테스트
└─ docs/            # 기획·설계·런북
```

**데이터·인증:** 클라이언트가 supabase-js 로 Supabase 에 직접 연동하고 RLS 로 격리한다. 격리 단위는
**기관 + 역할**(요양보호사·사회복지사·센터장·기관 관리자)이다. 배정은 알림·내 담당 표시와 일부 삭제 권한에 사용한다.
보호자는 공개된 항목만 본다. 비밀 키는 Edge Function·중계 서버에만 둔다.

**음성:** 앱 → `voice-relay` → Gemini Live → 출력 검증(`screenAiUtterance`) → Gemini 3.8 Flash TTS → 앱. Gemini Live가 만든
오디오 원본은 어르신에게 전달하지 않는다. 앱이 Gemini 에 직접 붙는 경로는 **폐기**한다.

| 영역 | 기술 |
|---|---|
| 웹 | React 19 + Vite + Tailwind CSS (요양보호사 · 보호자) |
| 모바일 앱 | Expo SDK 54 (React Native 0.81) + NativeWind |
| 음성 중계 | Node + ws (Docker → Google Cloud Run 서울, 운영 배포 대기) |
| 공유 로직/상태 | TypeScript + Zustand + TanStack Query |
| 데이터·인증 | Supabase 서울 (PostgreSQL · Auth · Storage · Realtime · Edge Functions) |
| 대화 AI | Gemini Live `gemini-3.8-live` — 모델은 서버 시크릿 `GEMINI_LIVE_MODEL` 로만 바꾼다 |
| 음성 출력 | Gemini `gemini-3.8-flash-tts` (검증된 문장만) |
| 푸시 | Expo Push (코드·워커 준비, FCM/APNs·실기기 수신 검증 대기) |
| 디자인 | 웹 = Figma 단독 기준 |
| 배포 | 웹: Vercel · 모바일: EAS Build |

---

## 파일럿 범위

- ✅ **포함**: 프로그램 일지 자동 생성 · 분석 → 일지 매핑 · 감독 화면(웹 반응형) · 안전 이벤트 푸시 ·
  대화 정책(도입 → 회상 → 마무리·의견수렴) · 권한 재설계(기관 단위 + 역할) · 고령자 UI(어르신 표시 모드)
- ⏭️ **범위 밖**: 카카오 알림톡 · ERP 연동/붙여넣기 복사 · 월간 계획표 · 현황판 · "평소와 다름" 플래그 ·
  보호자 연대기 소재 · 보호자 → 요양보호사 메시지(동결 — 제거 아님)
- 상세: [`docs/requirements.md`](docs/requirements.md) · [`docs/design.md`](docs/design.md)

---

## 개발 (개략)

```bash
pnpm install
pnpm install --filter @giokon/voice-relay   # ⚠️ --prefer-offline 설치는 중계 의존성을 만들지 않는다
pnpm web                                     # 웹 개발 서버

# 검증 게이트
pnpm -r typecheck && pnpm -r lint && pnpm -r test
pnpm check:bom && pnpm check:font && pnpm check:figma && pnpm check:copy
bash supabase/tests/run-rls-regression.sh    # RLS 회귀 (PostgreSQL 16 실기동)
```

환경변수: 클라이언트는 공개 값만 쓴다 — 웹 `VITE_SUPABASE_URL`·`VITE_SUPABASE_PUBLISHABLE_KEY`, 앱
`EXPO_PUBLIC_SUPABASE_*`·**`EXPO_PUBLIC_VOICE_RELAY_URL`(파일럿에서 필수)**. ⚠️ `EXPO_PUBLIC_*` 는 앱 번들에 들어가
**공개된다** — 비밀 값을 넣지 않는다. 서버 비밀(`GEMINI_API_KEY`·`GEMINI_LIVE_MODEL`·`VOICE_RELAY_SECRET`·`NAVER_*`)은
Supabase secrets 와 중계 서버 환경에만 둔다. 실제 키는 커밋하지 않는다(`.env` 는 gitignore).

---

## 엔터프라이즈·컴플라이언스 (2026-07-03 목표 상향)

출시 즉시 상용 서비스 + 깐깐한 정부심사 통과·초과를 목표로, **데이터 국내 보관(Supabase 서울 리전)** · 엔터프라이즈 보안(암호화·조직 RBAC·감사로그·침투테스트) · 개인정보(민감정보 별도동의·대리동의) · **비의료 포지셔닝** · AI 안전(위기 에스컬레이션·투명성) · **KWCAG 접근성** · 멀티테넌시(기관 단위)를 신규 트랙 **M9–M15**(PLAN §2′)로 추진한다. 웹·앱 프론트는 외부 협력 업체와 별개로 **Claude Design**으로도 직접 구현해 비교한다.

| 문서 | 내용 |
|---|---|
| [`docs/compliance.md`](./docs/compliance.md) | 개인정보(PIPA)·동의·대리동의·SaMD 비의료·PIA/CPO |
| [`docs/security.md`](./docs/security.md) | 안전성확보조치·암호화·RBAC·감사로그 + 인프라(리전·백업·SLO·비용) |
| [`docs/ai-safety.md`](./docs/ai-safety.md) | 위기 에스컬레이션·가드레일·투명성(AI기본법) |
| [`docs/accessibility.md`](./docs/accessibility.md) | KWCAG 2.2·인증·자동/수동 테스트 |

---

## 문서

| 문서 | 내용 |
|---|---|
| [`docs/plans/pilot-development-plan.md`](./docs/plans/pilot-development-plan.md) | **파일럿 개발 계획 — "무엇을 만들지"의 SoT** (DB · 앱 · 웹 · 연동 파트) |
| [`AGENTS.md`](./AGENTS.md) | 프로젝트 메모리 — 작업 방침 · 기술 결정 · 현재 위치 |
| [`docs/plans/launch-checklist.md`](./docs/plans/launch-checklist.md) | 출시 점검표 — 파일럿 → 정식 출시 |
| [`docs/new-hire/`](./docs/new-hire/README.md) | 새로 합류한 사람을 위한 쉬운 설명 |
| [`PLAN.md`](./PLAN.md) | 전체 개발 계획 (모듈 설계 · 태스크 · 마일스톤) |
| [`docs/product.md`](./docs/product.md) | 제품 개요 · 문제 정의 · 타깃 · 비즈니스 모델 |
| [`docs/requirements.md`](./docs/requirements.md) | 파일럿 요구사항(`PF-`·`PN-`) |
| [`docs/design.md`](./docs/design.md) | 파일럿 화면 설계(`SCR-08·09`·`SCR-W12·W15~W21`) + 지금 있는 웹 화면 |
| [`docs/structure.md`](./docs/structure.md) | 구조 · 역할·권한 · 모듈 · 기술 기준 |
| [`docs/database.md`](./docs/database.md) | Supabase 스키마 · 인증/접근 모델 |
| [`docs/tasks.md`](./docs/tasks.md) | 작업 목록 — 파일럿 트랙 + 완료 색인 |
