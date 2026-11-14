"""전사 문맥 분류기 예시 자료 검사기 (표준 라이브러리만).

검사 항목
- 형식: 필수 칸·모르는 칸·값 목록(schema/example.schema.json 과 같은 내용)
- 라벨 일관성: crisis_appeal ↔ 위기 범주, none/unknown 단독 사용
- 분할: id 접두사·폴더와 split 일치, id 중복, 같은 variantGroup 이 여러 분할에 섞임
- 작성 주체(2026-11-14 사용자 확정): Claude 가 쓴 예시는 eval 에 넣지 않는다
- 검수 상태: 검수 전/불일치/합격 상태와 검수 기록·final 이 맞는지(2명 독립 검수)

사용: python3 ml/context-safety/tools/validate.py [자료 폴더]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

SCHEMA_VERSION = "ctx-safety-example-v1"
SPLITS = ("train", "dev", "eval")
CONTENT = {"crisis_appeal", "acute_distress", "sadness_grief", "physical_discomfort", "refusal",
           "rest_request", "reminiscence", "daily", "confusion", "unknown"}
CRISIS = {"self_harm", "medical_emergency", "abuse", "none", "unknown"}
SINGLE = {
    "subject": {"self", "other", "unknown"},
    "tense": {"present", "past", "future", "unknown"},
    "mode": {"direct", "quote", "hypothetical", "negated", "idiom", "unknown"},
    "intent": {"continue", "switch", "rest", "end", "unknown"},
    "interpretability": {"sufficient", "insufficient", "conflict", "out_of_scope"},
}
VARIANTS = {"clean", "no_spacing", "stt_error_sim", "partial", "dialect_sim"}
STATUSES = {"draft_unreviewed", "in_review", "disputed", "accepted", "excluded"}
SOURCES = {"synthetic_claude_draft", "synthetic_human"}
TOP_FIELDS = {"id", "schemaVersion", "labelGuideVersion", "split", "variantGroup", "persona", "context", "target",
              "transcriptVariant", "scenarioTags", "labelsByAuthor", "reviews", "final", "status", "provenance"}
OPTIONAL_FIELDS = {"notes"}
LABEL_FIELDS = {"content", "crisisCategory", *SINGLE}


def _date(v: object) -> bool:
    return isinstance(v, str) and len(v) == 10 and v[4] == "-" and v[7] == "-" and v.replace("-", "").isdigit()


def check_labels(labels: object, where: str) -> list[str]:
    if not isinstance(labels, dict):
        return [f"{where}: 라벨이 객체가 아님"]
    errs: list[str] = []
    keys = set(labels)
    if keys != LABEL_FIELDS:
        errs.append(f"{where}: 라벨 칸 불일치 — 빠짐 {sorted(LABEL_FIELDS - keys)} · 모름 {sorted(keys - LABEL_FIELDS)}")
        return errs
    content, crisis = labels["content"], labels["crisisCategory"]
    for name, value, allowed in (("content", content, CONTENT), ("crisisCategory", crisis, CRISIS)):
        if not isinstance(value, list) or not value:
            errs.append(f"{where}.{name}: 비어 있지 않은 배열이어야 함")
            continue
        if len(set(value)) != len(value):
            errs.append(f"{where}.{name}: 중복 값")
        bad = [v for v in value if v not in allowed]
        if bad:
            errs.append(f"{where}.{name}: 모르는 값 {bad}")
    for name, allowed in SINGLE.items():
        if labels[name] not in allowed:
            errs.append(f"{where}.{name}: 모르는 값 {labels[name]!r}")
    if errs:
        return errs
    if "unknown" in content and len(content) > 1:
        errs.append(f"{where}.content: unknown 은 다른 값과 함께 쓰지 않음")
    for solo in ("none", "unknown"):
        if solo in crisis and len(crisis) > 1:
            errs.append(f"{where}.crisisCategory: {solo} 은 다른 값과 함께 쓰지 않음")
    has_crisis = "crisis_appeal" in content
    if has_crisis and "none" in crisis:
        errs.append(f"{where}: crisis_appeal 인데 위기 범주가 none")
    if not has_crisis and crisis != ["none"]:
        errs.append(f"{where}: crisis_appeal 이 없는데 위기 범주가 none 이 아님")
    return errs


def same_labels(a: dict, b: dict) -> bool:
    return all(
        (set(a[k]) == set(b[k])) if k in ("content", "crisisCategory") else a[k] == b[k]
        for k in LABEL_FIELDS
    )


def check_record(rec: object, where: str, file_split: str | None) -> list[str]:
    if not isinstance(rec, dict):
        return [f"{where}: 객체가 아님"]
    errs: list[str] = []
    keys = set(rec)
    missing, unknown = TOP_FIELDS - keys, keys - TOP_FIELDS - OPTIONAL_FIELDS
    if missing or unknown:
        return [f"{where}: 칸 불일치 — 빠짐 {sorted(missing)} · 모름 {sorted(unknown)}"]
    rid, split = rec["id"], rec["split"]
    where = f"{where} [{rid}]"
    if rec["schemaVersion"] != SCHEMA_VERSION:
        errs.append(f"{where}: schemaVersion 이 {SCHEMA_VERSION} 아님")
    if split not in SPLITS:
        errs.append(f"{where}: split 값 {split!r}")
    elif not (isinstance(rid, str) and rid.startswith(f"ctx-{split}-") and rid[len(f'ctx-{split}-'):].isdigit()):
        errs.append(f"{where}: id 가 ctx-{split}-NNNN 형식이 아님")
    if file_split is not None and split != file_split:
        errs.append(f"{where}: split={split} 인데 data/{file_split}/ 에 있음")
    for name in ("labelGuideVersion", "variantGroup", "persona"):
        if not isinstance(rec[name], str) or not rec[name].strip():
            errs.append(f"{where}: {name} 비어 있음")
    ctx = rec["context"]
    if not isinstance(ctx, list) or len(ctx) > 3:
        errs.append(f"{where}: context 는 3턴 이하 배열")
    else:
        for i, t in enumerate(ctx):
            if not (isinstance(t, dict) and set(t) == {"speaker", "text"} and t["speaker"] in ("ai", "elder")
                    and isinstance(t["text"], str) and t["text"].strip()):
                errs.append(f"{where}: context[{i}] 형식")
    tgt = rec["target"]
    if not (isinstance(tgt, dict) and set(tgt) == {"speaker", "text"} and tgt["speaker"] == "elder"
            and isinstance(tgt["text"], str) and tgt["text"].strip()):
        errs.append(f"{where}: target 은 어르신 발화 1턴")
    if rec["transcriptVariant"] not in VARIANTS:
        errs.append(f"{where}: transcriptVariant 값 {rec['transcriptVariant']!r}")
    if not (isinstance(rec["scenarioTags"], list) and all(isinstance(t, str) for t in rec["scenarioTags"])):
        errs.append(f"{where}: scenarioTags 는 문자열 배열")
    errs += check_labels(rec["labelsByAuthor"], f"{where}.labelsByAuthor")

    prov = rec["provenance"]
    if not (isinstance(prov, dict) and set(prov) == {"source", "author", "authoredAt"}):
        errs.append(f"{where}: provenance 형식")
        return errs
    if prov["source"] not in SOURCES:
        errs.append(f"{where}: provenance.source 값 {prov['source']!r}")
    if not (isinstance(prov["author"], str) and prov["author"].strip()) or not _date(prov["authoredAt"]):
        errs.append(f"{where}: provenance 작성자·작성일")
    # 사용자 확정(2026-11-14): 최종 평가 자료는 사람이 쓴다.
    if split == "eval" and prov["source"] != "synthetic_human":
        errs.append(f"{where}: eval 에 사람이 쓰지 않은 예시({prov['source']})")

    reviews, final, status = rec["reviews"], rec["final"], rec["status"]
    if status not in STATUSES:
        errs.append(f"{where}: status 값 {status!r}")
        return errs
    if not isinstance(reviews, list) or len(reviews) > 2:
        errs.append(f"{where}: reviews 는 2개 이하 배열")
        return errs
    review_errs: list[str] = []
    for i, r in enumerate(reviews):
        if not (isinstance(r, dict) and set(r) == {"reviewer", "reviewedAt", "labels"}
                and isinstance(r["reviewer"], str) and r["reviewer"].strip() and _date(r["reviewedAt"])):
            review_errs.append(f"{where}: reviews[{i}] 형식")
            continue
        review_errs += check_labels(r["labels"], f"{where}.reviews[{i}]")
        if r["reviewer"] == prov["author"]:
            review_errs.append(f"{where}: 작성자가 자기 예시를 검수함")
    errs += review_errs
    if len(reviews) == 2 and not review_errs and reviews[0]["reviewer"] == reviews[1]["reviewer"]:
        errs.append(f"{where}: 같은 사람이 두 번 검수함(2명 독립 검수)")
    if final is not None:
        errs += check_labels(final, f"{where}.final")
    if review_errs:
        return errs

    agree = len(reviews) == 2 and same_labels(reviews[0]["labels"], reviews[1]["labels"])
    if status == "draft_unreviewed" and (reviews or final is not None):
        errs.append(f"{where}: 검수 전인데 검수 기록·final 이 있음")
    if status == "in_review" and (len(reviews) == 2 or final is not None):
        errs.append(f"{where}: 검수 중은 검수 1건 이하·final 없음")
    if status == "disputed" and (len(reviews) != 2 or agree or final is not None):
        errs.append(f"{where}: 불일치는 서로 다른 검수 2건·final 없음")
    if status == "accepted":
        if len(reviews) != 2 or final is None:
            errs.append(f"{where}: 합격은 검수 2건과 final 필요")
        elif agree and not same_labels(final, reviews[0]["labels"]):
            errs.append(f"{where}: 두 검수가 같은데 final 이 다름")
        elif not agree and not (isinstance(rec.get("notes"), str) and rec["notes"].strip()):
            errs.append(f"{where}: 재검토 합의로 합격했으면 notes 에 사유 필요")
    if status == "excluded" and final is not None:
        errs.append(f"{where}: 제외된 예시에 final 이 있음")
    return errs


def check_corpus(entries: list[tuple[str, object, str | None]]) -> list[str]:
    """entries = [(위치, 레코드, 폴더 split)] — 레코드별 검사 + 전체 중복·누수 검사."""
    errs: list[str] = []
    ids: dict[str, str] = {}
    groups: dict[str, set[str]] = {}
    for where, rec, file_split in entries:
        errs += check_record(rec, where, file_split)
        if isinstance(rec, dict) and isinstance(rec.get("id"), str):
            if rec["id"] in ids:
                errs.append(f"{where}: id {rec['id']} 중복(처음: {ids[rec['id']]})")
            ids.setdefault(rec["id"], where)
            if isinstance(rec.get("variantGroup"), str) and rec.get("split") in SPLITS:
                groups.setdefault(rec["variantGroup"], set()).add(rec["split"])
    for g, splits in sorted(groups.items()):
        if len(splits) > 1:
            errs.append(f"variantGroup {g!r} 이 여러 분할에 섞임: {sorted(splits)}")
    return errs


def load_dir(root: Path) -> tuple[list[tuple[str, object, str | None]], list[str]]:
    entries: list[tuple[str, object, str | None]] = []
    errs: list[str] = []
    for path in sorted(root.rglob("*.jsonl")):
        rel = path.relative_to(root)
        file_split = rel.parts[0] if len(rel.parts) > 1 and rel.parts[0] in SPLITS else None
        if file_split is None:
            errs.append(f"{rel}: data/{{train,dev,eval}}/ 아래에 있어야 함")
        raw = path.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            errs.append(f"{rel}: BOM 금지")
        for n, line in enumerate(raw.decode("utf-8-sig").splitlines(), 1):
            if not line.strip():
                continue
            try:
                entries.append((f"{rel}:{n}", json.loads(line), file_split))
            except json.JSONDecodeError as e:
                errs.append(f"{rel}:{n}: JSON 오류 {e.msg}")
    return entries, errs


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path(__file__).resolve().parent.parent / "data"
    entries, errs = load_dir(root)
    errs += check_corpus(entries)
    for e in errs:
        print(f"✗ {e}")
    if errs:
        print(f"검사 실패 {len(errs)}건")
        return 1
    by_split: dict[str, int] = {}
    for _, rec, _ in entries:
        by_split[rec["split"]] = by_split.get(rec["split"], 0) + 1  # type: ignore[index]
    print(f"✓ 예시 {len(entries)}개 통과 " + " · ".join(f"{k} {v}" for k, v in sorted(by_split.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
