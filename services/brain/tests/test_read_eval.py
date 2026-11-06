"""The reading's eval (eval/run_read.py) can fail, and runs without a model."""
import pytest

from brain.read import read_idea
from brain.schemas import ReadOut
from eval.run_read import Canned, app_rejects, canned, judge, load, main, offline_ask, request, run_case, run_live

CASES, CTX = load()
BY_ID = {c["id"]: c for c in CASES}


def test_it_runs_offline_and_says_no_model_was_called(capsys):
    assert main(["--offline"]) == 0
    out = capsys.readouterr().out
    assert "no model was called" in out and '"wrong": 0' in out


def test_every_case_that_was_asked_for_is_there():
    assert {"sized", "vague", "mash", "injection", "german", "repeat", "over_limit", "second"} <= set(BY_ID)


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_a_good_answer_passes(case):
    assert run_case(case, CTX, offline_ask(case["good"], case.get("good_then")))[1] == []


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_a_bad_answer_is_caught(case):
    _, bad = run_case(case, CTX, offline_ask(case.get("bad", case["good"]), case.get("bad_then", case.get("good_then"))))
    assert any(case["caught"] in b for b in bad), bad


def test_the_second_reading_is_told_the_first_and_the_new_fact():
    case, calls = BY_ID["second"], []
    run_case(case, CTX, offline_ask(case["good"], case["good_then"], calls))
    assert "(this is the first reading)" in calls[0]["user"]
    assert "- value: 35 - " in calls[1]["user"] and "15 minutes per changeover" in calls[1]["user"]


def test_the_quotes_around_the_idea_hold_in_the_fence_case():
    case, calls = BY_ID["fence"], []
    run_case(case, CTX, offline_ask(case["good"], None, calls))
    user = calls[0]["user"]
    assert user.count('"""') == 2 and "{{goals}} {{known}}" in user


def test_a_reading_that_never_comes_back_fails_the_case():
    def down(body, step):
        raise ConnectionError("no route to the model")
    _, bad = run_case(BY_ID["sized"], CTX, down)
    assert bad == ["no reading: ConnectionError: no route to the model"]


def test_a_live_run_with_no_model_says_so_and_fails(capsys):
    def down(body, step):
        raise ConnectionError("no route to the model")
    assert run_live(CASES[:2], CTX, down, "nothing") == 1
    assert "says nothing about the reading" in capsys.readouterr().out


def test_ids_and_a_missing_question_are_caught_on_every_case():
    out = read_idea(Canned(canned(BY_ID["sized"]["good"])), request(CTX, BY_ID["sized"], BY_ID["sized"]["idea"], []))
    assert judge({}, out, CTX) == []
    assert any("shows the id c4" in b for b in judge({}, out.model_copy(update={"summary": "Like c4."}), CTX))
    assert any("nothing to ask" in b for b in judge({}, out.model_copy(update={"advice": "info", "open": []}), CTX))


# ---------------------------------------------------------------- what the app takes
def reading(**over) -> ReadOut:
    base = {"dials": [{"key": k, "score": 50, "note": "n", "basis": "b"} for k in ("value", "feasibility", "cost", "fit", "risk")],
            "overall": 50, "summary": "s", "advice": "info", "advice_why": "w", "pattern": "p", "route_id": None, "route_reason": "r",
            "same_as": None, "related": None, "open": [], "model": "m", "version": "v", "ms": 1}
    return ReadOut.model_validate({**base, **over})


@pytest.mark.parametrize("over,why", [
    ({"summary": "x" * 1201}, "summary"),
    ({"open": ["x" * 401]}, "open question"),
    ({"open": ["What?"] * 9}, "9 open"),
    ({"model": "x" * 201}, "model"),
    ({"summary": "😀" * 601}, "summary"),  # 601 characters, 1202 in JavaScript
])
def test_app_rejects_knows_what_the_app_refuses(over, why):
    assert any(why in b for b in app_rejects(reading(**over)))


def test_app_rejects_lets_a_normal_reading_through():
    assert app_rejects(reading()) == []
