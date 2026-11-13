"""Score predictions for Reverse Turing Bench.

    python evaluate.py predictions.jsonl
predictions.jsonl: one {"challenge": "c001", "task": "t1", "answer": "..."} per line.
"""
import json
import re
import sys
from collections import defaultdict


def normalize(v):
    s = str(v if v is not None else "").strip().lower()
    s = re.sub(r"^[\"'`“”‘’\s]+|[\"'`“”‘’.!?\s]+$", "", s)
    s = re.sub(r"\s+", " ", s)
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", s)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    n = s.replace(",", "")
    if re.fullmatch(r"-?\d+(\.\d+)?", n):
        f = float(n)
        return str(int(f)) if f.is_integer() else repr(f)
    return s


def main(pred_path, data_path="data/test.jsonl"):
    gold = {(r["challenge"], r["task"]): r["answers"] for r in map(json.loads, open(data_path))}
    preds = {(r["challenge"], r["task"]): r.get("answer") for r in map(json.loads, open(pred_path))}
    per = defaultdict(lambda: [0, 0])
    for key, answers in gold.items():
        ok = normalize(preds.get(key)) in {normalize(a) for a in answers} and normalize(preds.get(key)) != ""
        per[key[0]][0] += ok
        per[key[0]][1] += 1
    tasks = sum(c for c, _ in per.values()), sum(t for _, t in per.values())
    challenges = [k for k in per if k != "images"]
    passed = sum(per[k][0] >= 17 for k in challenges)
    print(json.dumps({
        "task_accuracy": round(tasks[0] / tasks[1], 4),
        "challenges_passed": f"{passed}/{len(challenges)}",
        "image_accuracy": round(per["images"][0] / per["images"][1], 4) if per["images"][1] else None,
    }, indent=2))


if __name__ == "__main__":
    main(*sys.argv[1:])
