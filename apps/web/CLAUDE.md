# apps/web — 요양보호사·보호자 관리 웹 (작업 지침)

웹(`apps/web`) 파일을 건드리면 자동으로 함께 읽히는 메모리다. 루트 `CLAUDE.md`와 함께 적용되며,
충돌 시 더 구체적인 이 문서를 따른다.

## 0. 이 앱의 경계

- **요양보호사·기관 관리자·보호자용 관리 웹**. React 19 + Vite + Tailwind v3.4 + react-router 7 +
  TanStack Query + Zustand.
- **어르신 음성 대화(TTS/STT) 화면은 없다** — 모바일 앱(`apps/mobile`) 담당. 웹에 대화 화면을 만드는
  방향은 아키텍처 확정 사항에 반한다.
- 백엔드는 앱과 공용: 도메인 `@giokon/core`, 데이터·인증 `@giokon/data`, 토큰 `@giokon/theme`.
  도메인 규칙을 웹에서 새로 구현하지 말고 core 를 쓴다.

## 1. ⛔ 디자인 기준 = 신규 Figma **단독**

- **SoT**: Figma `4iU6Zw4MhLAMZWlnPFgsCI` "기억온 웹" (1440px 데스크톱, 화면 48종).
  화면↔노드 맵·절차는 **`docs/runbooks/figma-web-extraction.md`**.
- **렌더 에셋**: `apps/web/assets/figma/*.png`(화면) · `components/*.png`(모달·부품).
  컨테이너에서 `www.figma.com` 이 막히므로 **눈 대조는 이 PNG 로** 한다.
- **구 디자인(2026-08 이전)은 폐기**됐다. 구 스펙 문서(`docs/require/기억온_웹_디자인.md`)는 삭제됐고,
  구 화면·구 토큰·구 카피를 근거로 삼지 않는다. git 이력에만 남는다.
- 새 디자인에 **없는 기능은 제거**하고, **있는 기능은 추가**한다. 임의 재디자인은 하지 않는다.
- **검사 2단**:
  - `pnpm check:design` — 소스 정규식 상시 게이트(브라우저 없이 빠르게, CI 포함).
  - `pnpm check:figma-web` — **DOM 좌표 + 잉크 위치를 Figma 와 ±1.5px 로 대조**(Chromium + export PNG).
    재는 요소에 `data-fx="<노드id>"` 를 달고 `apps/web/scripts/figma-audit.spec.mjs` 에 실측을 적는다.
- 화면을 옮길 때마다 두 표에 항목을 추가한다(런북 §절차).
- ⚠️ **좌표 함정**(런북 §좌표 함정): `get_metadata` 의 텍스트 `h` 는 라인박스가 아니다 ·
  반전/회전 노드는 metadata 좌표가 렌더 위치가 아니다 · Figma 는 lineHeight 를 대부분 auto(≈1.2)로
  두므로 토큰 기본 라인높이(28/30/35)를 쓰면 **잉크가 2~3px 내려간다** → 실측 `leading-[…]` 명시.

### 자리표시자 금지(실서비스 원칙)
Figma 의 어르신 이름(김복순 등)·수치·예시 분석문은 **데모 값**이다. 실데이터에 바인딩하고, 근거가
없으면 값을 만들지 말고 `null`/빈 배열 → 빈 상태 문구로 표시한다. `0`(관찰 0회)과 `null`(측정 불가)을 구분한다.

## 2. 기능 델타 (구현 시 기준)

**제거** — 새 디자인에 없다
- **AI 도우미(AgentPanel)** — 사람 간 메시지가 대체. `core/agent.ts` 포함 제거.
- **세션 활동 종류**(회상 대화/인지자극/옛 노래/풍경) — 세션 설계에서 사라짐(`therapyType` 폐기).
- **시연·프로토타입 안내** — 랜딩 "프로토타입" 배지, 대시보드 태블릿 권장 카드.

**추가** — 백엔드까지 구현
- **TopBar**: 워드마크 · 어르신 검색 · 알림 벨(배지) · 사용자 메뉴 드롭다운.
- **알림**(완료 — `notifications` + 트리거 파생. 전용 알림 화면은 디자인에 없어 **탑바 벨
  배지와 드롭다운까지**가 소비처다. 사람은 알림을 만들 수 없다: INSERT 정책 없음) /
  **메시지**(완료 — `messages`, 보호자 → 담당 요양보호사 **단방향** · append-only ·
  수신은 알림으로. ⚠️ **작성 폼은 Figma 에 없다** — 시안은 이용 안내 모달까지만 그렸다) /
  **공유 사진**(요양일지 첨부 사진을 날짜순 갤러리로 보호자 공개 — **웹에서만 업로드**, 완료) /
  **보호자 확인(읽음)** + 확인 알림 토글(완료 — `guardian_shares.viewed_at`/`view_count`/
  `notify_on_view` + 서버 함수 `mark_share_viewed`) / **항목 단위 공개**(완료).
