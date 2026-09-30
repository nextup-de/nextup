"""Run the Acme test ideas through the brain and score it against the keyword router.

    uv run python -m eval.run_eval            # uses LLM_* from .env or the environment

acme.json is a snapshot of the demo seed (apps/app/src/features/demo/seed.ts): the rows and
earlier items the app sends. Results land in eval/results/<timestamp>_<model>.json.
"""

import json
import statistics
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


def main() -> None:
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


if __name__ == "__main__":
    started = time.time()
    main()
    print(f"total {time.time() - started:.0f}s")
