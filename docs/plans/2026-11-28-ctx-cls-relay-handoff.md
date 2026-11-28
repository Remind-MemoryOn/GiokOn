# 전사 문맥 분류기 — 중계 연결 인계 자료 (CTX-CLS-S7 일부 · 2026-11-28)

> 대상: 음성 중계(`apps/voice-relay`) 담당 세션. 이 문서는 **연결 방법**을 넘긴다. 연결 자체는 하지 않았다.
> 정책·결정의 SoT 는 `docs/plans/2026-11-13-risk-emotion-detection.md`(§11.1 진리표 · §25.2 R1~R13)와
> `docs/plans/2026-11-15-ctx-cls-s6-db-design.md`(DB·Edge), 상태는 `docs/tasks.md` CTX-CLS-20261113 이다.
> 이 문서와 그 문서들이 다르면 그 문서들이 맞다.

## 0. 먼저 알아야 할 것

| 항목 | 상태 |
|---|---|
| 투입 게이트(R1) | **미통과.** 검증 자료(Claude 작성)에서 불필요 일시정지 6.7%(기준 ≤1%). 판정은 사람이 쓴 평가 자료로 한다(아직 없음). 승인자 = 사용자 단독(R9) |
| 그래서 | 연결 코드는 넣어도 되지만 **운영 값은 `CONTEXT_CLASSIFIER_MODE=off`**(R8). `enforce` 전환은 게이트 통과 + 사용자 승인 뒤. 그림자 운영은 없다(R10) |
| 추론 패키지 | `packages/context-classifier` — `main` 병합됨, 어디에서도 쓰지 않음 |
| 결합 정책 | `packages/core` `decideContextSafety` — `main` 병합됨, 중계에서 아직 부르지 않음 |
| DB | 마이그레이션 `20261115000000`·`20261115010000` 운영 적용됨(기존 중계·앱과 호환) |
| Edge `relay-review-pause` | 코드만 있음 — **배포 안 됨**(사용자) |
| 모델 파일 | ⚠️ **저장소 밖 — 지금은 학습한 원격 세션 컨테이너의 임시 폴더에만 있다.** §6 |

## 1. 바뀌지 않는 것 (연결해도 그대로)

- 규칙(`assessUtterance`)은 지금처럼 **전사 조각마다** 돈다. 위기·급성 고통 적중 = 즉시 종료, 휴식·거부 = 마무리 인사(D1).
- 분류기는 규칙 위에 **더한다(OR)**. 분류기 결과가 규칙 적중을 약하게 만들 수 없다 — `decideContextSafety` 가 보장하고 불변식 테스트가 있다.
- 개인 맥락(개인 표현 사전 등)은 분류기·정책 입력이 아니다.

## 2. 호출 시점과 입력 (R4)

- **어르신 턴 확정 때 1회.** 입력 = 직전 AI 질문 + 어르신 최근 1턴 + 이번 턴.

```ts
import { ClassifierWorker } from '@giokon/context-classifier'
const worker = new ClassifierWorker({
  modelDir: process.env.CTX_CLS_MODEL_DIR!,          // 이미지 안 경로(§4)
  modelVersion: process.env.CTX_CLS_MODEL_VERSION!,  // 정책의 modelVersion 과 같아야 결과가 받아들여진다
  expectedSha256: process.env.CTX_CLS_MODEL_SHA256,  // 넣는다(§6)
  // timeoutMs 기본 200ms(R5) — 바꾸지 않는다
})
await worker.warmup()  // 시작 때 1회(불러오기 약 0.5초)

const outcome = await worker.classify({
  sessionId, turnId, inputRevision,
  context: [{ speaker: 'ai', text: lastAiQuestion }, { speaker: 'elder', text: prevElderTurn }],
  text: thisElderTurn,
})
```