- **보호자도 사이드바 다중 페이지**(어르신 연결 · 공개된 소식 · 분석 · 설정).
- **문의사항 게시판**(2026-09-02 신설, **Figma 에 없는 사용자 승인 기능**): `/inquiries` 목록·
  등록·수정 + 운영자 답변. `users.is_site_admin` 이 운영자다(스스로 못 켠다 — 트리거가 막는다).
  ⛔ **비공개 규약**: 비공개 문의의 **제목·작성자·본문**은 작성자와 운영자만 본다.
  목록은 `security definer` 함수 `list_inquiries()` 가 판정해 잠금 문구로 바꿔 보내고
  (`locked`), 본문은 RLS 가 막는다(anon 은 테이블 권한 자체가 없다). **화면에서 다시 판정하지
  말고 서버가 준 값을 그대로 쓴다.** 회귀는 `rls_regression.sql` §5.12.
- **`/privacy`·`/terms` 단독 라우트**(2026-09-02 확정). 공개 화면 하단 `PublicFooter` 가 두 곳을
  가리킨다. 법인명·보호책임자·수탁자는 **미확정이라 적지 않는다**.
- **이용안내는 법률 전문을 담지 않는다**(2026-09-03 "C안" 확정). Figma `1:17` 은 처리방침·약관
  전문을 이 화면에 넣어 뒀지만 단독 페이지로 분리되면서 중복이라 **내용을 웹·앱 사용 흐름
  안내로 교체**했다. ⛔ **치수·색·타이포·좌표 체계는 Figma `1:17` 그대로**다 — `GuidePage.tsx`
  상단 상수(`CARD_X` 118 · `CARD_W` 1204 · `COL_X` 190 · `COL_W` 1055 · `TITLE_DY` 71 ·
  `LEAD_DY` 120.32 · `FIRST_DY` 218 · `CARD_PAD_B` 71 · `CARD_GAP` 72)가 그 실측이고
  `check:design` 이 고정한다. 카드 높이와 2·3번 카드의 y 는 **내용에서 계산**되므로
  `figma-audit.spec.mjs` 의 해당 프로브는 어느 쪽이 Figma 실측이고 어느 쪽이 파생인지
  주석으로 갈라 뒀다(파생 y 는 잉크 대조가 불가능해 `acceptInk`).

**디자인에 더해서 살리는 것**(사용자 확정): 동의 모달의 **의사능력 기록·대리동의(성년후견인/가족
보호자)·법적 한계 고지** — 컴플라이언스 근거라 유지한다.

## 3. 상태·데이터 규칙

- **서버 상태 = TanStack Query**(`@giokon/data` 훅), **UI 상태 = Zustand**. 서버 데이터를 스토어에 복제하지 않는다.
- **Supabase 미설정(.env 없음)에서도 앱은 떠야 한다.** `useAuth().isConfigured` 로 분기해 훅을
  `enabled: isConfigured` 로 끄고 안내를 렌더한다. 이 폴백을 깨지 말 것.
- 앱↔웹 실시간은 `useGiokonRealtime`(sessions·session_analyses·guardian_shares·safety_events·
  profiles·chronicle_entries·session_logs·notifications·messages).
- 어르신 접근은 **배정 모델**(`profile_caregivers`) + **영속 어르신 코드**(`elder_codes`).
- **세션 상태 3종을 구분한다**: `planned`(웹에서 설계, 아직 일어나지 않음) · `active`(앱에서
  진행 중) · `ended`(끝남). "대화 이력"·"대화 분석 목록" 에 `planned` 를 세우지 않는다
  (분석은 `ended` 에만 있다). 앱은 `planned` 를 받아 그대로 진행하고, 시작할 때 **그 행을
  active 로 바꾼다**(새로 만들면 설계가 유령으로 남는다).
- RLS 가 최종 방어선이다. 화면에서 감추는 것으로 접근통제를 대신하지 않는다.

