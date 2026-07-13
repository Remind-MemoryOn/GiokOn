# 런북 — Figma 앱 디자인 코드 추출 → Expo 앱 반영

> **이 문서 하나로 새 세션이 앱 개발을 정확히 이어받도록** 만든 실행 지침이다.
> 새 세션에서: 이 파일을 읽고 → Figma 연결 확인 → 19화면 추출 → `apps/mobile`(Expo)에
> 반영. Figma MCP가 세션 시작 시 깨끗이 등록되므로 **새 세션에서 진행**한다.

---

## 0. 먼저 읽고 맥락 확보 (필수)
아래를 읽어 프로젝트 상태·아키텍처·제약을 파악한다. 이미 커밋된 최신 코드 기준.
- `CLAUDE.md` — 프로젝트 메모리(구조·작업방침·현재 위치·**앱·웹 아키텍처 확정**).
- `PLAN.md` §2′ (특히 **M16 분석 · M17 보호자 커밋 · M18 AI 에이전트** 및 실행 순서).
- `docs/product.md` 상단 — **확정 아키텍처**(앱=세션 실행 / 웹=관리·분석 허브·커밋 / 보호자=커밋 열람).
- `docs/tasks.md` §3-3 — 앱(Expo) 프론트 작업 분해(T-APP1~3)·M16~M18.
- `docs/ai-safety.md` — 노인 특화 대화 안전 설계(앱 대화·위기 배너에 반영).
- `docs/compliance.md` §5 — 동의·비의료 락다운(앱 카피·동의 화면에 반영).

### 확정 아키텍처 요약
- **앱(Expo)** = **요양보호사가 조작**하는 세션 실행 도구. 환자(어르신)는 **대화만** 한다.
  로그인 → 환자 선택 → 세션 생성(주제 직접 설정 or **AI 자동 추천**) → 기기 전달 →
  **환자 음성 대화(TTS/STT)** → 종료 시 **AI 자동 요약·분석**(호응 좋았던/저조했던 주제 등) → 저장.
- **웹** = 관리·분석 허브(Realtime 조회·세션 설계·보호자 공유 커밋·AI 에이전트). *(이미 개발됨)*
- **백엔드는 앱·웹 공용**: `packages/core`(안전엔진 8상황 분류·프롬프트·`analysis` 분석/요약·`consent`),
  `packages/data`(Supabase 훅), `supabase/migrations`(RLS·멀티테넌시). **앱은 프론트만 신규.**

### 절대 제약
1. **비의료 포지셔닝 락다운**: 사용자 노출 카피에 "치료·진단·효과·향상·개선" 금지.
   Figma의 "**인지효과분석 · 23% 향상**" 류는 **관찰 지표로 순화**한다
   (참여도·응답률·발화량 추이·주제별 반응·관심 주제 변화). 레이아웃은 살리고 라벨·문구만 교체.
   CI 린트 `pnpm check:copy`가 강제하므로 통과해야 한다.
2. **커밋은 `main` 직접**, 비밀키 커밋 금지.
3. **검증 게이트**: `pnpm -r typecheck` · `lint` · `test` · `build` + `pnpm check:copy` 통과.
4. Figma에 **없지만 반드시 추가할 화면**: 동의 수집·게이팅(민감정보·국외이전·AI 고지 — `core/consent` 사용),
   AI 이용 사전 고지(대화 화면 상시), 위기 감지 시 요양보호사 배너(`core` `respondToUserTurn`의 `caregiverAlert`/`escalate` 사용).

---

## 1. Figma 연결 확인
1. Figma MCP 도구 로드: `ToolSearch` → `select:mcp__Figma__whoami,mcp__Figma__get_metadata,mcp__Figma__get_screenshot,mcp__Figma__get_design_context,mcp__Figma__get_variable_defs`
2. `mcp__Figma__whoami` 로 인증 확인(계정: 임성훈, dlatjdgns513@gmail.com / 팀: Lim H의 팀).
3. 안 붙으면: 이 대화에서 Figma 커넥터 OFF→ON. 그래도 안 되면 세션 재시작.

**파일**: `fileKey = nLfWkg2H7dFfDH1pehcH5I` (이름: 기억온)
URL: `https://www.figma.com/design/nLfWkg2H7dFfDH1pehcH5I/기억온?node-id=0-1`

---

## 2. 화면 인벤토리 (19화면 — node-id 확보 완료, 재탐색 불필요)
전부 **393px 모바일 프레임**. 요양보호사 앱 + 어르신 대화 화면 혼재.

