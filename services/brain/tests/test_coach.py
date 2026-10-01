import pytest
from fastapi.testclient import TestClient

from brain import main
from brain.coach import MAX_HISTORY, PROMPT_VERSION, READY, coach, not_you
from brain.llm import LLMOutputError
from brain.schemas import CoachIn
from tests.conftest import FakeLLM

NO_MATCH = {"closest_id": "", "comparison": "-", "same_problem": False}
EMPTY = {"problem": "", "context": "", "impact": "", "solution": "", "evidence": "", "risks": "", "success_measure": ""}


def sheet(asked=(), **said) -> dict:
    return {"asked": list(asked), **EMPTY, **said}


def turn(**over) -> dict:
    base = {"earlier_id": "", "note": "Twelve changeovers a shift is a lot of paper.",
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


def later(cbody: dict) -> dict:
    cbody["history"] += [
        {"role": "assistant", "text": "Paper twice is double work.\n\nWhere does this happen? The scope decides it."},
        {"role": "user", "text": "About five minutes each, on all three lines."},
    ]
    return cbody


# ---------------------------------------------------------------- the first message
def test_first_message_notes_are_the_idea_and_the_next_point_is_context(cbody):
    llm = FakeLLM([NO_MATCH, turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert len(llm.calls) == 2  # the history check and the question - no note-taking call
    assert out.covered == ["problem"] and out.open_point == "context"
    user = llm.calls[1]["user"]
    assert "- problem: Changeover checklist on the tablet" in user
    assert "c8: Stop double-entering job data on paper [building]" in user
    assert "46/100" in user and "(none found)" in user
    assert "context - where it happens" in llm.calls[1]["system"]
    assert out.question == "How long does one changeover sheet take?" and out.version == PROMPT_VERSION


def test_first_message_checks_history_and_hands_the_match_over(cbody):
    llm = FakeLLM([{"closest_id": "c8", "comparison": "-", "same_problem": True}, turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert llm.calls[0]["schema"]["properties"]["closest_id"]["enum"] == ["c3", "c8", ""]
    fact = llm.calls[1]["user"].split("Checked against the records:")[1].split("What they have told you")[0]
    assert 'Someone else already raised the same problem: "Stop double-entering job data on paper" (building)' in fact
    assert "c8" not in fact
    assert out.earlier_id == "c8"  # set even when the phrasing did not name it


def test_a_close_item_that_is_not_the_same_problem_is_no_fact(cbody):
    llm = FakeLLM([{"closest_id": "c3", "comparison": "-", "same_problem": False}, turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert "(none found)" in llm.calls[1]["user"] and out.earlier_id is None


def test_earlier_item_is_constrained_and_unknown_ids_dropped(cbody):
    llm = FakeLLM([NO_MATCH, turn(earlier_id="c99")])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert out.earlier_id is None
    assert llm.calls[1]["schema"]["properties"]["earlier_id"]["enum"] == ["c3", "c8", ""]


# ---------------------------------------------------------------- later messages: notes, then the code picks
def test_later_turns_take_notes_and_the_code_picks_the_first_empty_point(cbody):
    llm = FakeLLM([sheet(problem="changeover checklist", context="all three lines"), turn(question="What does the double typing cost a week?")])
    out = coach(llm, CoachIn.model_validate(later(cbody)))
    assert len(llm.calls) == 2  # notes and the question - no history check after the first message
    assert "You take notes" in llm.calls[0]["system"]
    assert "Employee: About five minutes each, on all three lines." in llm.calls[0]["user"]
    assert out.covered == ["problem", "context"] and out.open_point == "impact"
    assert "impact - what it costs" in llm.calls[1]["system"]
    assert "- context: all three lines" in llm.calls[1]["user"]


def test_nextup_order_puts_impact_and_first_step_before_evidence(cbody):
    out = coach(FakeLLM([sheet(problem="changeover checklist", context="all three lines", impact="five minutes each"), turn(question="What is a first step?")]), CoachIn.model_validate(later(cbody)))
    assert out.open_point == "solution"


def test_not_applicable_counts_for_the_extra_points(cbody):
    out = coach(FakeLLM([sheet(problem="changeover checklist", context="all three lines", impact="five minutes each", evidence="n/a"), turn(question="What is a first step?")]), CoachIn.model_validate(later(cbody)))
    assert out.open_point == "solution"


def test_a_point_already_asked_is_done_whatever_the_reply(cbody):
    # The coach asked about impact; the employee replied vaguely and the notes left impact empty -
    # it is still never asked again.
    out = coach(FakeLLM([sheet(asked=["impact"], problem="changeover checklist", context="all three lines"), turn(question="What would you do first?")]), CoachIn.model_validate(later(cbody)))
    assert out.covered == ["problem", "context", "impact"] and out.open_point == "solution"


def test_notes_the_employee_never_said_do_not_count(cbody):
    # later(): the employee said "Changeover checklist on the tablet" and "About five minutes each, on all three lines."
    notes = sheet(problem="changeover checklist", context="all three lines", impact="costs a fortune in overtime",
                  solution="n/a", evidence="n/a")
    out = coach(FakeLLM([notes, turn(question="What does it cost per week?")]), CoachIn.model_validate(later(cbody)))
    assert out.covered == ["problem", "context", "evidence"] and out.open_point == "impact"


def test_a_padded_asked_list_counts_one_point_per_question(cbody):
    # one coach question in later(), but the notes claim seven points were asked
    padded = sheet(asked=["context", "impact", "solution", "evidence", "risks", "success_measure"], problem="changeover checklist")
    out = coach(FakeLLM([padded, turn(question="What does it cost per week?")]), CoachIn.model_validate(later(cbody)))
    assert out.covered == ["problem", "context"] and out.open_point == "impact"


def test_all_asked_but_below_the_line_sharpens_the_weakest_point(cbody):
    full = {"asked": [], **{k: "five minutes" for k in EMPTY}}
    llm = FakeLLM([full, turn(question="How many hours a week is that across all three lines?")])
    out = coach(llm, CoachIn.model_validate(later(cbody)))  # the brief: Impact & reach is the weakest
    assert out.open_point == "impact" and out.question.startswith("How many hours")
    assert "needs it sharper" in llm.calls[1]["system"]


def test_everything_answered_is_ready_without_a_question_call(cbody):
    full = {"asked": [], **{k: "five minutes" for k in EMPTY}}
    cbody["brief"] = "The idea scores 74/100; it can be published at 70.\nTell them it is ready to publish."
    llm = FakeLLM([full])
    out = coach(llm, CoachIn.model_validate(later(cbody)))
    assert len(llm.calls) == 1 and out.open_point == "none" and out.note == READY
    assert (out.question, out.recommended) == ("", "")


def test_the_questions_already_asked_go_out(cbody):
    llm = FakeLLM([sheet(problem="paper"), turn(question="What does it cost a week?")])
    coach(llm, CoachIn.model_validate(later(cbody)))
    assert "- Where does this happen?" in llm.calls[1]["user"]


def test_the_same_question_twice_is_redone(cbody):
    llm = FakeLLM([sheet(problem="paper"), turn(question="Where does this happen?"), turn(question="What does it cost a week?")])
    out = coach(llm, CoachIn.model_validate(later(cbody)))
    assert out.question == "What does it cost a week?" and len(llm.calls) == 3
    assert "you already asked" in llm.calls[2]["user"]


def test_only_the_latest_turns_go_out(cbody):
    cbody["history"] = [{"role": "user" if i % 2 == 0 else "assistant", "text": f"turn {i}"} for i in range(20)]
    llm = FakeLLM([sheet(problem="p"), turn()])
    coach(llm, CoachIn.model_validate(cbody))
    for call in llm.calls:
        assert f"turn {20 - MAX_HISTORY}" in call["user"] and f"turn {19 - MAX_HISTORY}" not in call["user"]


# ---------------------------------------------------------------- the rules every answer keeps
@pytest.mark.parametrize("bad", [
    {"question": "How long does it take? And who does it?"},
    {"question": "Tell me how long it takes."},
    {"note": "Nice - that brings you to 58/100."},
    {"why": "Answer this and you get 12 points."},
    {"question": "How is this different from item c8?"},
])
def test_rule_breaks_are_redone_once(cbody, bad):
    llm = FakeLLM([NO_MATCH, turn(**bad), turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert out.question == "How long does one changeover sheet take?" and len(llm.calls) == 3
    assert "invalid" in llm.calls[2]["user"]


def test_two_rule_breaks_give_up_so_the_app_answers_in_time(cbody):
    with pytest.raises(LLMOutputError):
        coach(FakeLLM([NO_MATCH, turn(note="58/100"), turn(note="58/100")]), CoachIn.model_validate(cbody))


def test_a_missing_suggestion_does_not_fail_the_turn(cbody):
    out = coach(FakeLLM([NO_MATCH, turn(recommended="")]), CoachIn.model_validate(cbody))
    assert out.question and out.recommended == ""


@pytest.mark.parametrize("said,shown", [
    ("You've raised this issue before, and it's still a problem.", "This issue was raised before, and it's still a problem."),
    ("You have already raised this before.", "This was raised before."),
    ("Since you raised it before, what changed?", "Since this was raised before, what changed?"),
    ("You raised a good point about the sheets.", "You raised a good point about the sheets."),
])
def test_earlier_items_are_not_the_employees(said, shown):
    assert not_you(said) == shown


def test_coach_endpoint_and_key(monkeypatch, cbody):
    monkeypatch.setattr(main.settings, "api_key", "s3cret")
    main.app.state.llm = FakeLLM([NO_MATCH, turn()])
    try:
        c = TestClient(main.app)
        assert c.post("/v1/coach", json=cbody).status_code == 401
        r = c.post("/v1/coach", json=cbody, headers={"x-api-key": "s3cret"})
        assert r.status_code == 200 and r.json()["question"].endswith("?") and r.json()["covered"] == ["problem"]
        assert c.post("/v1/coach", json={**cbody, "extra": 1}, headers={"x-api-key": "s3cret"}).status_code == 422
    finally:
        del main.app.state.llm
