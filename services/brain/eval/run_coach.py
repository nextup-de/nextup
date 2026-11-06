"""Read and answer realistic first messages, and print them: is this worth showing an employee?

    uv run python -m eval.run_coach            # the model in LLM_*
    AZURE_OPENAI_KEY=... uv run python -m eval.run_coach --provider azure-openai --model <deployment> --endpoint <url>

Checks per case: a valid reading and answer came back and - where the case has an earlier item about
the same problem - that it was found. Read the printed turns too: quality is not something a script
can check. Uses the same Acme snapshot as the routing eval (eval/acme.json).
"""

import argparse
import json
import statistics
from pathlib import Path

from brain.coach import coach
from brain.config import get_settings
from brain.llm import LLMClient, LLMOutputError
from brain.read import read_idea
from brain.schemas import CoachIn, ReadIn
from eval.run_eval import build_override

HERE = Path(__file__).parent


def client(argv: list[str] | None = None) -> LLMClient:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=("bedrock", "azure-openai"))
    ap.add_argument("--model")
    ap.add_argument("--region", default="eu-central-1")
    ap.add_argument("--endpoint")
    a, _ = ap.parse_known_args(argv)
    base = LLMClient(get_settings())
    return base.for_request(build_override(a.provider, a.model, a.region, a.endpoint)) if a.provider else base


def turn(llm: LLMClient, ctx: dict, idea: dict, history: list[dict], skip: list[str], previous: list[dict]):
    """One turn as the app runs it: the reading, then the coach working from it."""
    goals = ctx.get("goals", [])
    r = read_idea(llm, ReadIn.model_validate({
        "company": ctx["company"], "idea": idea, "goals": goals, "routes": ctx["routes"], "known": ctx["known"],
        "skip": skip, "previous": previous, "spend_limit_eur": ctx.get("spend_limit_eur")}))
    c = coach(llm, CoachIn.model_validate({
        "company": ctx["company"], "idea": idea, "history": history[-20:], "goals": goals, "routes": ctx["routes"], "known": ctx["known"],
        "reading": {"summary": r.summary, "dials": [d.model_dump(exclude={"basis"}) for d in r.dials], "open": r.open, "same_as": r.same_as}}))
    return r, c


def show(r, c) -> None:
    print("  " + "  ".join(f"{d.key} {d.score}" for d in r.dials) + f"   overall {r.overall}   advice {r.advice}   route {r.route_id}   same {r.same_as}")
    print(f"  summary: {r.summary}\n  pattern: {r.pattern}\n  why:     {r.advice_why}")
    for d in r.dials:
        print(f"    {d.key}: {d.note}")
    print("  open:    " + " | ".join(r.open))
    if c.answer:
        print(f"  ANSWER:  {c.answer}")
    print(f"  NOTE:    {c.note}\n  ASK:     {c.question}\n  WHY:     {c.why}\n  GUESS:   {c.recommended}")


def main() -> None:
    ctx = json.loads((HERE / "acme.json").read_text())
    cases = json.loads((HERE / "coach_cases.json").read_text())
    llm = client()
    ok, used, should, ms = 0, 0, 0, []
    for c in cases:
        history = [{"role": "user", "text": c["title"]}] + ([{"role": "user", "text": c["body"]}] if c["body"] else [])
        print(f"\n{c['id']}  {c['title']}")
        try:
            r, out = turn(llm, ctx, {"title": c["title"], "body": c["body"]}, history, [], [])
        except LLMOutputError as e:
            print(f"  ERROR {str(e)[:120]}")
            continue
        ok += 1
        ms.append(r.ms + out.ms)
        if c["earlier"]:
            should += 1
            used += out.earlier_id in c["earlier"]
        show(r, out)
    print(json.dumps({"model": llm.settings.llm_model, "valid": f"{ok}/{len(cases)}", "earlier_item_found": f"{used}/{should}",
                      "seconds_median": round(statistics.median(ms) / 1000, 1) if ms else None}, indent=1))


if __name__ == "__main__":
    main()
