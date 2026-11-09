"""One read, one coach, one plan and one checkin call through a provider; exits 1 when one fails.

    uv run python -m eval.smoke --provider bedrock --model <id> [--region eu-central-1]
    AZURE_OPENAI_KEY=... uv run python -m eval.smoke --provider azure-openai --model <deployment> --endpoint <url>
"""

import argparse
import sys

from brain.coach import coach
from brain.config import get_settings
from brain.llm import LLMClient
from brain.plan import checkin, plan
from brain.read import read_idea
from brain.schemas import CheckinIn, CoachIn, PlanIn, ReadIn
from eval.run_eval import build_override

COMPANY = "Acme Maschinenbau GmbH"
IDEA = {"title": "Fixture changeover on line 4 takes 40 minutes",
        "body": "Every shift we lose time looking for the right clamps."}


GOALS = [{"name": "Less downtime", "kpi": "minutes per changeover"}]


def calls() -> dict[str, tuple]:
    return {
        "read": (read_idea, ReadIn.model_validate({"company": COMPANY, "idea": IDEA, "goals": GOALS})),
        "coach": (coach, CoachIn.model_validate({
            "company": COMPANY, "idea": IDEA, "history": [{"role": "user", "text": IDEA["title"]}], "goals": GOALS,
            "reading": {"summary": "Lost time at changeovers, not sized yet.", "dials": [{"key": "value", "score": 30, "note": "No number yet."}],
                        "open": ["How many changeovers happen per week?"]}})),
        "plan": (plan, PlanIn.model_validate({"company": COMPANY, "idea": IDEA,
                                              "goals": [{"name": "Less downtime", "kpi": "minutes per changeover"}]})),
        "checkin": (checkin, CheckinIn.model_validate({
            "company": COMPANY, "idea": IDEA, "missing": "What a changeover costs per week.", "round": 1,
            "said": [{"who": "Team lead", "text": "About 5 changeovers a week, 40 minutes each."}],
            "weak": ["impact"]})),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--provider", required=True, choices=("bedrock", "azure-openai"))
    ap.add_argument("--model", required=True)
    ap.add_argument("--region", default="eu-central-1")
    ap.add_argument("--endpoint")
    args = ap.parse_args(argv)
    override = build_override(args.provider, args.model, args.region, args.endpoint)
    base = LLMClient(get_settings())
    failed = 0
    for name, (fn, body) in calls().items():
        try:
            out = fn(base.for_request(override), body)
            print(f"{name:8} ok   {out.ms} ms  {out.tokens_in} in / {out.tokens_out} out  model {out.model}")
        except Exception as e:  # noqa: BLE001 - report every call, then exit 1
            failed += 1
            print(f"{name:8} FAIL {type(e).__name__}: {str(e)[:200]}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
