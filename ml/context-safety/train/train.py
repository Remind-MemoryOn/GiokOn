"""전사 문맥 분류기 학습·보정 (CTX-CLS-S3).

ELECTRA-Small 인코더 + 축별 출력(라벨 규약 v1.1):
  다중(시그모이드)  content(10) · crisisCategory(5)
  단일(소프트맥스)  subject(3) · tense(5) · mode(6) · intent(5) · interpretability(4)
입력 = 직전 문맥(화자 표시) [SEP] 어르신 대상 턴 (사용자 확정 R4).
학습 = train 분할(작성자 라벨 — R2) · 보정·임계값 = dev 분할만 · eval 은 쓰지 않는다.

출력(저장소 밖 --out): model/ (가중치·토크나이저·heads.json) · dev_predictions.json(보정된 점수) · metrics.json
실행 예: python train.py --model <체크포인트 폴더> --out <출력 폴더>
"""
from __future__ import annotations

import argparse
import json
import math
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer

DATA = Path(__file__).resolve().parent.parent / "data"
MULTI = {
    "content": ["crisis_appeal", "acute_distress", "sadness_grief", "physical_discomfort", "refusal",
                "rest_request", "reminiscence", "daily", "confusion", "unknown"],
    "crisisCategory": ["self_harm", "medical_emergency", "abuse", "none", "unknown"],
}
SINGLE = {
    "subject": ["self", "other", "unknown"],
    "tense": ["present", "recent", "past", "future", "unknown"],
    "mode": ["direct", "quote", "hypothetical", "negated", "idiom", "unknown"],
    "intent": ["continue", "switch", "rest", "end", "unknown"],
    "interpretability": ["sufficient", "insufficient", "conflict", "out_of_scope"],
}
HEADS = {**MULTI, **SINGLE}
SPEAKER = {"ai": "AI", "elder": "어르신"}


def load(split: str) -> list[dict]:
    rows = []
    for p in sorted((DATA / split).glob("*.jsonl")):
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                labels = r["final"] if r.get("final") else r["labelsByAuthor"]  # 검수 합의가 있으면 우선(R2)
                rows.append({"id": r["id"], "group": r["variantGroup"], "context": r["context"],
                             "text": r["target"]["text"], "labels": labels})
    return rows


def context_text(turns: list[dict]) -> str:
    return " / ".join(f"{SPEAKER[t['speaker']]}: {t['text']}" for t in turns) or "(문맥 없음)"


class Classifier(nn.Module):
    def __init__(self, encoder_dir: str, dropout: float = 0.1):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(encoder_dir)
        h = self.encoder.config.hidden_size
        self.drop = nn.Dropout(dropout)
        self.heads = nn.ModuleDict({k: nn.Linear(h, len(v)) for k, v in HEADS.items()})

    def forward(self, input_ids, attention_mask, token_type_ids=None):
        out = self.encoder(input_ids=input_ids, attention_mask=attention_mask, token_type_ids=token_type_ids)
        cls = self.drop(out.last_hidden_state[:, 0])
        return {k: head(cls) for k, head in self.heads.items()}


def targets(rows: list[dict]) -> dict[str, torch.Tensor]:
    t: dict[str, torch.Tensor] = {}
    for k, names in MULTI.items():
        t[k] = torch.tensor([[1.0 if n in r["labels"][k] else 0.0 for n in names] for r in rows])
    for k, names in SINGLE.items():
        t[k] = torch.tensor([names.index(r["labels"][k]) for r in rows])
    return t


def encode(tok, rows: list[dict], max_len: int):
    return tok([context_text(r["context"]) for r in rows], [r["text"] for r in rows],
               truncation="only_first", max_length=max_len, padding=True, return_tensors="pt")


def logits_for(model, tok, rows, max_len, batch=64) -> dict[str, np.ndarray]:
    model.eval()
    acc: dict[str, list[np.ndarray]] = {k: [] for k in HEADS}
    with torch.no_grad():
        for i in range(0, len(rows), batch):
            enc = encode(tok, rows[i:i + batch], max_len)
            out = model(**enc)
            for k in HEADS:
                acc[k].append(out[k].numpy())
    return {k: np.concatenate(v) for k, v in acc.items()}


