import pytest
from fastapi.testclient import TestClient

from brain import main
from brain.coach import MAX_HISTORY, PROMPT_VERSION, coach
from brain.llm import LLMOutputError
from brain.schemas import CoachIn
from tests.conftest import FakeLLM


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
    llm = FakeLLM([turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert out.question == "How long does one changeover sheet take?" and out.open_point == "impact"
    assert out.recommended.startswith("About five minutes") and out.version == PROMPT_VERSION
    user = llm.calls[0]["user"]
    assert "c8: Stop double-entering job data on paper [building]" in user
    assert "Employee: Changeover checklist on the tablet" in user
    assert "46/100" in user  # the app's brief goes in as it is


def test_earlier_item_is_constrained_and_unknown_ids_dropped(cbody):
    llm = FakeLLM([turn(earlier_id="c99")])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert out.earlier_id is None
    assert llm.calls[0]["schema"]["properties"]["earlier_id"]["enum"] == ["c3", "c8", ""]
    assert coach(FakeLLM([turn(earlier_id="c3")]), CoachIn.model_validate(cbody)).earlier_id == "c3"


@pytest.mark.parametrize("bad", [
    {"question": "How long does it take? And who does it?"},
    {"question": "Tell me how long it takes."},
    {"note": "Nice - that brings you to 58/100."},
    {"why": "Answer this and you get 12 points."},
    {"recommended": " "},
    {"question": "How is this different from item c8?"},
])
def test_rule_breaks_are_retried(cbody, bad):
    llm = FakeLLM([turn(**bad), turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert out.question == "How long does one changeover sheet take?" and len(llm.calls) == 2
    assert "invalid" in llm.calls[1]["user"]


def test_ready_means_no_question(cbody):
    out = coach(FakeLLM([turn(open_point="none", question="", why="", recommended="",
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
        coach(FakeLLM(["x", "x", "x"]), CoachIn.model_validate(cbody))


def test_coach_endpoint_and_key(monkeypatch, cbody):
    monkeypatch.setattr(main.settings, "api_key", "s3cret")
    main.app.state.llm = FakeLLM([turn()])
    try:
        c = TestClient(main.app)
        assert c.post("/v1/coach", json=cbody).status_code == 401
        r = c.post("/v1/coach", json=cbody, headers={"x-api-key": "s3cret"})
        assert r.status_code == 200 and r.json()["question"].endswith("?")
        assert c.post("/v1/coach", json={**cbody, "extra": 1}, headers={"x-api-key": "s3cret"}).status_code == 422
    finally:
        del main.app.state.llm
