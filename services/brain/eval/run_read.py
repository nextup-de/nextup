"""Read the hard cases and check the answers: is this reading right, and would the app take it?

    uv run python -m eval.run_read             # the model in LLM_*
    uv run python -m eval.run_read --offline   # no model: canned answers through the real code
    uv run python -m eval.run_read --provider bedrock --model <id> [--region eu-central-1]
    AZURE_OPENAI_KEY=... uv run python -m eval.run_read --provider azure-openai --model <deployment> --endpoint <url>

--offline proves the eval, not the model: a good canned answer has to pass and a bad one has to be
caught, so a check that can never fail shows up here. It says nothing about what a real model does.
Live, it exits 1 when any case fails. Read the printed readings too: quality is not something a
script can check. Cases are eval/read_cases.json, company data the demo's (eval/acme.json).
"""

import json
import re
import statistics
import sys
from pathlib import Path
from typing import Callable

from brain.config import Settings
from brain.llm import LLMClient, LLMOutputError
from brain.read import PROMPT_VERSION, read_idea
from brain.schemas import DIALS, ReadIn, ReadOut
from eval.run_coach import client

HERE = Path(__file__).parent
STABLE_WITHIN = 10  # a dial with no reason to move may wobble this much, not cross a band of the scale

# What the app takes (BrainReading, apps/app/src/features/ideas/reading.ts). One value over any of
# these and it throws away the whole reading. Counted in UTF-16 units, as JavaScript counts.
APP_MAX = {"note": 1000, "basis": 600, "summary": 1200, "advice_why": 600, "pattern": 600, "route_reason": 600,
           "route_id": 40, "same_as": 40, "related": 40, "model": 200, "version": 80}
APP_MAX_OPEN, APP_MAX_QUESTION = 8, 400

_GERMAN = {"der", "die", "das", "und", "ist", "nicht", "ein", "eine", "für", "mit", "wird", "auf", "den", "von", "zu"}
_ENGLISH = {"the", "and", "is", "not", "a", "for", "with", "it", "to", "of", "on", "this", "that"}


