"""Run coach turns on realistic first messages and check the grilling rules on real output.

    uv run python -m eval.run_coach

Checks per case: a valid answer came back (the retries in brain/coach.py enforce one question,
no score talk, a concrete suggestion), and - where the case has an earlier item about the same
problem - that the coach used one. Read the printed turns too: tone is not something a script
can check. Uses the same Acme snapshot as the routing eval (eval/acme.json).
"""

import json
import statistics
from pathlib import Path

from brain.coach import coach
from brain.config import get_settings
from brain.llm import LLMClient, LLMOutputError
from brain.schemas import CoachIn

HERE = Path(__file__).parent


def brief(case: dict) -> str:
    """The shape of the app's coachBrief() (apps/app/src/features/ideas/coach.ts)."""
    if not case["weak"]:
        return "The idea scores 74/100; it can be published at 70. The scores are computed, not yours to change - never state a different number.\nTell them it is ready to publish."
    return (f"The idea scores 38/100; it can be published at 70. The scores are computed, not yours to change - never state a different number.\n"
            f"- {case['weak']}: 20/100 (missing: {case['missing']})\n"
            f"Ask exactly one short, challenging question that would raise \"{case['weak']}\". Do not answer it yourself.")


def main() -> None:
    ctx = json.loads((HERE / "acme.json").read_text())
    cases = json.loads((HERE / "coach_cases.json").read_text())
    llm = LLMClient(get_settings())
    ok, used, should, ms = 0, 0, 0, []
    for c in cases:
        body = CoachIn.model_validate({
            "company": ctx["company"], "idea": {"title": c["title"], "body": c["body"]},
            "history": [{"role": "user", "text": c["title"]}] + ([{"role": "user", "text": c["body"]}] if c["body"] else []),
            "brief": brief(c), "known": ctx["known"]})
        try:
            out = coach(llm, body)
        except LLMOutputError as e:
            print(f"\n{c['id']}  ERROR {str(e)[:120]}")
            continue
        ok += 1
        ms.append(out.ms)
        if c["earlier"]:
            should += 1
            used += out.earlier_id in c["earlier"]
        print(f"\n{c['id']}  {c['title']}\n  point: {out.open_point}   earlier: {out.earlier_id}   {out.ms / 1000:.1f}s"
              f"\n  note: {out.note}\n  ask:  {out.question}\n  why:  {out.why}\n  rec:  {out.recommended}")
    print(json.dumps({"model": llm.settings.llm_model, "valid": f"{ok}/{len(cases)}",
                      "earlier_item_used": f"{used}/{should}", "invalid_attempts": llm.invalid,
                      "seconds_median": round(statistics.median(ms) / 1000, 1) if ms else None}, indent=1))


if __name__ == "__main__":
    main()