## 4. 카피 · 컴플라이언스 (CI 강제)

- **비의료**: "치료·진단·완치·처방·치매 예방·인지 개선" 금지. `pnpm check:copy` 가 강제한다.
- ⚠️ **분석 화면의 "인지 효과 분석"·"향상률·증가율"·"향상/하락"·"매우 긍정적" 은 시안 그대로
  둔다**(사용자 확정 2026-09-01 — 모바일이 이미 같은 문구로 나가 있어 맞춘다). 화면 하단
  관찰 지표 고지로 보완한다. 이 문구들을 "관찰 언어" 로 되돌리지 말 것.
  단, **값과 라벨은 일치해야 한다**: 견줄 근거가 없으면 방향 낱말을 띄우지 않고 `—`,
  시안이 그리지 않은 상태(부정 평가 등)의 문구는 지어내지 않는다.
- ⚠️ 다만 **재는 것이 다른 라벨은 시안을 따르지 않는다**: 대화 분석의 감정 막대는 우리가
  '긍정/보통/부정' 을 재지 않고 **말투 묶음**을 세므로 시안 라벨을 쓰면 없는 측정을 있다고
  말하게 된다(자리표시자 금지 원칙). `components/analysis-session.tsx` 참조.
- **AI 투명성**: AI 생성물은 항상 표시. **안전장치 고지**: "키워드 기반 안전장치 — 의학적 판단이 아닙니다".
- **분석 하단 고지**: "대화에서 직접 관찰된 지표입니다(효능·향상 판정이 아닙니다)."
- 한글 가독성: 긴 문장에 `style={{ wordBreak: 'keep-all' }}`.
- ⛔ **네이티브 대화상자 금지**: `window.alert/confirm/prompt` 는 초점 가둠·스크린리더 이름이
  없어 `check:a11y` 가 보지도 못한다. 확인은 `ui/Dialog`, 알림은 `store` 의 `toast` 를 쓴다.

## 5. 접근성(KWCAG)

본문 바로가기 스킵 링크, 안전 알림 `role="alert" aria-live="assertive"`, 아이콘 버튼 `aria-label`,
포커스 링. 새 인터랙션에도 같은 기준을 적용한다.

- **`pnpm check:a11y`** 가 이관 완료 52화면 + 신규 공개 4화면에 axe(WCAG 2.1 A/AA)를 돌리고, axe 가 못 보는
  **모달 키보드 동작**(초점 진입·Tab 가둠·Esc)까지 본다. 모달을 새로 만들면
  `lib/modalA11y.ts` 의 `useModalA11y(open, onClose)` 를 쓰고 반환 ref 를 패널에 건다 —
  시안 치수를 직접 그리는 모달도 키보드 동작은 공유한다.
- 보이는 라벨이 없는 입력(시안이 안내문을 안 그린 검색 등)에는 `aria-label` 을 붙인다(렌더 무변화).
- ⚠️ **명도대비는 시안이 정한 색이라 코드가 임의로 바꾸지 않는다.** 게이트는 미달 색 쌍을
  표로 보고만 하고 실패시키지 않는다. 현황·최소 보정값은 `docs/accessibility.md` §6.

## 6. 개발 · 검증

```bash
pnpm web                 # 개발 서버
pnpm web:preview         # 빌드 + 프리뷰
pnpm web:smoke           # 빌드 + 라우트 스모크(preview 를 스스로 띄우고 끔)
pnpm check:design        # ★ 신규 디자인 ↔ 구현 대조 (소스 정규식, 이관 완료 화면만)
pnpm check:figma-web     # ★★ Figma 좌표 ↔ 실제 렌더 정밀 대조 (DOM + 잉크, ±1.5px)
pnpm check:copy          # 비의료 카피 린트
pnpm check:a11y          # ★ axe(WCAG 2.1 A/AA) 56화면 + 모달 키보드 동작
pnpm check:web           # typecheck → lint → copy → design → build → smoke
```

## 7. 환경 주의점

- **Pretendard 는 자체 호스팅**한다(`assets/fonts/Pretendard-1.3.9`, `index.css` 의 `@font-face`).
  jsdelivr CDN 은 컨테이너에서 막혀 있어 쓰지 않는다.
- `*.supabase.co` 도 막혀 있다 → 컨테이너에서는 목업 모드로 뜬다.
- `.env` 는 커밋 금지. 원격 세션은 `.claude/hooks/session-start.sh` 가 환경변수로 생성한다.
