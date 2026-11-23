# 전사 문맥 분류기 — 학습·평가 자료 (CTX-CLS-20261113)

음성 중계의 규칙 감지(`packages/core/src/safety.ts` `assessUtterance`) **위에 더하는**(OR) 한국어 문맥 분류기의 자료 폴더다.
정책·범위는 `docs/plans/2026-11-13-risk-emotion-detection.md` §25.1, 상태는 `docs/tasks.md` CTX-CLS-20261113 이 SoT 다.

## 자료 규칙 (위반 금지)

1. **실제 어르신 발화를 넣지 않는다.** 여기 있는 것은 전부 작성된 가상 예시다. 실제 발화가 섞일 수 있는 자료는 이 저장소에 커밋하지 않는다.
2. **운영 DB(`transcripts`·`safety_events`)·Gemini 가 참여한 세션의 전사·출력·파생 자료를 쓰지 않는다**(`AGENTS.md` 기술 결정).
3. 모든 예시에 작성자·작성일·검수 기록을 남긴다(`provenance`).
4. **작성 주체(2026-11-14 사용자 확정)**
   - 학습·검증(`train`·`dev`) 자료: Claude 가 쓴다. **검수 없이 작성자 라벨(`labelsByAuthor`)로 학습한다**(2026-11-22 사용자 확정 R2).
     규모 = 범주(자해·신체 응급·학대·급성 고통·휴식·거부)별 100개 + 비대상(일상·회상·애도·관용·과거·인용 등) 600개.
   - **최종 평가(`eval`) 자료: 사람이 직접 쓴다.** Claude 가 쓴 예시는 `eval` 에 넣지 않는다(검사기가 막는다).
     팀 3명이 나눠 쓰고 작성자 외 2명이 교차 검수 · 범주별 정답 양성 50개 이상(2026-11-14).
5. **평가 자료 검수 = 2명 독립**(2026-11-14 사용자 확정). 두 사람이 서로의 라벨을 보지 않고 붙인다. 불일치는 보류 → 재검토(`LABELING.md` §6).
   게이트 판정은 평가 자료의 검수 합의(`final`)로만 한다. 학습 자료 라벨 오류의 영향은 이 평가가 잰다.
6. 분할: 같은 문장의 변형(`variantGroup`)을 여러 분할에 섞지 않는다. **평가 자료는 임계값·모델 선택에 쓰지 않는다**(최종 1회만 사용).
7. 범주별 최소 표본 수는 **미정**(사용자 결정 대기). 숫자를 임의로 채우지 않는다.

## 구성

| 경로 | 내용 |
|---|---|
| `LABELING.md` | 라벨 규약 — 7축 정의·경계 사례·반례·'불명' 규칙·검수 불일치 처리·라벨 출처 |
| `schema/example.schema.json` | 예시 한 줄(JSONL)의 형식 |
| `data/train/*.jsonl` · `data/dev/*.jsonl` | 학습·검증 자료(Claude 작성 · 검수 없이 작성자 라벨로 학습 — R2). `synthetic-v1` = 기본 문장 405개 × 전사 변형 → 학습 1,053 + 검증 142(+ 시범 28) |
| `authoring/build_synthetic_v1.py` | `synthetic-v1` 을 다시 만드는 스크립트(난수 없음 — 같은 파일이 나온다) |
| `data/eval/` | 최종 평가 자료(사람 작성 — 아직 없음) |
| `tools/validate.py` | 형식·라벨 일관성·분할 누수·작성 주체 규칙 검사(표준 라이브러리만) |
| `tools/test_validate.py` | 검사기 회귀(규칙을 어긴 예시가 실제로 거절되는지) |
| `tools/rule_baseline.ts` | 현재 규칙(`assessUtterance`) 기준선 — 범주별 재현율·정밀도·미탐·오탐(표면 기준·대응 대상 기준 나란히) |
| `tools/rule_baseline.test.ts` | 기준선 도구 회귀 |
| `tools/policy_eval.ts` · `.test.ts` | 정책 단위 평가(규칙 OR 분류기 → 행동 · 게이트 기준 R1) |
| `train/train.py` · `requirements.txt` | 학습·온도 보정(가중치는 저장소 밖) |

## 검사 (Windows cmd · 저장소 루트)

```bat
python ml\context-safety\tools\validate.py
python -m unittest discover -s ml\context-safety\tools -p "test_*.py"
```

규칙 기준선(평가 자료·검수 합의 라벨만 기준선으로 인정 — 그 밖의 조합은 '도구 점검용'으로 표시된다):

```bat
apps\voice-relay\node_modules\.bin\tsx ml\context-safety\tools\rule_baseline.ts --split eval --out ml\context-safety\reports\rule-baseline.md
apps\voice-relay\node_modules\.bin\tsx --test ml\context-safety\tools\rule_baseline.test.ts
```

(`tsx` 가 없으면 먼저 `pnpm install --filter @giokon/voice-relay`.)

## 학습 (S3 · Windows cmd · 저장소 루트)

가중치·예측 파일은 저장소에 넣지 않는다(학습 결과 폴더는 저장소 밖에 둔다).

```bat
python -m venv %TEMP%\ctx-venv
%TEMP%\ctx-venv\Scripts\pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
%TEMP%\ctx-venv\Scripts\pip install -r ml\context-safety\train\requirements.txt
%TEMP%\ctx-venv\Scripts\python ml\context-safety\train\train.py --model beomi/KcELECTRA-small-v2022 --out %TEMP%\ctx-runs\kcelectra
apps\voice-relay\node_modules\.bin\tsx ml\context-safety\tools\policy_eval.ts %TEMP%\ctx-runs\kcelectra\dev_predictions.json --grid
```

- `train.py`: 학습 = train 분할(작성자 라벨) · 축별 온도 보정 = dev 분할 · eval 은 쓰지 않는다.
- `policy_eval.ts`: dev 예측을 core 의 실제 결합 정책(`decideContextSafety`)·규칙(`assessUtterance`)에 넣어 게이트 기준(R1)으로 잰다. dev 결과는 **임계값 선택용**이고 게이트 판정이 아니다.

## 권리 확인 메모

- Claude 가 쓴 예시를 학습에 쓰는 것: 공급자 이용 약관의 출력 이용 조건을 법무 확인 항목에 함께 올린다(D10 변호사 미팅).
- 공개 모델(KoELECTRA-Small 등) 라이선스는 학습 단계(S3)에서 체크포인트마다 확인해 기록한다.