| 흐름 | node-id | 화면 | 크기 |
|---|---|---|---|
| 인증 | `130:162` | 스플래쉬("AI 맞춤형 회상 대화 플랫폼", 간편 계정 연결) | 393×852 |
| 인증 | `130:161` | 로그인(로그인·아이디/비번 찾기·회원가입) | 393×852 |
| 환자 관리 | `6:50` | **메인 화면**(요양보호사 인사 + 환자 목록[사진·나이·최근 대화] + 환자 등록·전체 분석) | 393×1291 |
| 환자 관리 | `56:337` | 어르신 등록(이름·출생연도·출신지·가족·직업·취미) | 393×1200 |
| 환자 관리 | `15:7` | 어르신 프로필 기록(연대기 입력, 3/10 단계) | 393×1380 |
| 환자 관리 | `56:214` | 어르신 상세_프로필 | 393×950 |
| 환자 관리 | `75:177` | 어르신 상세_세션 기록(세션 목록) | 393×852 |
| 대화(어르신) | `15:165` | 대화 시작 전("어르신께 기기를 전달", 시작하기/취소) | 393×852 |
| 대화(어르신) | `17:108` | **대화**(AI 질문 말풍선 + 파형 + 큰 마이크 + "듣고 있어요" + 다시 듣기) | 393×852 |
| 대화(어르신) | `28:37` | 질문 로딩("곧 다음 질문을 들려드릴게요") | 393×852 |
| 대화(어르신) | `25:120` | 대화 수정("AI가 이렇게 이해했어요" — STT 확인·수정, 28/200) | 393×852 |
| 대화(어르신) | `28:79` | 대화 저장("오늘의 대화가 저장되었습니다") | 393×852 |
| 기록·분석 | `28:129` | 대화기록(전문·시간대별) | 393×1035 |
| 기록·분석 | `118:74` | 단일 대화 분석(핵심 요약·대화시간·횟수·응답률·감정) | 393×1035 |
| 기록·분석 | `134:94` | 개인 인지효과분석 ⚠️(→ **관찰 지표로 순화**: 참여·응답·발화량·주제 반응) | 393×1685 |
| 기록·분석 | `130:388` | 어르신 종합 분석(관심 주제 TOP5·대화 참여도) | 393×950 |
| 기록·분석 | `140:562` | 주제별 분석(관심 주제 변화·키워드) | 393×852 |
| 기록·분석 | `140:201` | 전체분석(총 환자·세션·평균 시간·응답률) | 393×915 |
| 기록·분석 | `144:201` | 전체 인지효과분석 ⚠️(→ 순화) | 393×1554 |

> 참고: 위 표는 이전 세션의 `get_metadata`(node `0:1`) 결과에서 확정. 컴포넌트(`64:461` Component 1
> = 환자 카드, `130:360`/`130:375` Component 7/8 등)도 함께 있으니 `get_design_context`로 확인.

### 확인된 디자인 언어(스크린샷 2장 기준 — 나머지는 추출로 확정)
- 배경 크림/웜톤, **주황 액센트**, 큰 라운드 카드, 상단 "GIEOK-ON" 워드마크.
- 메인: 환자 카드(원형 사진 + 이름/나이/성별 + "최근 대화 날짜" + 주황 화살표 버튼), 하단 "환자 등록"·"전체 분석".
- 대화: AI 질문 카드(로봇 아이콘) + 오디오 파형 + 대형 마이크 + "듣고 있어요…" + "다시 듣기".
- 기존 `packages/theme`·웹의 warm/cream/brand 팔레트와 유사 → 토큰 상당수 재사용 가능.

---

## 3. 추출 순서 (Figma → 코드)
1. **디자인 토큰**: `get_variable_defs`(fileKey, nodeId `0:1`) → 색·타이포·간격·라운드 변수.
   → `packages/theme`에 매핑(기존 토큰과 병합, 앱은 NativeWind에서 소비).
2. **화면별 구조·코드**: 각 node-id에 `get_design_context`(clientFrameworks=`react-native,expo`,
   clientLanguages=`typescript`) → 레이아웃·컴포넌트·스타일. 큰 결과는 파일로 저장 후 jq/python으로 슬라이스.
3. **비주얼 대조**: 필요 화면 `get_screenshot`(maxDimension≈500, `enableBase64Response:true` —
   컨테이너는 `*.figma.com` egress 차단이라 URL 다운로드 대신 base64 사용).
4. **에셋**: 아이콘·일러스트는 `download_assets`(또는 벡터는 코드로). 폰트 라이선스 확인.

---

## 4. 반영 (Expo 앱 빌드)
1. **스캐폴드**: `apps/mobile`을 Expo 앱으로. **React 19 호환 Expo SDK**(웹이 React 19라 워크스페이스
   정합 주의 — 필요 시 앱은 자체 React 버전 resolve). NativeWind + expo-router 권장. `packages/{core,data,theme}` 워크스페이스 의존.
2. **테마**: 추출 토큰 → `packages/theme` → 앱 `tailwind.config`(NativeWind)로 브리지.
3. **화면 구현**: §2 표 순서대로. 어르신 대화 화면은 **접근성 최우선**(큰 글자·큰 마이크·고대비).
4. **백엔드 재사용(신규 로직 금지, 기존 것 연결)**:
   - 대화 진행: `core` `openConversation`/`respondToUserTurn`(안전 가드 통합) + `SpeechProvider`(TTS/STT는 실연동 시 Clova/gpt-4o-transcribe provider).
   - 종료 후 분석: `core` `analyzeSession`/`recommendNextTopics`(비의료 관찰 지표) → `data` 훅으로 저장.
   - 세션·환자·동의: `data` 훅(`useProfiles`/`useSessions`/`useConsents`/`useRecordSafetyEvent` 등).
5. **추가 화면(Figma 미포함, 필수)**: 동의 수집·게이팅(`core/consent` `canStartElderSession`), AI 이용 사전 고지(`AI_DISCLOSURE`), 위기 배너(`caregiverAlert`/`escalate`).
6. **카피 순화**: "인지효과분석/효과/향상%" → 관찰 지표 라벨. `pnpm check:copy` 통과 필수.

---

## 5. 검증 & 마무리
- `pnpm -r typecheck` · `lint` · `test` · `build`(앱 포함) + `pnpm check:copy` 통과.
- 앱은 EAS/Expo Go로 실기 확인은 사용자 몫(시뮬레이터 없음). 코드·타입·린트는 세션에서 검증.
- 화면별 커밋(main 직접), 진행현황을 `PLAN.md` §8·`docs/tasks.md` §3-3에 갱신.
- 실 STT/TTS/LLM은 사용자 API 키 필요(그 전까지 mock provider로).

> ⚠️ 미확인 사항은 임의로 정하지 말고, **비주얼은 `get_screenshot`으로, 값은 `get_variable_defs`/
> `get_design_context`로 실제 디자인을 근거**로 반영한다. 디자인 원본을 못 볼 땐 추측 대신 사용자에게 확인.