- `outcome` 은 core 의 `ClassifierOutcome` 그대로다. 실패(`timeout`·`error`·`input_invalid`)를 통과로 바꾸지 않는다 — 정책이 직원 확인 일시정지로 보낸다(Q5).
- `input_invalid`: 대상 턴이 비었거나 **대상 턴만으로 128토큰을 넘는 경우**. 끝을 잘라 분류하지 않는다(PR #80 리뷰). 검증 자료의 턴은 최대 16토큰이었다 — 실제 긴 회상에서 얼마나 걸리는지는 연결 뒤 `classifier_observations`·사건 수로 본다.

### 2.1 ⚠️ 중계 세션이 정할 것 — '턴 확정'이 어디인가, AI 응답을 기다리게 할 것인가

현재 중계는 Gemini Live 입력 전사를 조각마다 규칙으로 보고(`relay.ts` `inputTranscription`), AI 출력은 합성 검증 뒤 `turnComplete` 에 보낸다.
분류기 결과(실측 최대 48ms · 시간 초과 200ms)를 **AI 음성 전달 전에** 받으려면 다음이 자연스럽다(제안 — 결정 아님):

1. 입력 전사가 끝나고 모델 응답이 시작되는 시점(첫 `modelTurn`/`outputTranscription`)을 '어르신 턴 확정'으로 본다.
2. 그때 분류기를 부르고, 합성(이미 기다리는 구간)과 **나란히** 돌린다.
3. AI 음성 전달(`turnComplete` 송신) 전에 `decideContextSafety` 결과를 확인한다 — `staff_review_pause` 면 그 AI 음성을 보내지 않고 일시정지 경로로 간다.

이렇게 하면 지연이 거의 늘지 않고, 위기 발화에 AI 가 대답한 뒤에야 멈추는 일을 피한다. 다른 지점을 고르면 그 이유와 지연 영향을 기록한다.

## 3. 결정 → 중계 동작

정책: `decideContextSafety({ rule: assessUtterance(이번 턴 전체), classifier: outcome, expected: {sessionId, turnId, inputRevision}, policy })`

| `action` | 중계 동작 | 기록 |
|---|---|---|
| `stop_immediately` | 지금과 같음(규칙 즉시 종료 경로) | 지금과 같음(`safety_events`, `detected_by='rule'`) |
| `elder_closing` | 지금과 같음(마무리 인사 → 종료) | `record` 가 true 면 관찰 기록(아래 `observe`) |
| `staff_review_pause` | **연결을 닫기 전에** 기록(점유 결합 필수 — S6 §5 ④) → 앱에 일시정지 알림 → 연결 종료 → 점유 반납. 일시정지 중에는 듣지 않는다(2026-11-13 확정) | Edge `relay-review-pause` `kind=pause` |
| `continue` | 대화 계속 | `record` 가 true 면 `kind=observe` |

**Edge `relay-review-pause`**(배포 필요) — 헤더 `x-relay-secret: <VOICE_RELAY_SECRET>` + `Authorization: Bearer <직원 JWT>`. 본문 2KB 이하. 응답·로그에 원문 없음.

- `kind=pause` → `system_pause_for_review(p_session_id, p_lease_holder, p_requested_by, p_event_id, p_reason, p_categories, p_excerpt, p_model_version, p_policy_version)`
  - `p_event_id` = 중계가 만든 UUID(재시도해도 같은 값 → 사건 1건). 재시도는 기존 `recordWithRetry` 방식(S6 §3.6). Edge·RPC 실패가 **멈춤을 늦추지 않는다**.
  - `p_reason` = 결정의 `reason`(`classifier_unavailable`·`classifier_crisis_direct`·`classifier_distress_direct`·`classifier_ambiguous`·`classifier_out_of_scope`·`classifier_self_harm_context`).
  - `p_categories` = 결정의 `classifierCrisisCategories`. `p_excerpt` = 멈춘 지점 발화(R7 — 화면 표시용 한 곳). 알림 문구는 서버가 고른다(중계가 보내지 않는다).
- `kind=observe` → `record_classifier_observation(…, p_turn_id, p_input_revision, p_reason, p_action, p_categories, p_model_version, p_policy_version)` — 원문 없음. 같은 (세션, 턴, 개정)은 한 번만.
- 정확한 요청 형식·검사 순서: `supabase/functions/relay-review-pause/handler.ts` 와 그 테스트(`packages/data/src/relay-review-pause-handler.test.ts`).

## 4. 이미지·설정 (R6 · 2026-11-25 확정)

**Dockerfile**(지금 파일은 패키지를 이름으로 COPY 한다 — 새 패키지와 모델을 더한다):

```dockerfile
COPY packages/context-classifier/package.json ./packages/context-classifier/package.json   # pnpm install 전에
# voice-relay 의 package.json 에 "@giokon/context-classifier": "workspace:*" 를 넣어야 --filter @giokon/voice-relay... 가 함께 설치한다
COPY packages/context-classifier/src ./packages/context-classifier/src
COPY <모델 폴더> /app/models/ctx-cls/<모델 버전>/          # model.fp32.onnx · heads.json · vocab.txt 세 파일만
ENV CTX_CLS_MODEL_DIR=/app/models/ctx-cls/<모델 버전>
```

- `onnxruntime-node@1.23.2` 는 설치 스크립트 없이 CPU 바이너리를 품고 있어 지금의 `pnpm install --ignore-scripts` 로 동작한다(확인함). 패키지가 247MB(전 OS 바이너리)라 이미지가 커진다 — 줄이려면 빌드 단계에서 `bin/napi-v6/linux/x64` 밖을 지운다(선택 · 해 보지 않았다).
- 워커 스레드는 프로세스의 `execArgv` 를 이어받는다 — 지금처럼 `node --import tsx src/main.ts` 면 `.ts` 워커가 그대로 뜬다(확인함). 실행 방식을 바꾸면 `ClassifierWorker({ execArgv })` 로 맞춘다.
- 모델 파일은 런타임에 내려받지 않는다.

**Cloud Run**(운영 런북 호스팅 표에 기록됨): 분류기를 연결한 리비전부터 **메모리 1GiB**. 실측: Node 프로세스 RSS 약 85MB → 310MB(fp32 · 1코어).

**환경 변수**

| 이름 | 값 | 비고 |
|---|---|---|
| `CONTEXT_CLASSIFIER_MODE` | `off`(기본) / `enforce` | R8 — 수동 전환 = 새 리비전. `off` 면 워커를 띄우지 않고 지금 동작 그대로 |
| `CTX_CLS_MODEL_DIR` | 이미지 안 경로 | |
| `CTX_CLS_MODEL_VERSION` | 예: `kcelectra-small-v2022+synthetic-v2-run5+label-1.1` | 정책 `modelVersion` 과 같은 값 |
| `CTX_CLS_MODEL_SHA256` | §6 의 값 | 다르면 불러오지 않는다 |

**시작 때 실패 처리(제안 — 중계 세션이 정한다)**: `enforce` 인데 `warmup()` 이 실패하면, 이후 모든 턴이 `error` → 직원 확인 일시정지가 되어 대화가 사실상 안 된다. `/readyz` 를 실패로 두어 그 리비전이 트래픽을 받지 않게 하는 쪽을 권한다(자동으로 `off` 로 바꾸지 않는다 — Q5·R8).

## 5. 정책 값 (임시)

```ts
const policy: ContextSafetyPolicy = {
  version: 'ctx-policy-2026-11-25',              // 기록(p_policy_version)에 실린다
  modelVersion: process.env.CTX_CLS_MODEL_VERSION!,
  thresholds: { crisis: 0.25, distress: 0.25, crisisCategory: 0.25, closing: 0.25, qualifier: 0.3 },
}
```

- 5차 학습 KcELECTRA-small 의 **검증 자료**에서 고른 임시 값이다(4차와 같은 검증 1,034행에서 재현율 기준 충족 · 불필요 일시정지 6.7%). 평가 자료로 게이트를 판정할 때 다시 정한다 — 모델을 바꾸면 값도 다시 정한다(검증 자료에서만).
- 자해 관련 **관용**('배고파 죽겠다')은 계속 + 기록(2026-11-24 확정 — `decideContextSafety` 에 반영됨).

## 6. ⚠️ 모델 파일 보관 — 지금 조치가 필요하다

학습 결과는 원격 세션 컨테이너의 임시 폴더에만 있다. 컨테이너가 회수되면 사라진다. R6 은 "원본은 팀 비공개 저장소 + SHA-256" 으로 정했지만 아직 옮기지 않았다(이 세션은 외부 저장소에 올릴 자격이 없고, 사용자 승인 없이 올리지 않는다).

| 파일 | 크기 | SHA-256 |
|---|---|---|
| `model.fp32.onnx` | 66,428,305 B | `6d01eb9984d18ece2aa4291ca02f855e0c99c35f4268bd79d0ace026f1590a10` |
| `heads.json` | 1,276 B | `f09bdecf2581ca8e3b3bb29abc7c999754a5fcacd2714570af2d4f5daf1b4c8d` |
| `vocab.txt` | 449,581 B | `324d50377df9b16001916d553fa01dca83c9fc54965f9671a50d6454cf85b70c` |

- `heads.json` 의 `base` 칸에는 학습한 컨테이너의 경로가 들어 있다(추론에는 쓰지 않는다).
- 잃어버리면 다시 만들 수 있다: `main` 의 `ml/context-safety` 자료(`synthetic-v2`) + `train.py --model beomi/KcELECTRA-small-v2022 --max-pos-weight 3`(시드 고정) → `export_onnx.py`. 다만 CPU 연산 순서 차이로 **같은 해시가 나온다는 보장은 없다** — 다시 만들면 정책 값(§5)과 일치 검사(`dump_parity_fixture.py` → 패키지 테스트)를 다시 한다.

## 7. 연결 뒤 확인할 것 (완료 조건 제안)

- `off` 에서 지금 동작과 같음(기존 중계 테스트 전부 통과 · 워커 안 뜸).
- `enforce` 에서: 규칙 적중은 분류기 결과와 무관하게 지금과 같음 · 분류기 실패(시간 초과·오류·`input_invalid`) → 일시정지 · `staff_review_pause` 면 AI 음성을 보내지 않고 기록 → 알림 → 종료 순서 · 같은 사건 id 재시도 시 사건 1건 · 원문이 로그·`relayError` 에 없음.
- 지연: Cloud Run 실제 인스턴스에서 분류 P95(R1 100ms 이하) · 메모리.
- 그 밖에 R11(안내 음성·앱 안내·감독 화면 표시)은 각 파트 결정.
