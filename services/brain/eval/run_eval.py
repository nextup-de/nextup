"""Run the Acme test ideas through the brain and score it against the keyword router.

    uv run python -m eval.run_eval            # uses LLM_* from .env or the environment
    uv run python -m eval.run_eval --recorded eval/recorded/routing.json   # no model: score recorded answers
    uv run python -m eval.run_eval --record-keywords                       # write the keyword router's answers

acme.json is a snapshot of the demo seed (apps/app/src/features/demo/seed.ts): the rows and
earlier items the app sends. Results land in eval/results/<timestamp>_<model>.json.
"""

import argparse
import json
import math
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from brain.config import get_settings
from brain.llm import LLMClient, LLMOutputError
from brain.route import PROMPT_VERSION, route
from brain.schemas import RouteIn

HERE = Path(__file__).parent


def keyword_route(text: str, keys: dict[str, list[str]]) -> str | None:
    """features/routing proposeRoute(): the row with the most keyword hits, first one on a tie."""
    t, best, hits = text.lower() + " ", None, 0
    for rid, ks in keys.items():
        n = sum(k in t for k in ks)
        if n > hits:
            best, hits = rid, n
    return best


DEFAULT_THRESHOLD = 0.80
CASES = HERE / "routing_cases.json"
RECORDED = HERE / "recorded" / "routing.json"


def load_cases() -> list[dict]:
    return json.loads(CASES.read_text(encoding="utf-8"))


def score(cases: list[dict], answers: dict[str, str | None]) -> dict:
    """Accuracy overall and per language; a missing answer is a miss, null is a right answer for null."""
    out: dict = {}
    for key, rs in (("overall", cases), *((lang, [c for c in cases if c["lang"] == lang]) for lang in ("de", "en"))):
        right = sum(c["id"] in answers and answers[c["id"]] == c["route_id"] for c in rs)
        out[key] = {"cases": len(rs), "right": right, "accuracy": right / len(rs) if rs else 0.0}
    return out


def keyword_answers(cases: list[dict], keys: dict[str, list[str]]) -> dict[str, str | None]:
    return {c["id"]: keyword_route(c["text"], keys) for c in cases}


def report(cases: list[dict], answers: dict[str, str | None], keys: dict[str, list[str]]) -> dict:
    got, base = score(cases, answers), score(cases, keyword_answers(cases, keys))
    for name, sc in (("model", got), ("keyword baseline", base)):
        print(f"{name:17} " + "  ".join(f"{k} {v['right']}/{v['cases']} = {v['accuracy']:.3f}" for k, v in sc.items()))
    return got


def run_recorded(path: Path, threshold: float | None) -> int:
    ctx = json.loads((HERE / "acme.json").read_text(encoding="utf-8"))
    rec = json.loads(path.read_text(encoding="utf-8"))
    need = threshold if threshold is not None else rec.get("threshold", DEFAULT_THRESHOLD)
    print(f"recorded: model {rec.get('model')}  prompt {rec.get('prompt_version')}  threshold {need}")
    got = report(load_cases(), rec["answers"], ctx["baseline_keys"])
    acc = got["overall"]["accuracy"]
    if acc < need:
        print(f"FAIL: accuracy {acc:.3f} is below the threshold {need}")
        return 1
    print(f"OK: accuracy {acc:.3f} >= {need}")
    return 0


def record_keywords(path: Path) -> None:
    ctx = json.loads((HERE / "acme.json").read_text(encoding="utf-8"))
    cases = load_cases()
    answers = keyword_answers(cases, ctx["baseline_keys"])
    acc = score(cases, answers)["overall"]["accuracy"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"model": "keywords-v1", "prompt_version": PROMPT_VERSION,
                                "threshold": math.floor(acc * 100) / 100, "answers": answers},
                               ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {path} (keyword accuracy {acc:.3f})")


def run_live_cases(llm: LLMClient, threshold: float | None) -> int:
    ctx = json.loads((HERE / "acme.json").read_text(encoding="utf-8"))
    cases = load_cases()
    answers: dict[str, str | None] = {}
    for c in cases:
        body = RouteIn.model_validate({"company": ctx["company"], "idea": {"title": c["text"][:300], "body": ""},
                                       "routes": ctx["routes"], "known": ctx["known"]})
        try:
            answers[c["id"]] = route(llm, body).route_id
        except LLMOutputError:
            print(f"{c['id']}  ERROR")
    got = report(cases, answers, ctx["baseline_keys"])
    need = threshold if threshold is not None else DEFAULT_THRESHOLD
    return 0 if got["overall"]["accuracy"] >= need else 1


