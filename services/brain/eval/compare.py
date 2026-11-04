"""Compare recorded provider runs and name the cheaper one that qualifies.

    uv run python -m eval.compare eval/recorded/bedrock.json eval/recorded/azure-openai.json

A provider qualifies with overall accuracy >= 0.80 on the 84 cases and p95 latency <= 8000 ms per
route call (the raise timeout). Among those the lower cost_usd wins; on equal cost the lower p95.
Exits 1 when none qualifies.
"""

import argparse
import json
import sys
from pathlib import Path

from eval.run_eval import load_cases, score

MIN_ACCURACY = 0.80
MAX_P95_MS = 8000


def choose(records: list[dict], cases: list[dict] | None = None) -> dict:
    """Pure: {"rows": every record with its accuracy and whether it qualifies, "winner": a row or None}."""
    cases = load_cases() if cases is None else cases
    rows = []
    for r in records:
        acc = score(cases, r["answers"])["overall"]["accuracy"]
        p95 = r["latency_ms"]["p95"]
        rows.append({"provider": r["provider"], "model": r.get("model"), "accuracy": acc, "p95_ms": p95,
                     "p50_ms": r["latency_ms"].get("p50"), "errors": r.get("errors", 0), "cost_usd": r["cost_usd"],
                     "qualifies": acc >= MIN_ACCURACY and p95 <= MAX_P95_MS})
    ok = sorted((x for x in rows if x["qualifies"]), key=lambda x: (x["cost_usd"], x["p95_ms"], x["provider"]))
    return {"rows": rows, "winner": ok[0] if ok else None}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("files", nargs="+", type=Path, help="record files from run_eval --record")
    args = ap.parse_args(argv)
    result = choose([json.loads(f.read_text(encoding="utf-8")) for f in args.files])
    print(f"{'provider':13} {'model':28} {'accuracy':>8} {'p50 ms':>7} {'p95 ms':>7} {'errors':>6} {'cost USD':>9}  qualifies")
    for x in result["rows"]:
        print(f"{x['provider']:13} {str(x['model'])[:28]:28} {x['accuracy']:8.3f} {x['p50_ms']:7} {x['p95_ms']:7} "
              f"{x['errors']:6} {x['cost_usd']:9.4f}  {'yes' if x['qualifies'] else 'no'}")
    w = result["winner"]
    if w is None:
        print(f"No provider qualifies (accuracy >= {MIN_ACCURACY}, p95 <= {MAX_P95_MS} ms): keep the AI off for the pilot.")
        return 1
    print(f"Winner: {w['provider']} ({w['model']}), cost {w['cost_usd']:.4f} USD, p95 {w['p95_ms']} ms")
    return 0


if __name__ == "__main__":
    sys.exit(main())
