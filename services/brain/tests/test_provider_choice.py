"""AIB-Z2: the chosen provider. No model is called.

    uv run --frozen pytest tests/test_provider_choice.py -k aib_choice

eval/recorded/chosen.json holds the answers of the provider eval.compare chooses from the recordings
on main, with a threshold of its accuracy rounded down, never below 0.80. It lives next to routing.json,
which stays the keyword router's mirror (apps/app tests/unit/routing.test.ts). Kevin chose Azure OpenAI
alone on 12 Nov 2026; a bedrock.json added later takes part in the choice by itself.
"""

import json
import math
from pathlib import Path

from eval.compare import MIN_ACCURACY, choose
from eval.run_eval import run_recorded

RECORDED = Path(__file__).resolve().parent.parent / "eval" / "recorded"
CHOSEN = RECORDED / "chosen.json"
PROVIDERS = ("bedrock", "azure-openai")


def recordings() -> list[dict]:
    files = [RECORDED / f"{p}.json" for p in PROVIDERS]
    return [json.loads(f.read_text(encoding="utf-8")) for f in files if f.exists()]


def chosen() -> dict:
    return json.loads(CHOSEN.read_text(encoding="utf-8"))


def test_aib_choice_is_the_winner_of_the_recordings():
    recs = recordings()
    assert recs, "no provider recording in eval/recorded"
    winner = choose(recs)["winner"]
    assert winner is not None, "no provider qualifies: the AI stays off for the pilot (PILOT/HD8)"
    c = chosen()
    assert (c["provider"], c["model"]) == (winner["provider"], winner["model"])
    rec = next(r for r in recs if r["provider"] == winner["provider"])
    assert c["answers"] == rec["answers"]
    assert c["prompt_version"] == rec["prompt_version"]


def test_aib_choice_threshold_is_its_accuracy_rounded_down_and_never_below_080():
    winner = choose(recordings())["winner"]
    c = chosen()
    assert c["threshold"] == max(MIN_ACCURACY, math.floor(winner["accuracy"] * 100) / 100)
    assert c["threshold"] >= MIN_ACCURACY


def test_aib_choice_scores_at_or_above_its_threshold():
    assert run_recorded(CHOSEN, None) == 0


def test_aib_choice_fails_when_three_answers_flip(tmp_path):
    from eval.run_eval import load_cases

    c = chosen()
    right = [x for x in load_cases() if c["answers"].get(x["id"]) == x["route_id"]]
    for x in right[:3]:
        c["answers"][x["id"]] = "r0-wrong"
    broken = tmp_path / "chosen.json"
    broken.write_text(json.dumps(c), encoding="utf-8")
    assert run_recorded(broken, None) != 0


def test_aib_choice_is_not_the_keyword_router():
    assert chosen()["model"] != json.loads((RECORDED / "routing.json").read_text(encoding="utf-8"))["model"]
