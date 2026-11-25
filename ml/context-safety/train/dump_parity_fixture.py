"""Python ↔ Node 일치 검사용 기준 파일 (CTX-CLS-S5).

검증(dev) 자료 전체에 대해 학습 토크나이저의 토큰 id 와 보정된 PyTorch 점수를 <run>/onnx/parity_fixture.json 에 쓴다.
Node 쪽 packages/context-classifier/src/parity.test.ts 가 CTX_CLS_MODEL_DIR=<run>/onnx 일 때 이것과 비교한다.
(모델 폴더는 저장소 밖이라 이 파일도 저장소 밖에 둔다.)

실행 예: python dump_parity_fixture.py --run <train.py 의 --out 폴더>
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

import torch

_spec = importlib.util.spec_from_file_location("ctx_train", Path(__file__).resolve().parent / "train.py")
T = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(T)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    a = ap.parse_args()
    run = Path(a.run); md = run / "model"
    meta = json.loads((md / "heads.json").read_text(encoding="utf-8"))
    tok = T.AutoTokenizer.from_pretrained(md)
    model = T.Classifier(meta["base"]); model.load_state_dict(torch.load(md / "classifier.pt", map_location="cpu")); model.eval()
    dev = T.load("dev")
    lg = T.logits_for(model, tok, dev, meta["max_len"])
    pr = {k: T.probs(lg[k], meta["temperatures"][k], k in T.MULTI) for k in T.HEADS}
    rows = []
    for i, r in enumerate(dev):
        enc = tok(T.context_text(r["context"]), r["text"], truncation="only_first", max_length=meta["max_len"])
        rows.append({"id": r["id"], "context": r["context"], "text": r["text"], "input_ids": enc["input_ids"],
                     "token_type_ids": enc["token_type_ids"],
                     "probs": {k: {n: float(pr[k][i][j]) for j, n in enumerate(T.HEADS[k])} for k in T.HEADS}})
    out = run / "onnx" / "parity_fixture.json"
    out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"{len(rows)} → {out}")


if __name__ == "__main__":
    main()
