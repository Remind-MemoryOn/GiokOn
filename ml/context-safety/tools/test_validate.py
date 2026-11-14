"""검사기 회귀 — 규칙을 어긴 예시가 실제로 거절되는지 확인한다.

python3 -m unittest discover -s ml/context-safety/tools -p "test_*.py"
"""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate as v  # noqa: E402

LABELS = {"content": ["daily"], "crisisCategory": ["none"], "subject": "self", "tense": "present",
          "mode": "direct", "intent": "unknown", "interpretability": "sufficient"}
BASE = {
    "id": "ctx-train-0001", "schemaVersion": v.SCHEMA_VERSION, "labelGuideVersion": "0.1-draft", "split": "train",
    "variantGroup": "g1", "persona": "p01", "context": [{"speaker": "ai", "text": "점심은 드셨어요?"}],
    "target": {"speaker": "elder", "text": "국수 먹었어"}, "transcriptVariant": "clean", "scenarioTags": ["daily"],
    "labelsByAuthor": LABELS, "reviews": [], "final": None, "status": "draft_unreviewed",
    "provenance": {"source": "synthetic_claude_draft", "author": "claude", "authoredAt": "2026-11-14"},
}


def rec(**over):
    r = copy.deepcopy(BASE)
    r.update(copy.deepcopy(over))
    return r


def review(who, labels=LABELS):
    return {"reviewer": who, "reviewedAt": "2026-11-15", "labels": copy.deepcopy(labels)}


def errors(*records, split=None):
    return v.check_corpus([(f"t:{i}", r, split if split is not None else r["split"]) for i, r in enumerate(records)])


class Validate(unittest.TestCase):
    def test_base_passes(self):
        self.assertEqual(errors(rec()), [])

    def test_repo_data_passes(self):
        entries, errs = v.load_dir(Path(__file__).resolve().parent.parent / "data")
        self.assertEqual(errs + v.check_corpus(entries), [])
        self.assertTrue(entries)

    def test_claude_draft_rejected_in_eval(self):
        bad = rec(id="ctx-eval-0001", split="eval")
        self.assertTrue(any("eval 에 사람이 쓰지 않은" in e for e in errors(bad)))
        ok = rec(id="ctx-eval-0001", split="eval",
                 provenance={"source": "synthetic_human", "author": "h1", "authoredAt": "2026-11-15"})
        self.assertEqual(errors(ok), [])

    def test_variant_group_leak(self):
        a = rec()
        b = rec(id="ctx-dev-0001", split="dev")
        self.assertTrue(any("여러 분할" in e for e in errors(a, b)))

    def test_duplicate_id(self):
        self.assertTrue(any("중복" in e for e in errors(rec(), rec(variantGroup="g2"))))

    def test_split_folder_and_id_prefix(self):
        self.assertTrue(any("data/eval/" in e for e in errors(rec(), split="eval")))
        self.assertTrue(any("형식이 아님" in e for e in errors(rec(id="ctx-dev-0009"))))

    def test_crisis_consistency(self):
        bad1 = rec(labelsByAuthor={**LABELS, "content": ["crisis_appeal"]})
        bad2 = rec(labelsByAuthor={**LABELS, "crisisCategory": ["self_harm"]})
        bad3 = rec(labelsByAuthor={**LABELS, "content": ["crisis_appeal"], "crisisCategory": ["none", "abuse"]})
        bad4 = rec(labelsByAuthor={**LABELS, "content": ["unknown", "daily"]})
        for bad in (bad1, bad2, bad3, bad4):
            self.assertNotEqual(errors(bad), [])

    def test_unknown_value_and_field(self):
        self.assertNotEqual(errors(rec(labelsByAuthor={**LABELS, "tense": "now"})), [])
        self.assertNotEqual(errors(rec(extra=1)), [])

    def test_review_rules(self):
        two = [review("r1"), review("r2")]
        self.assertEqual(errors(rec(status="accepted", reviews=two, final=LABELS)), [])
        # 작성자 본인 검수 · 같은 사람 두 번
        self.assertNotEqual(errors(rec(status="in_review", reviews=[review("claude")])), [])
        self.assertNotEqual(errors(rec(status="accepted", reviews=[review("r1"), review("r1")], final=LABELS)), [])
        # 검수 전인데 기록 있음 · 1건으로 합격 · 두 검수 같은데 final 다름
        self.assertNotEqual(errors(rec(reviews=[review("r1")])), [])
        self.assertNotEqual(errors(rec(status="accepted", reviews=[review("r1")], final=LABELS)), [])
        other = {**LABELS, "tense": "past"}
        self.assertNotEqual(errors(rec(status="accepted", reviews=two, final=other)), [])

    def test_disputed_rules(self):
        diff = [review("r1"), review("r2", {**LABELS, "tense": "past"})]
        self.assertEqual(errors(rec(status="disputed", reviews=diff)), [])
        self.assertNotEqual(errors(rec(status="disputed", reviews=[review("r1"), review("r2")])), [])
        # 불일치를 합의로 합격시키면 사유가 있어야 한다
        self.assertNotEqual(errors(rec(status="accepted", reviews=diff, final=LABELS)), [])
        self.assertEqual(errors(rec(status="accepted", reviews=diff, final=LABELS, notes="재검토: 시점 근거 없음")), [])


if __name__ == "__main__":
    unittest.main()