def main(threshold: float | None = None) -> int:
    ctx = json.loads((HERE / "acme.json").read_text())
    ideas = json.loads((HERE / "test_ideas.json").read_text())
    settings = get_settings()
    llm = LLMClient(settings)
    rows, ms = [], []
    for t in ideas:
        body = RouteIn.model_validate({"company": ctx["company"], "idea": {"title": t["text"][:300], "body": ""},
                                       "routes": ctx["routes"], "known": ctx["known"]})
        base = keyword_route(t["text"], ctx["baseline_keys"])
        try:
            out = route(llm, body)
        except LLMOutputError as e:
            rows.append({"id": t["id"], "error": str(e)[:200], "baseline": base})
            print(f"{t['id']}  ERROR")
            continue
        ms.append(out.ms)
        verdict = "duplicate" if out.same_as else "related" if out.related else "new"
        got = out.same_as or out.related
        dedup_ok = verdict == t["dedup"] and (verdict == "new" or got in t["match"])
        row = {"id": t["id"], "gold": t["route"], "got": out.route_id, "baseline": base,
               "top1": out.route_id == t["route"], "ok": out.route_id == t["route"] or out.route_id in t["alt"],
               "baseline_ok": base == t["route"] or base in t["alt"],
               "dedup_expected": t["dedup"], "dedup_got": verdict, "matched": got, "dedup_ok": dedup_ok,
               "confidence": out.confidence, "reason": out.reason, "ms": out.ms}
        rows.append(row)
        print(f"{t['id']}  route {str(out.route_id):5} gold {str(t['route']):5} {'✓' if row['ok'] else '✗'}"
              f"   dedup {verdict:9} {str(got):4} {'✓' if dedup_ok else '✗'}   {out.ms / 1000:.1f}s")

    done = [r for r in rows if "error" not in r]
    n = len(ideas)
    pct = lambda k, rs=done: round(100 * sum(r[k] for r in rs) / n)  # noqa: E731 - errors count as misses
    dups = [r for r in done if r["dedup_expected"] == "duplicate"]
    summary = {
        "model": settings.llm_model, "prompt": PROMPT_VERSION, "ideas": n, "errors": n - len(done),
        "route_top1": pct("top1"), "route_ok_incl_alternatives": pct("ok"),
        "keywords_baseline_ok": round(100 * sum(r["baseline"] == t["route"] or r["baseline"] in t["alt"]
                                                for r, t in zip(rows, ideas)) / n),
        "dedup_accuracy": pct("dedup_ok"),
        "duplicates_found": f"{sum(r['dedup_got'] == 'duplicate' and r['dedup_ok'] for r in dups)}/"
                            f"{sum(t['dedup'] == 'duplicate' for t in ideas)}",
        "false_duplicates": sum(r["dedup_got"] == "duplicate" and r["dedup_expected"] != "duplicate" for r in done),
        "invalid_json_attempts": llm.invalid,
        "seconds_median": round(statistics.median(ms) / 1000, 1) if ms else None,
        "seconds_max": round(max(ms) / 1000, 1) if ms else None,
    }
    print(json.dumps(summary, indent=1))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = HERE / "results"
    out_dir.mkdir(exist_ok=True)
    (out_dir / f"{stamp}_{settings.llm_model.replace(':', '-')}.json").write_text(
        json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=1) + "\n")
    return run_live_cases(llm, threshold)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--recorded", type=Path, help="score recorded answers (no model call)")
    ap.add_argument("--record-keywords", nargs="?", const=RECORDED, type=Path, metavar="FILE",
                    help="write the keyword router's answers as a recorded file (default eval/recorded/routing.json)")
    ap.add_argument("--threshold", type=float, default=None,
                    help=f"minimum overall accuracy (default: the recorded file's, else {DEFAULT_THRESHOLD})")
    args = ap.parse_args()
    if args.record_keywords:
        record_keywords(args.record_keywords)
        sys.exit(0)
    if args.recorded:
        sys.exit(run_recorded(args.recorded, args.threshold))
    started = time.time()
    code = main(args.threshold)
    print(f"total {time.time() - started:.0f}s")
    sys.exit(code)
