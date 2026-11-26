"""학습 결과 → ONNX(fp32·int8) 변환과 일치 검사 (CTX-CLS-S5).

입력  --run <train.py 의 --out 폴더>  (model/classifier.pt · model/heads.json · 토크나이저)
출력  <run>/onnx/ : model.fp32.onnx · model.int8.onnx(동적 양자화) · heads.json · vocab.txt · tokenizer_config.json
      <run>/dev_predictions.int8.json(보정된 int8 점수 — policy_eval.ts 로 잰다) · <run>/onnx/parity.json
출력 순서 = heads.json 의 heads 키 순서(content · crisisCategory · subject · tense · mode · intent · interpretability), 값은 로짓.
보정(온도)은 모델 밖에서 한다 — 같은 heads.json 의 temperatures 를 Node 패키지가 그대로 쓴다.

실행 예: python export_onnx.py --run <출력 폴더>
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic

_spec = importlib.util.spec_from_file_location("ctx_train", Path(__file__).resolve().parent / "train.py")
T = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(T)


class Exportable(torch.nn.Module):
    def __init__(self, inner: torch.nn.Module):
        super().__init__()
        self.inner = inner

    def forward(self, input_ids, attention_mask, token_type_ids):
        out = self.inner(input_ids=input_ids, attention_mask=attention_mask, token_type_ids=token_type_ids)
        return tuple(out[k] for k in T.HEADS)


def run_onnx(sess: ort.InferenceSession, enc) -> dict[str, np.ndarray]:
    feeds = {k: enc[k].numpy().astype(np.int64) for k in ("input_ids", "attention_mask", "token_type_ids")}
    return dict(zip(T.HEADS, sess.run(None, feeds)))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--opset", type=int, default=17)
    a = ap.parse_args()
    run = Path(a.run); md = run / "model"; od = run / "onnx"; od.mkdir(exist_ok=True)
    meta = json.loads((md / "heads.json").read_text(encoding="utf-8"))
    assert list(meta["heads"]) == list(T.HEADS), "heads.json 순서가 train.py 와 다르다"

    tok = T.AutoTokenizer.from_pretrained(md)
    model = T.Classifier(meta["base"]); model.load_state_dict(torch.load(md / "classifier.pt", map_location="cpu")); model.eval()
    dev = T.load("dev")
    sample = T.encode(tok, dev[:2], meta["max_len"])

    fp32 = od / "model.fp32.onnx"; int8 = od / "model.int8.onnx"
    torch.onnx.export(Exportable(model), (sample["input_ids"], sample["attention_mask"], sample["token_type_ids"]), fp32,
                      input_names=["input_ids", "attention_mask", "token_type_ids"], output_names=list(T.HEADS),
                      dynamic_axes={**{n: {0: "batch", 1: "seq"} for n in ("input_ids", "attention_mask", "token_type_ids")},
                                    **{k: {0: "batch"} for k in T.HEADS}}, opset_version=a.opset)
    quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8)
    for f in ("vocab.txt", "tokenizer_config.json", "special_tokens_map.json"):
        shutil.copy(md / f, od / f)
    (od / "heads.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    # 일치 검사 — 검증 자료 전체: PyTorch ↔ fp32 ↔ int8 (보정된 확률 기준 최대 차이, 단일 축 argmax 일치율)
    pt = T.logits_for(model, tok, dev, meta["max_len"])
    s32 = ort.InferenceSession(str(fp32), providers=["CPUExecutionProvider"])
    s8 = ort.InferenceSession(str(int8), providers=["CPUExecutionProvider"])
    o32: dict[str, list] = {k: [] for k in T.HEADS}; o8: dict[str, list] = {k: [] for k in T.HEADS}
    for i in range(0, len(dev), 64):
        enc = T.encode(tok, dev[i:i + 64], meta["max_len"])
        for k, v in run_onnx(s32, enc).items(): o32[k].append(v)
        for k, v in run_onnx(s8, enc).items(): o8[k].append(v)
    temps = meta["temperatures"]
    parity: dict = {"n": len(dev), "heads": {}}
    p8_all = {}
    for k in T.HEADS:
        multi = k in T.MULTI
        p_pt = T.probs(pt[k], temps[k], multi)
        p_32 = T.probs(np.concatenate(o32[k]), temps[k], multi)
        p_8 = T.probs(np.concatenate(o8[k]), temps[k], multi)
        p8_all[k] = p_8
        h = {"fp32_max_abs": float(np.abs(p_pt - p_32).max()), "int8_max_abs": float(np.abs(p_pt - p_8).max()),
             "int8_mean_abs": float(np.abs(p_pt - p_8).mean())}
        if not multi:
            h["int8_argmax_agree"] = float((p_pt.argmax(1) == p_8.argmax(1)).mean())
        parity["heads"][k] = {n: round(v, 6) for n, v in h.items()}
    parity["bytes"] = {"fp32": fp32.stat().st_size, "int8": int8.stat().st_size}
    (od / "parity.json").write_text(json.dumps(parity, ensure_ascii=False, indent=1), encoding="utf-8")

    preds = [{"id": r["id"], "group": r["group"], "text": r["text"], "labels": r["labels"],
              "scores": {k: {n: round(float(p8_all[k][i][j]), 6) for j, n in enumerate(T.HEADS[k])} for k in T.HEADS}}
             for i, r in enumerate(dev)]
    (run / "dev_predictions.int8.json").write_text(json.dumps(preds, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(parity, ensure_ascii=False))


if __name__ == "__main__":
    main()
