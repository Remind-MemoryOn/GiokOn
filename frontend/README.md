# 기억온 (GiEok-On) — 시연용 프로토타입

요양보호사가 어르신의 연대기를 입력하고, AI가 어르신과 1:1 음성 회상 대화를 진행하며, 대화에서 새 연대기를 자동으로 축적하는 인지활동 보조 플랫폼의 **시연용 프로토타입**입니다.

## 실행

```bash
npm install
npm run dev
```

`http://localhost:5173` 접속. **Chrome 또는 Edge 권장** (음성 인식이 브라우저 기능에 의존).

## 프로토타입 범위

이번 학기 워크북의 **Must 4기능을 모두 시연**할 수 있도록 만들었습니다.

| Must 기능 | 본 서비스 구현 | 프로토타입 구현 |
|---|---|---|
| 1. AI 대화 기반 연대기 자동 축적 | GPT-4o가 의미 추출 | 키워드 규칙 기반 추출 (`src/lib/ai.ts`) |
| 2. AI 회상 대화 자동 진행 | GPT-4o JSON 응답 | 연대기·이력 기반 템플릿 응답 |
| 3. 요양보호사 세션 설계 화면 | React + REST API | 단일 페이지 React + localStorage |
| 4. 대화 세션 기록 자동 저장 | PostgreSQL | localStorage (Zustand persist) |

| 본 서비스 | 프로토타입 |
|---|---|
| Clova Voice TTS | 브라우저 `speechSynthesis` (한국어) |
| Whisper / Clova Speech STT | 브라우저 `SpeechRecognition` (한국어) |
| Supabase Auth | 단일 사용자 시연 — 인증 생략 |
| Supabase (직접연동 + Edge Functions) | 없음 (모두 클라이언트 측에서 동작) |

> 핵심 비즈니스 로직(연대기 → 질문 생성, 대화 → 연대기 추출)은 `src/lib/ai.ts` 한 파일에 격리되어 있어, 본 서비스 구축 시 이 파일만 GPT-4o API 호출로 교체하면 됩니다.

## 시연 시나리오 (3분)

1. **대시보드** (`/`) — 첫 진입 시 3명의 시연용 어르신 (이순자/김복례/박정환)과 세션이 자동으로 시드됩니다.
2. **어르신 선택** — '이순자' 카드 클릭 → 상세 페이지로 이동.
3. **세션 시작** — '전주 시절 회상 세션'의 **시작** 버튼 클릭 → 어르신용 대화 화면으로 전환.
4. **AI 첫 질문 자동 재생** — 연대기(전주, 식당)가 반영된 질문이 음성으로 자동 재생됩니다.
5. **마이크 버튼 탭 → 답변** — 예: *"전주 시내에서 김치찌개 식당을 운영했어요. 단골 손님들이 많이 왔지요."* 라고 답변.
   - 답변 중 키워드("김치", "식당")가 감지되면 상단에 **"AI가 새 연대기를 모았어요"** 표시.
   - AI가 답변 내용을 인용하며 후속 질문 자동 생성 → TTS 재생.
6. **3~5턴 대화 반복.** 동일 주제 2회 후엔 AI가 자연스럽게 주제 전환.
7. **세션 종료** 버튼 → '대화 기록 보기' → 대화 전문 + **이번 대화에서 자동으로 모은 연대기 항목**을 확인.
8. **어르신 상세로 돌아오면** 연대기 목록에 `AI 자동` 배지로 새 항목이 추가되어 있음.

### 시연 시 주의

- 첫 진입 시 브라우저가 마이크 권한을 요청합니다. **허용** 필요.
- 일부 브라우저는 첫 페이지 로드 시 자동 재생이 차단될 수 있습니다. 그 경우 화면 하단 **음성 다시 듣기** 버튼이 표시됩니다.
- 마이크 사용이 어려운 환경에서는 **음성 대신 텍스트로 입력** 버튼으로 키보드 입력 가능.

## 파일 구조

```
src/
├── App.tsx                       # 라우터
├── main.tsx
├── index.css                     # Tailwind
├── types.ts                      # Session / ChronicleEntry / ConversationLog
├── lib/
│   ├── ai.ts                     # 🧠 LLM mock — GPT-4o로 교체할 자리
│   ├── speech.ts                 # Web Speech API (TTS + STT)
│   ├── seed.ts                   # 시연용 초기 데이터
│   └── utils.ts
├── store/
│   └── store.ts                  # Zustand + persist (localStorage)
├── components/
│   ├── Layout.tsx
│   ├── PageHeader.tsx
│   ├── ElderFormDialog.tsx       # 연대기 입력 폼
│   ├── SessionFormDialog.tsx     # 세션 설계 폼
│   ├── ChronicleView.tsx         # 연대기 조회/편집
│   └── ui/                       # Button / Card / Input / Dialog / Toast ...
└── pages/
    ├── DashboardPage.tsx
    ├── EldersPage.tsx
    ├── ElderDetailPage.tsx
    ├── ConversePage.tsx          # ★ 어르신 대화 화면
    ├── LogsPage.tsx
    └── LogDetailPage.tsx
```

## 본 서비스로의 이전

| 프로토타입 | 이전 작업 |
|---|---|
| `lib/ai.ts` 의 `generateOpener` / `generateReply` / `extractChronicle` | `packages/core`의 `AIProvider`로 이전 → 실연동은 Edge Function의 GPT-4o 호출. 시스템 프롬프트 + JSON 응답 포맷 그대로 사용 |
| `lib/speech.ts` | `SpeechProvider`로 추상화 → 웹은 Web Speech, 모바일은 Expo AV. 실 STT/TTS는 Edge Function(Whisper/Clova) |
| `store/store.ts` (Zustand) | `packages/core`로 이전, 영속화를 `packages/data`(supabase-js) 어댑터로 교체 |
| 모든 화면 컴포넌트 | 로직(core)은 공유, UI는 Figma 토큰 기반 재구성 (웹=`apps/web`, 어르신=`apps/mobile`) |

## 알려진 제약

- 브라우저 TTS 한국어 음성은 OS 기본 음성에 의존 — Windows 한국어 음성이 설치되어 있어야 자연스럽게 재생됨.
- localStorage 기반이므로 브라우저 시크릿 모드에서는 데이터가 유지되지 않음.
- 자동 연대기 추출은 키워드 규칙 기반이므로 본 서비스 LLM보다 추출 폭이 좁음.
