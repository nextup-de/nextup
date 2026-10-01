"""Whole conversations with the coach: does it move forward, or does it ask again?

    uv run python -m eval.run_dialogs            # prints each conversation, then the scores
    uv run python -m eval.run_dialogs -q         # scores only

Eight scripted employees (eval/coach_dialogs.json) know the answer to every point - problem,
context, evidence, impact, solution, risks, success - and give it when the coach asks about that
point. Some answer vaguely the first time ("vague"), the way people do. This script plays the app
too: it sends the brief the app would (impact missing until there is a number, then a first step,
then ready) and stops when the idea would be ready to publish, where the app stops asking the brain.

Scores, per conversation and in total:
  repeats      a point asked again after it was answered, or a third time after a vague answer
  near_copies  a question worded like an earlier one (shared words), whatever its label
  order        solution, risks or success asked before the impact is known (the app's own order)
  coverage     of problem, context, impact and solution: how many were answered
  failed       turns where the brain gave no valid answer (the app shows the offline coach)
"""

import json
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from brain.coach import PROMPT_VERSION, coach
from brain.config import get_settings
from brain.llm import LLMClient, LLMOutputError
from brain.schemas import CoachIn

HERE = Path(__file__).parent
TURNS = 6
CORE = ["problem", "context", "impact", "solution"]
LATE = {"solution", "risks", "success_measure"}
VAGUE = "Not sure, quite a lot I think."
STOP = {"the", "a", "an", "is", "are", "do", "does", "this", "that", "it", "you", "your", "of", "to", "in", "on", "for",
        "how", "what", "why", "which", "who", "when", "and", "or", "with", "there", "be", "can", "would"}


def words(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", s.lower())) - STOP


def near_copy(q: str, earlier: list[str]) -> bool:
    w = words(q)
    return any(w and len(w & words(e)) / len(w | words(e)) >= 0.6 for e in earlier)


def brief(answered: set[str]) -> str:
    """The shape of the app's coachBrief(), driven by what the employee has said so far."""
    head = "The scores are computed, not yours to change - never state a different number."
    if "impact" not in answered:
        return f"The idea scores 41/100; it can be published at 70. {head}\n- Impact & reach: 20/100 (missing: Put a number on the upside)\nAsk exactly one short, challenging question that would raise \"Impact & reach\". Do not answer it yourself."
    if "solution" not in answered:
        return f"The idea scores 58/100; it can be published at 70. {head}\n- Feasibility: 40/100 (missing: What is the smallest first step)\nAsk exactly one short, challenging question that would raise \"Feasibility\". Do not answer it yourself."
    return ""  # ready: the app's offline coach takes over


def dialog(llm: LLMClient, ctx: dict, d: dict, verbose: bool) -> dict:
    turns = [{"role": "user", "text": d["first"]}]
    answered: set[str] = set()
    asked: dict[str, int] = {}
    questions: list[str] = []
    out = {"id": d["id"], "turns": 0, "failed": 0, "repeats": 0, "near_copies": 0, "order": 0, "ms": [], "points": []}
    if verbose:
        print(f"\n━━ {d['id']}  Employee: {d['first']}")
    for _ in range(TURNS):
        b = brief(answered)
        if not b:
            break
        mine = [t["text"] for t in turns if t["role"] == "user"]
        body = CoachIn.model_validate({"company": ctx["company"], "idea": {"title": mine[0][:300], "body": "\n".join(mine[1:])[:5000]},
                                       "history": turns[-20:], "brief": b, "known": ctx["known"]})
        out["turns"] += 1
        try:
            c = coach(llm, body)
        except LLMOutputError:
            out["failed"] += 1
            if verbose:
                print("   Coach: [no valid answer - the app would show the offline coach]")
            break
        out["ms"].append(c.ms)
        p = c.open_point
        out["points"].append(p)
        if p == "none":
            break
        bad = p in answered or asked.get(p, 0) >= 2
        copy = near_copy(c.question, questions)
        out["repeats"] += bad
        out["near_copies"] += copy
        out["order"] += p in LATE and "impact" not in answered
        asked[p] = asked.get(p, 0) + 1
        questions.append(c.question)
        if p in d["facts"] and not (p in d["vague"] and asked[p] == 1):
            reply = d["facts"][p]
            answered.add(p)
        elif p in d["facts"]:
            reply = VAGUE
        else:
            reply = "I'm not sure what you mean."
        if verbose:
            flag = "  ⟲ REPEAT" if bad else "  ≈ NEAR-COPY" if copy else ""
            print(f"   Coach [{p}, {c.ms / 1000:.0f}s]: {c.question}{flag}\n   Employee: {reply}")
        turns += [{"role": "assistant", "text": f"{c.note}\n\n{c.question} {c.why}".strip()}, {"role": "user", "text": reply}]
    out["coverage"] = sum(p in answered for p in CORE)
    return out


def main() -> None:
    verbose = "-q" not in sys.argv
    ctx = json.loads((HERE / "acme.json").read_text())
    dialogs = json.loads((HERE / "coach_dialogs.json").read_text())
    llm = LLMClient(get_settings())
    started = time.time()
    rows = [dialog(llm, ctx, d, verbose) for d in dialogs]
    ms = [m for r in rows for m in r["ms"]]
    total = lambda k: sum(r[k] for r in rows)  # noqa: E731
    summary = {
        "model": llm.settings.llm_model, "prompt": PROMPT_VERSION, "dialogs": len(rows), "coach_turns": total("turns"),
        "repeats": total("repeats"), "near_copies": total("near_copies"), "order_mistakes": total("order"),
        "coverage": f"{total('coverage')}/{len(CORE) * len(rows)}", "failed_turns": total("failed"),
        "invalid_attempts": llm.invalid,
        "seconds_median": round(statistics.median(ms) / 1000, 1) if ms else None,
        "seconds_max": round(max(ms) / 1000, 1) if ms else None,
        "minutes": round((time.time() - started) / 60, 1),
    }
    for r in rows:
        print(f"{r['id']}  turns {r['turns']}  repeats {r['repeats']}  near-copies {r['near_copies']}  order {r['order']}"
              f"  coverage {r['coverage']}/4  failed {r['failed']}  points {' > '.join(r['points'])}")
    print(json.dumps(summary, indent=1))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    (HERE / "results").mkdir(exist_ok=True)
    (HERE / "results" / f"{stamp}_dialogs_{PROMPT_VERSION}.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=1) + "\n")


if __name__ == "__main__":
    main()
