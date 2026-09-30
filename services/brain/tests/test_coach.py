import pytest
from fastapi.testclient import TestClient

from brain import main
from brain.coach import MAX_HISTORY, PROMPT_VERSION, coach, not_you
from brain.llm import LLMOutputError
from brain.schemas import CoachIn
from tests.conftest import FakeLLM


NO_MATCH = {"closest_id": "", "comparison": "-", "same_problem": False}


def turn(**over) -> dict:
    base = {"open_point": "impact", "earlier_id": "", "note": "Twelve changeovers a shift is a lot of paper.",
            "question": "How long does one changeover sheet take?", "why": "Minutes per shift decide whether this is a quick fix.",
            "recommended": "About five minutes per sheet, so an hour a shift."}
    return {**base, **over}


@pytest.fixture
def cbody() -> dict:
    return {
        "company": "Acme Maschinenbau GmbH",
        "idea": {"title": "Changeover checklist on the tablet", "body": "Instead of paper."},
        "history": [{"role": "user", "text": "Changeover checklist on the tablet"}],
        "brief": "The idea scores 46/100; it can be published at 70.\n- Impact & reach: 20/100 (missing: Put a number on the upside)",
        "known": [{"id": "c3", "title": "Changeover sheet and MES ask for the same six numbers", "status": "open"},
                  {"id": "c8", "title": "Stop double-entering job data on paper", "status": "building"}],
    }


def test_one_turn(cbody):
    llm = FakeLLM([NO_MATCH, turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert out.question == "How long does one changeover sheet take?" and out.open_point == "impact"
    assert out.recommended.startswith("About five minutes") and out.version == PROMPT_VERSION
    user = llm.calls[1]["user"]
    assert "(none found)" in user
    assert "c8: Stop double-entering job data on paper [building]" in user
    assert "Employee: Changeover checklist on the tablet" in user
    assert "46/100" in user  # the app's brief goes in as it is


def test_earlier_item_is_constrained_and_unknown_ids_dropped(cbody):
    llm = FakeLLM([NO_MATCH, turn(earlier_id="c99")])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert out.earlier_id is None
    assert llm.calls[1]["schema"]["properties"]["earlier_id"]["enum"] == ["c3", "c8", ""]
    assert coach(FakeLLM([NO_MATCH, turn(earlier_id="c3")]), CoachIn.model_validate(cbody)).earlier_id == "c3"


def test_first_message_checks_history_and_hands_the_match_over(cbody):
    llm = FakeLLM([{"closest_id": "c8", "comparison": "-", "same_problem": True}, turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert llm.calls[0]["schema"]["properties"]["closest_id"]["enum"] == ["c3", "c8", ""]
    fact = llm.calls[1]["user"].split("Checked against the records:")[1]
    assert 'Someone else already raised the same problem: "Stop double-entering job data on paper" (building)' in fact
    assert "c8" not in fact
    assert out.earlier_id == "c8"  # set even when the phrasing did not name it


def test_a_close_item_that_is_not_the_same_problem_is_no_fact(cbody):
    llm = FakeLLM([{"closest_id": "c3", "comparison": "-", "same_problem": False}, turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert "(none found)" in llm.calls[1]["user"] and out.earlier_id is None


def test_later_turns_skip_the_check(cbody):
    cbody["history"] += [{"role": "assistant", "text": "How often?"}, {"role": "user", "text": "Every shift."}]
    llm = FakeLLM([turn()])
    coach(llm, CoachIn.model_validate(cbody))
    assert len(llm.calls) == 1


@pytest.mark.parametrize("bad", [
    {"question": "How long does it take? And who does it?"},
    {"question": "Tell me how long it takes."},
    {"note": "Nice - that brings you to 58/100."},
    {"why": "Answer this and you get 12 points."},
    {"recommended": " "},
    {"question": "How is this different from item c8?"},
])
def test_rule_breaks_are_retried(cbody, bad):
    llm = FakeLLM([NO_MATCH, turn(**bad), turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert out.question == "How long does one changeover sheet take?" and len(llm.calls) == 3
    assert "invalid" in llm.calls[2]["user"]


def test_ready_means_no_question(cbody):
    out = coach(FakeLLM([NO_MATCH, turn(open_point="none", question="", why="", recommended="",
                              note="A decider could act on this now.")]), CoachIn.model_validate(cbody))
    assert (out.question, out.why, out.recommended) == ("", "", "") and out.note


def test_only_the_latest_turns_go_out(cbody):
    cbody["history"] = [{"role": "user" if i % 2 == 0 else "assistant", "text": f"turn {i}"} for i in range(20)]
    llm = FakeLLM([turn()])
    coach(llm, CoachIn.model_validate(cbody))
    user = llm.calls[0]["user"]
    assert f"turn {20 - MAX_HISTORY}" in user and f"turn {19 - MAX_HISTORY}" not in user


def test_gives_up_after_retries(cbody):
    with pytest.raises(LLMOutputError):
        coach(FakeLLM([NO_MATCH, "x", "x", "x"]), CoachIn.model_validate(cbody))


def test_coach_endpoint_and_key(monkeypatch, cbody):
    monkeypatch.setattr(main.settings, "api_key", "s3cret")
    main.app.state.llm = FakeLLM([NO_MATCH, turn()])
    try:
        c = TestClient(main.app)
        assert c.post("/v1/coach", json=cbody).status_code == 401
        r = c.post("/v1/coach", json=cbody, headers={"x-api-key": "s3cret"})
        assert r.status_code == 200 and r.json()["question"].endswith("?")
        assert c.post("/v1/coach", json={**cbody, "extra": 1}, headers={"x-api-key": "s3cret"}).status_code == 422
    finally:
        del main.app.state.llm


@pytest.mark.parametrize("said,shown", [
    ("You've raised this issue before, and it's still a problem.", "This issue was raised before, and it's still a problem."),
    ("You have already raised this before.", "This was raised before."),
    ("Since you raised it before, what changed?", "Since this was raised before, what changed?"),
    ("You raised a good point about the sheets.", "You raised a good point about the sheets."),
])
def test_earlier_items_are_not_the_employees(said, shown):
    assert not_you(said) == shown
