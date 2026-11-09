"""Read and answer realistic first messages, and print them: is this worth showing an employee?

    uv run python -m eval.run_coach            # the model in LLM_*
    AZURE_OPENAI_KEY=... uv run python -m eval.run_coach --provider azure-openai --model <deployment> --endpoint <url>
    uv run python -m eval.run_coach --locale de   # as on a German page: flags an informal "du" as well

Checks per case: a valid reading and answer came back and - where the case has an earlier item about
the same problem - that it was found. Read the printed turns too: quality is not something a script
can check. Uses the same Acme snapshot as the routing eval (eval/acme.json).
"""

import argparse
import json
import re
import statistics
from pathlib import Path

from brain.coach import coach
from brain.config import get_settings
from brain.llm import LLMClient, LLMOutputError
from brain.read import read_idea
from brain.schemas import CoachIn, ReadIn
from eval.run_eval import build_override

HERE = Path(__file__).parent

# On a German page the app says "Sie": any of these in a reply means the model slipped.
INFORMAL = re.compile(r"\b(du|dein\w*|dir|dich)\b", re.I)


def page_locale(argv: list[str] | None = None) -> str:
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--locale", choices=("en", "de"), default="en")
    return ap.parse_known_args(argv)[0].locale


def client(argv: list[str] | None = None) -> LLMClient:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=("bedrock", "azure-openai"))
    ap.add_argument("--model")
    ap.add_argument("--region", default="eu-central-1")
    ap.add_argument("--endpoint")
    a, _ = ap.parse_known_args(argv)
    base = LLMClient(get_settings())
    return base.for_request(build_override(a.provider, a.model, a.region, a.endpoint)) if a.provider else base


def turn(llm: LLMClient, ctx: dict, idea: dict, history: list[dict], skip: list[str], previous: list[dict], locale: str = "en"):
    """One turn as the app runs it: the reading, then the coach working from it."""
    goals = ctx.get("goals", [])
    r = read_idea(llm, ReadIn.model_validate({
        "company": ctx["company"], "idea": idea, "goals": goals, "routes": ctx["routes"], "known": ctx["known"],
        "skip": skip, "previous": previous, "spend_limit_eur": ctx.get("spend_limit_eur"), "locale": locale}))
    c = coach(llm, CoachIn.model_validate({
        "company": ctx["company"], "idea": idea, "history": history[-20:], "goals": goals, "routes": ctx["routes"], "known": ctx["known"],
        "reading": {"summary": r.summary, "dials": [d.model_dump(exclude={"basis"}) for d in r.dials], "open": r.open, "same_as": r.same_as},
        "locale": locale}))
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
    locale = page_locale()
    ok, used, should, informal, ms = 0, 0, 0, 0, []
    for c in cases:
        history = [{"role": "user", "text": c["title"]}] + ([{"role": "user", "text": c["body"]}] if c["body"] else [])
        print(f"\n{c['id']}  {c['title']}")
        try:
            r, out = turn(llm, ctx, {"title": c["title"], "body": c["body"]}, history, [], [], locale)
        except LLMOutputError as e:
            print(f"  ERROR {str(e)[:120]}")
            continue
        except Exception as e:  # noqa: BLE001 - a 429 or a filter refusal is one case's error, not the end of the run
            print(f"  ERROR {type(e).__name__}: {str(e)[:120]}")
            continue
        ok += 1
        ms.append(r.ms + out.ms)
        if c["earlier"]:
            should += 1
            used += out.earlier_id in c["earlier"]
        show(r, out)
        if locale == "de" and (slip := INFORMAL.search(" ".join((out.answer, out.note, out.question, out.why, out.recommended)))):
            informal += 1
            print(f"  FAIL informal: {slip.group(0)!r}")
    print(json.dumps({"model": llm.settings.llm_model, "locale": locale, "valid": f"{ok}/{len(cases)}", "earlier_item_found": f"{used}/{should}", "informal": informal,
                      "seconds_median": round(statistics.median(ms) / 1000, 1) if ms else None}, indent=1))


if __name__ == "__main__":
    main()