def units(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


def app_rejects(out: ReadOut) -> list[str]:
    """Why the app would throw this reading away."""
    bad: list[str] = []
    values = {k: getattr(out, k) for k in ("summary", "advice_why", "pattern", "route_reason", "route_id", "same_as", "related", "model", "version")}
    values |= {f"{d.key} {part}": getattr(d, part) for d in out.dials for part in ("note", "basis")}
    for name, value in values.items():
        limit = APP_MAX[name.split()[-1]]
        if value is not None and units(value) > limit:
            bad.append(f"{name} is {units(value)} long, the app takes {limit}")
    if [d.key for d in out.dials] != list(DIALS):
        bad.append(f"dials are {[d.key for d in out.dials]}")
    if len(out.open) > APP_MAX_OPEN:
        bad.append(f"{len(out.open)} open questions, the app takes {APP_MAX_OPEN}")
    bad += [f"an open question is {units(q)} long, the app takes {APP_MAX_QUESTION}" for q in out.open if units(q) > APP_MAX_QUESTION]
    return bad


def language(out: ReadOut) -> str:
    words = re.findall(r"[a-zäöüß]+", " ".join([out.summary, out.advice_why, out.pattern, *out.open, *(d.note for d in out.dials)]).lower())
    return "de" if sum(w in _GERMAN for w in words) > sum(w in _ENGLISH for w in words) else "en"


def judge(expect: dict, out: ReadOut, ctx: dict) -> list[str]:
    """What is wrong with this reading: first what holds for every case, then what this case expects."""
    bad = app_rejects(out)
    score = {d.key: d.score for d in out.dials}
    if out.overall != round(sum(score.values()) / len(score)):
        bad.append(f"overall {out.overall} is not the mean of the dials")
    shown = [out.summary, out.advice_why, out.pattern, out.route_reason, *out.open, *(d.note for d in out.dials), *(d.basis for d in out.dials)]
    ids = [x["id"] for x in ctx["known"] + ctx["routes"]]
    bad += [f"shows the id {i}" for i in ids if re.search(rf"\b{re.escape(i)}\b", " ".join(shown))]
    bad += [f"not a question: {q!r}" for q in out.open if not q.endswith("?")]
    if out.advice == "info" and not out.open:
        bad.append('advice "info" with nothing to ask')
    for key, limit in expect.get("max", {}).items():
        if score[key] > limit:
            bad.append(f"{key} {score[key]} above {limit}")
    for key, limit in expect.get("min", {}).items():
        if score[key] < limit:
            bad.append(f"{key} {score[key]} below {limit}")
    if "all_max" in expect:
        bad += [f"{k} {v} above {expect['all_max']}" for k, v in score.items() if v > expect["all_max"]]
    if "overall_max" in expect and out.overall > expect["overall_max"]:
        bad.append(f"overall {out.overall} above {expect['overall_max']}")
    if "overall_min" in expect and out.overall < expect["overall_min"]:
        bad.append(f"overall {out.overall} below {expect['overall_min']}")
    if "advice" in expect and out.advice not in expect["advice"]:
        bad.append(f"advice {out.advice}, expected {expect['advice']}")
    if "route" in expect and out.route_id not in expect["route"]:
        bad.append(f"route {out.route_id}, expected {expect['route']}")
    if "same_as" in expect and out.same_as not in expect["same_as"]:
        bad.append(f"same_as {out.same_as}, expected {expect['same_as']}")
    if "writes" in expect and language(out) != expect["writes"]:
        bad.append(f"written in {language(out)}, prompts/read.md asks for {expect['writes']}")
    return bad


def judge_second(then: dict, first: ReadOut, second: ReadOut) -> list[str]:
    was, now = ({d.key: d.score for d in r.dials} for r in (first, second))
    bad = [f"{k} did not rise ({was[k]} -> {now[k]})" for k in then.get("rise", []) if now[k] <= was[k]]
    bad += [f"{k} moved {was[k]} -> {now[k]}" for k in then.get("stable", []) if abs(now[k] - was[k]) > STABLE_WITHIN]
    return bad


def request(ctx: dict, case: dict, idea: dict, previous: list[dict]) -> ReadIn:
    """The request as the app builds it (readRequest, features/ideas/reading.ts)."""
    return ReadIn.model_validate({
        "company": ctx["company"], "idea": idea, "goals": ctx["goals"], "routes": ctx["routes"], "known": ctx["known"],
        "spend_limit_eur": ctx["spend_limit_eur"], "skip": case.get("skip", []), "previous": previous})


Ask = Callable[[ReadIn, str], ReadOut]


def run_case(case: dict, ctx: dict, ask: Ask) -> tuple[list[ReadOut], list[str]]:
    """The readings of one case and what is wrong with them. A reading that never came back is wrong."""
    readings: list[ReadOut] = []
    try:
        first = ask(request(ctx, case, case["idea"], []), "first")
        readings.append(first)
        bad = judge(case["expect"], first, ctx)
        if then := case.get("then"):
            idea = {**case["idea"], "body": (case["idea"]["body"] + "\n" + then["add"]).strip()}
            previous = [d.model_dump(exclude={"basis"}) for d in first.dials]
            second = ask(request(ctx, case, idea, previous), "then")
            readings.append(second)
            bad += judge({}, second, ctx) + judge_second(then, first, second)
    except LLMOutputError as e:
        return readings, [f"no reading: {str(e)[:160]}"]
    except Exception as e:  # noqa: BLE001 - report every case, the way eval/smoke.py does
        return readings, [f"no reading: {type(e).__name__}: {str(e)[:160]}"]
    return readings, bad


# ---------------------------------------------------------------- offline
class Canned(LLMClient):
    """Answers from the case instead of a model, the way tests/conftest.py's FakeLLM does."""

    def __init__(self, answer: dict):
        super().__init__(Settings(llm_model="canned", llm_max_retries=2, _env_file=None))
        self.answer = answer
        self.calls: list[dict] = []

    def complete_json(self, system: str, user: str, schema: dict, name: str) -> str:
        self.calls.append({"system": system, "user": user, "schema": schema})
        return json.dumps(self.answer)


def canned(spec: dict) -> dict:
    """A full answer from a case's short form: its scores, advice, ids and questions."""
    text = spec.get("text", "The idea names a concrete step, and this is how far that carries it.")
    return {
        **{k: {"note": text, "basis": "A number would move this most.", "score": s} for k, s in zip(DIALS, spec["scores"])},
        "summary": text, "closest_id": spec.get("closest_id", ""), "comparison": "-", "same_problem": spec.get("same_problem", False),
        "route_id": spec["route_id"], "route_reason": text, "pattern": text, "advice": spec["advice"], "advice_why": text, "open": spec["open"],
    }


def offline_ask(first: dict, then: dict | None, calls: list[dict] | None = None) -> Ask:
    def ask(body: ReadIn, step: str) -> ReadOut:
        llm = Canned(canned(first if step == "first" else then or first))
        out = read_idea(llm, body)
        if calls is not None:
            calls.extend(llm.calls)
        return out
    return ask


def run_offline(cases: list[dict], ctx: dict) -> int:
    print("OFFLINE: canned answers, no model was called. This proves the checks, not the model.\n")
    wrong = 0
    for c in cases:
        _, good = run_case(c, ctx, offline_ask(c["good"], c.get("good_then")))
        _, bad = run_case(c, ctx, offline_ask(c.get("bad", c["good"]), c.get("bad_then", c.get("good_then"))))
        caught = any(c["caught"] in b for b in bad)
        ok = not good and caught
        wrong += not ok
        print(f"{c['id']:11} {'ok  ' if ok else 'FAIL'} good answer passes: {not good}  bad answer caught: {caught}  ({c['what']})")
        for problem in good if not ok else []:
            print(f"    good answer: {problem}")
        if not caught:
            print(f"    expected a problem with {c['caught']!r}, got {bad}")
    print(json.dumps({"offline": True, "prompt": PROMPT_VERSION, "cases": len(cases), "wrong": wrong}, indent=1))
    return 1 if wrong else 0


# ---------------------------------------------------------------- live
def show(r: ReadOut) -> None:
    print("  " + "  ".join(f"{d.key} {d.score}" for d in r.dials) + f"   overall {r.overall}   advice {r.advice}   route {r.route_id}   same {r.same_as}   related {r.related}   writes {language(r)}")
    print(f"  summary: {r.summary}\n  pattern: {r.pattern}\n  why:     {r.advice_why}")
    for d in r.dials:
        print(f"    {d.key}: {d.note}")
    print("  open:    " + " | ".join(r.open))


def run_live(cases: list[dict], ctx: dict, ask: Ask, model: str) -> int:
    passed, answered, seen = 0, 0, []
    for c in cases:
        print(f"\n{c['id']}  {c['what']}\n  {c['idea']['title']}")
        readings, bad = run_case(c, ctx, ask)
        for r in readings:
            show(r)
        seen += readings
        answered += bool(readings)
        passed += not bad
        print("  ok" if not bad else "".join(f"  FAIL {b}\n" for b in bad).rstrip())
    if not answered:
        print("\nNo model answered: this run says nothing about the reading.")
    print(json.dumps({
        "model": model, "prompt": PROMPT_VERSION, "passed": f"{passed}/{len(cases)}",
        "seconds_median": round(statistics.median(r.ms for r in seen) / 1000, 1) if seen else None,
        "seconds_max": round(max(r.ms for r in seen) / 1000, 1) if seen else None,
        "tokens_out_max": max((r.tokens_out for r in seen), default=None),
    }, indent=1))
    return 0 if passed == len(cases) else 1


def load() -> tuple[list[dict], dict]:
    return json.loads((HERE / "read_cases.json").read_text(encoding="utf-8")), json.loads((HERE / "acme.json").read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    cases, ctx = load()
    if "--offline" in args:
        return run_offline(cases, ctx)
    llm = client(args)
    return run_live(cases, ctx, lambda body, _: read_idea(llm.for_request(None), body), llm.settings.llm_model)


if __name__ == "__main__":
    sys.exit(main())
