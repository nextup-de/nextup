"""Run the Acme test ideas through the brain and score it against the keyword router.

    uv run python -m eval.run_eval            # uses LLM_* from .env or the environment
    uv run python -m eval.run_eval --recorded eval/recorded/routing.json   # no model: score recorded answers
    uv run python -m eval.run_eval --record-keywords                       # write the keyword router's answers
    uv run python -m eval.run_eval --provider bedrock --model <id> --record eval/recorded/bedrock.json \
        --price-in <usd/MTok> --price-out <usd/MTok> [--region eu-central-1]   # record one provider
    AZURE_OPENAI_KEY=... uv run python -m eval.run_eval --provider azure-openai --model <deployment> \
        --endpoint https://<resource>.openai.azure.com/openai/v1 --record eval/recorded/azure-openai.json \
        --price-in <usd/MTok> --price-out <usd/MTok>

acme.json is a snapshot of the demo seed (apps/app/src/features/demo/seed.ts): the rows and
earlier items the app sends. Results land in eval/results/<timestamp>_<model>.json.
"""

import argparse
import json
import math
import os
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from brain.config import get_settings
from brain.llm import LLMClient, LLMOutputError
from brain.route import PROMPT_VERSION, route
from brain.schemas import BedrockOverride, LlmOverride, RouteIn

HERE = Path(__file__).parent


# features/routing keywords-v2, mirrored: tests/unit/routing.test.ts in apps/app holds the app's matcher
# to the answers this one records.
ROUTER_VERSION = "keywords-v2"
SHORT_KEYWORD = 4
_FOLD = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})
_NOT_WORD = re.compile(r"[\W_]+")


def _fold(s: str) -> str:
    """Lower case, and ä ö ü ß written out."""
    return s.lower().translate(_FOLD)


def _spaced(s: str) -> str:
    """The words of a text, one space between them and one at each end."""
    return " " + _NOT_WORD.sub(" ", _fold(s)).strip() + " "


def keyword_found(text: str, key: str) -> bool:
    """A short keyword is a whole word (a plural -s allowed), a longer one may sit inside a word."""
    k = _spaced(key).strip()
    if not k:  # no letter or digit, such as "€": anywhere in the text
        sign = _fold(key).strip()
        return sign != "" and sign in _fold(text)
    words = _spaced(text)
    if len(k) <= SHORT_KEYWORD:
        return f" {k} " in words or f" {k}s " in words
    return k in words