def fit_temperature(logits: np.ndarray, y: np.ndarray, multi: bool) -> float:
    """검증 자료 음의 로그우도를 최소화하는 온도(격자 탐색 — 단조, 의존성 없음)."""
    best_t, best = 1.0, math.inf
    for t in np.exp(np.linspace(math.log(0.25), math.log(8.0), 121)):
        z = logits / t
        if multi:
            p = 1 / (1 + np.exp(-z))
            nll = -np.mean(y * np.log(p + 1e-9) + (1 - y) * np.log(1 - p + 1e-9))
        else:
            z = z - z.max(axis=1, keepdims=True)
            logp = z - np.log(np.exp(z).sum(axis=1, keepdims=True))
            nll = -np.mean(logp[np.arange(len(y)), y])
        if nll < best:
            best_t, best = float(t), float(nll)
    return best_t


def probs(logits: np.ndarray, t: float, multi: bool) -> np.ndarray:
    z = logits / t
    if multi:
        return 1 / (1 + np.exp(-z))
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--seed", type=int, default=20261123)
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args()
    random.seed(a.seed); np.random.seed(a.seed); torch.manual_seed(a.seed)
    torch.set_num_threads(a.threads)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)

    train, dev = load("train"), load("dev")
    tok = AutoTokenizer.from_pretrained(a.model)
    model = Classifier(a.model)
    ytr = targets(train)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    steps = a.epochs * math.ceil(len(train) / a.batch)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / (0.1 * steps)) * max(0.0, (steps - s) / steps))
    bce, ce = nn.BCEWithLogitsLoss(), nn.CrossEntropyLoss()
    t0 = time.time()
    log = []
    for ep in range(a.epochs):
        model.train()
        order = list(range(len(train))); random.shuffle(order)
        total = 0.0
        for i in range(0, len(order), a.batch):
            idx = order[i:i + a.batch]
            enc = encode(tok, [train[j] for j in idx], a.max_len)
            o = model(**enc)
            loss = sum(bce(o[k], ytr[k][idx]) for k in MULTI) + sum(ce(o[k], ytr[k][idx]) for k in SINGLE)
            opt.zero_grad(); loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step()
            total += float(loss) * len(idx)
        log.append({"epoch": ep + 1, "train_loss": round(total / len(train), 4), "seconds": round(time.time() - t0, 1)})
        print(json.dumps(log[-1], ensure_ascii=False), flush=True)

    # 보정 — 검증 자료로 축마다 온도 하나
    ydev = targets(dev)
    dl = logits_for(model, tok, dev, a.max_len)
    temps = {k: fit_temperature(dl[k], ydev[k].numpy(), k in MULTI) for k in HEADS}
    dp = {k: probs(dl[k], temps[k], k in MULTI) for k in HEADS}

    # 축별 지표(검증 자료) — 단일 축 정확도 · 다중 축 라벨별 F1(0.5)
    metrics: dict = {"model": a.model, "train_n": len(train), "dev_n": len(dev), "epochs": log, "temperatures": temps, "heads": {}}
    for k, names in SINGLE.items():
        pred = dp[k].argmax(1); y = ydev[k].numpy()
        metrics["heads"][k] = {"accuracy": round(float((pred == y).mean()), 4)}
    for k, names in MULTI.items():
        y = ydev[k].numpy(); p = dp[k] >= 0.5
        per = {}
        for j, n in enumerate(names):
            tp = int((p[:, j] & (y[:, j] == 1)).sum()); fp = int((p[:, j] & (y[:, j] == 0)).sum()); fn = int((~p[:, j] & (y[:, j] == 1)).sum())
            per[n] = {"support": int(y[:, j].sum()), "f1": round(2 * tp / (2 * tp + fp + fn), 4) if tp + fp + fn else None}
        metrics["heads"][k] = per

    preds = []
    for i, r in enumerate(dev):
        preds.append({"id": r["id"], "group": r["group"], "text": r["text"], "labels": r["labels"],
                      "scores": {k: {n: round(float(dp[k][i][j]), 6) for j, n in enumerate(HEADS[k])} for k in HEADS}})
    (out / "dev_predictions.json").write_text(json.dumps(preds, ensure_ascii=False), encoding="utf-8")
    (out / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=1), encoding="utf-8")
    md = out / "model"; md.mkdir(exist_ok=True)
    torch.save(model.state_dict(), md / "classifier.pt")
    tok.save_pretrained(md)
    (md / "heads.json").write_text(json.dumps({"heads": HEADS, "multi": list(MULTI), "single": list(SINGLE),
                                               "temperatures": temps, "max_len": a.max_len, "base": a.model}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"done_seconds": round(time.time() - t0, 1), "temperatures": temps}, ensure_ascii=False))


if __name__ == "__main__":
    main()