def keyword_route(text: str, keys: dict[str, list[str]]) -> str | None:
    """features/routing proposeRoute(): the row with the most keyword hits, first one on a tie."""
    best, hits = None, 0
    for rid, ks in keys.items():
        n = sum(keyword_found(text, k) for k in ks)
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
    path.write_text(json.dumps({"model": ROUTER_VERSION, "prompt_version": PROMPT_VERSION,
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


def percentile(values: list[float], q: float) -> float:
    """Nearest-rank percentile; 0 for no values."""
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[max(math.ceil(q * len(ordered)) - 1, 0)]


def build_override(provider: str, model: str, region: str = "eu-central-1",
                   endpoint: str | None = None) -> LlmOverride | BedrockOverride:
    """The override a real request carries. The Azure key is read from the environment, never an argument."""
    if provider == "bedrock":
        return BedrockOverride(provider="bedrock", region=region, model=model)
    if provider == "azure-openai":
        key = os.environ.get("AZURE_OPENAI_KEY", "")
        if not endpoint:
            raise SystemExit("azure-openai needs --endpoint")
        if not key:
            raise SystemExit("azure-openai needs the key in the environment variable AZURE_OPENAI_KEY")
        return LlmOverride(base_url=endpoint, model=model, api_key=key, provider="azure-openai")
    raise SystemExit(f"unknown provider {provider!r}")


def record_provider(override: LlmOverride | BedrockOverride, price_in: float, price_out: float,
                    threshold: float = DEFAULT_THRESHOLD, base: LLMClient | None = None) -> dict:
    """Run the 84 cases through one provider the way a request would (for_request) and return the record.

    The record holds answers, counts and timings only: no key, endpoint, region or account id.
    """
    ctx = json.loads((HERE / "acme.json").read_text(encoding="utf-8"))
    cases = load_cases()
    base = base or LLMClient(get_settings())
    answers: dict[str, str | None] = {}
    errors = tokens_in = tokens_out = 0
    ms: list[float] = []
    model: str | None = None
    for c in cases:
        body = RouteIn.model_validate({"company": ctx["company"], "idea": {"title": c["text"][:300], "body": ""},
                                       "routes": ctx["routes"], "known": ctx["known"]})
        started = time.perf_counter()
        llm = base.for_request(override)
        try:
            answers[c["id"]] = route(llm, body).route_id
        except Exception as e:  # noqa: BLE001 - a failed call is a miss, not the end of the run
            errors += 1
            print(f"{c['id']}  ERROR {type(e).__name__}")
        ms.append((time.perf_counter() - started) * 1000)
        tokens_in += llm.tokens_in
        tokens_out += llm.tokens_out
        model = llm.answered_by or model
    return {"provider": override.provider, "model": model or override.model, "prompt_version": PROMPT_VERSION,
            "threshold": threshold, "answers": answers, "errors": errors,
            "tokens_in": tokens_in, "tokens_out": tokens_out,
            "latency_ms": {"p50": round(percentile(ms, 0.5)), "p95": round(percentile(ms, 0.95))},
            "usd_per_mtok": {"in": price_in, "out": price_out},
            "cost_usd": round(tokens_in * price_in / 1e6 + tokens_out * price_out / 1e6, 6),
            "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def run_provider(args: argparse.Namespace) -> int:
    missing = [f for f in ("model", "record", "price_in", "price_out") if getattr(args, f) is None]
    if missing:
        raise SystemExit("--provider needs " + ", ".join("--" + m.replace("_", "-") for m in missing))
    override = build_override(args.provider, args.model, args.region, args.endpoint)
    need = args.threshold if args.threshold is not None else DEFAULT_THRESHOLD
    rec = record_provider(override, args.price_in, args.price_out, need)
    args.record.parent.mkdir(parents=True, exist_ok=True)
    args.record.write_text(json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {args.record}")
    acc = score(load_cases(), rec["answers"])["overall"]["accuracy"]
    print(f"{rec['provider']} {rec['model']}  accuracy {acc:.3f}  errors {rec['errors']}  "
          f"p50 {rec['latency_ms']['p50']} ms  p95 {rec['latency_ms']['p95']} ms  cost {rec['cost_usd']:.4f} USD")
    return 0 if acc >= need else 1


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
    ap.add_argument("--provider", choices=("bedrock", "azure-openai"), help="record one provider's run")
    ap.add_argument("--model", help="Bedrock model id, or the Azure deployment name")
    ap.add_argument("--record", type=Path, metavar="FILE", help="where the record goes, e.g. eval/recorded/bedrock.json")
    ap.add_argument("--price-in", type=float, help="USD per million input tokens")
    ap.add_argument("--price-out", type=float, help="USD per million output tokens")
    ap.add_argument("--region", default="eu-central-1", help="bedrock region (default eu-central-1)")
    ap.add_argument("--endpoint", help="azure-openai endpoint; the key comes from AZURE_OPENAI_KEY")
    args = ap.parse_args()
    if args.provider:
        sys.exit(run_provider(args))
    if args.record_keywords:
        record_keywords(args.record_keywords)
        sys.exit(0)
    if args.recorded:
        sys.exit(run_recorded(args.recorded, args.threshold))
    started = time.time()
    code = main(args.threshold)
    print(f"total {time.time() - started:.0f}s")
    sys.exit(code)
