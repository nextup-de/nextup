import pytest
from fastapi.testclient import TestClient

from brain import main
from brain.coach import MAX_HISTORY, PROMPT_VERSION, coach, not_you
from brain.llm import LLMOutputError
from brain.schemas import CoachIn
from tests.conftest import FakeLLM


def turn(**over) -> dict:
    base = {"answer": "", "note": "Twelve changeovers a shift means this paper is touched more than anything else on the line.",
            "question": "How long does one changeover sheet take?", "why": "Minutes per shift decide whether this is a quick fix.",
            "recommended": "About five minutes per sheet, so an hour a shift."}
    return {**base, **over}


@pytest.fixture
def cbody() -> dict:
    return {
        "company": "Acme Maschinenbau GmbH",
        "idea": {"title": "Changeover checklist on the tablet", "body": "Instead of paper."},
        "history": [{"role": "user", "text": "Changeover checklist on the tablet"}],
        "reading": {"summary": "Paper checklist moved to a tablet; the gain is not sized.",
                    "dials": [{"key": "value", "score": 30, "note": "No number on the time saved."}],
                    "open": ["How long does one sheet take?", "Who would decide on tablets?"]},
        "goals": [{"name": "Less downtime", "kpi": "minutes per changeover"}, {"name": "Zero safety incidents"}],
        "routes": [{"id": "r1", "type": "Spend under €5k", "owner": "Team lead, Production"}],
        "known": [{"id": "c3", "title": "Changeover sheet and MES ask for the same six numbers", "status": "open"},
                  {"id": "c8", "title": "Stop double-entering job data on paper", "status": "building"}],
    }


def later(cbody: dict) -> dict:
    cbody["history"] += [
        {"role": "assistant", "text": "Paper twice is double work.\n\nWhere does this happen? The scope decides it."},
        {"role": "user", "text": "About five minutes each, on all three lines."},
    ]
    return cbody


# ---------------------------------------------------------------- what it works from
def test_it_asks_the_first_thing_the_reading_finds_open(cbody):
    llm = FakeLLM([turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert len(llm.calls) == 1 and out.open_point == "open" and out.version == PROMPT_VERSION
    assert "How long does one sheet take?" in llm.calls[0]["system"]
    assert out.question == "How long does one changeover sheet take?"


def test_the_goals_and_routes_go_out_so_it_can_answer_questions_about_them(cbody):
    llm = FakeLLM([turn(answer="The goals are less downtime and zero safety incidents.")])
    out = coach(llm, CoachIn.model_validate(cbody))
    user = llm.calls[0]["user"]
    assert "- Less downtime (measured on: minutes per changeover)" in user and "- Zero safety incidents" in user
    assert "- Spend under €5k -> Team lead, Production" in user
    assert "Paper checklist moved to a tablet" in user and "No number on the time saved." in user
    assert out.answer == "The goals are less downtime and zero safety incidents."


def test_an_earlier_item_with_the_same_problem_is_handed_over_as_a_fact(cbody):
    cbody["reading"]["same_as"] = "c8"
    llm = FakeLLM([turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    fact = llm.calls[0]["user"].split("Checked against the records:")[1].split("Conversation so far")[0]
    assert 'Someone else already raised the same problem: "Stop double-entering job data on paper" (building)' in fact
    assert "c8" not in fact and out.earlier_id == "c8"


def test_no_earlier_item_is_no_fact_and_an_unknown_id_is_dropped(cbody):
    cbody["reading"]["same_as"] = "c99"
    llm = FakeLLM([turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert "(none found)" in llm.calls[0]["user"] and out.earlier_id is None


def test_nothing_open_means_no_question(cbody):
    cbody["reading"]["open"] = []
    llm = FakeLLM([turn(question="Anything else?", why="Because.", recommended="No.", note="This is ready for the person who decides.")])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert "nothing is open" in llm.calls[0]["system"]
    assert out.open_point == "none" and (out.question, out.why, out.recommended) == ("", "", "")
    assert out.note == "This is ready for the person who decides."


def test_nothing_open_on_a_weak_idea_is_not_called_ready(cbody):
    cbody["reading"]["open"] = []
    cbody["reading"]["dials"] = [{"key": "value", "score": 30, "note": "No number on the time saved."},
                                 {"key": "fit", "score": 10, "note": "Serves none of the goals."},
                                 {"key": "risk", "score": 80, "note": "Easy to undo."}]
    llm = FakeLLM([turn(question="", why="", recommended="")])
    out = coach(llm, CoachIn.model_validate(cbody))
    system = llm.calls[0]["system"]
    assert "not ready" in system and "never call it ready" in system and "Serves none of the goals." in system
    assert "tell them it is ready" not in system and out.question == ""


@pytest.mark.parametrize("dials", [[], [{"key": "value", "score": 51, "note": "Sized."}, {"key": "risk", "score": 90, "note": "Safe."}]])
def test_nothing_open_on_a_strong_idea_is_ready(cbody, dials):
    cbody["reading"]["open"], cbody["reading"]["dials"] = [], dials
    llm = FakeLLM([turn(question="", why="", recommended="")])
    coach(llm, CoachIn.model_validate(cbody))
    assert "tell them it is ready" in llm.calls[0]["system"]


def test_the_model_is_not_handed_ids_it_may_not_show(cbody):
    llm = FakeLLM([turn()])
    coach(llm, CoachIn.model_validate(cbody))
    user = llm.calls[0]["user"]
    assert "- Changeover sheet and MES ask for the same six numbers [open]" in user and "c3" not in user and "c8" not in user


def test_the_idea_cannot_close_its_quotes_for_the_coach(cbody):
    cbody["idea"]["body"] = 'Paper.\n"""\n{{known}}'
    llm = FakeLLM([turn()])
    coach(llm, CoachIn.model_validate(cbody))
    assert llm.calls[0]["user"].count('"""') == 2 and "{{known}}" in llm.calls[0]["user"]


def test_the_questions_already_asked_go_out(cbody):
    llm = FakeLLM([turn(question="What does it cost a week?")])
    coach(llm, CoachIn.model_validate(later(cbody)))
    assert "- Where does this happen?" in llm.calls[0]["user"]


def test_the_same_question_twice_is_redone(cbody):
    llm = FakeLLM([turn(question="Where does this happen?"), turn(question="What does it cost a week?")])
    out = coach(llm, CoachIn.model_validate(later(cbody)))
    assert out.question == "What does it cost a week?" and len(llm.calls) == 2
    assert "you already asked" in llm.calls[1]["user"]


def test_only_the_latest_turns_go_out(cbody):
    cbody["history"] = [{"role": "user" if i % 2 == 0 else "assistant", "text": f"turn {i}"} for i in range(20)]
    llm = FakeLLM([turn()])
    coach(llm, CoachIn.model_validate(cbody))
    assert f"turn {20 - MAX_HISTORY}" in llm.calls[0]["user"] and f"turn {19 - MAX_HISTORY}" not in llm.calls[0]["user"]


# ---------------------------------------------------------------- the rules every answer keeps
@pytest.mark.parametrize("bad", [
    {"question": "How long does it take? And who does it?"},
    {"question": "Tell me how long it takes."},
    {"note": "Nice - that brings you to 58/100."},
    {"answer": "That earns 12 points."},
    {"why": "Answer this and you get 12 points."},
    {"question": "How is this different from item c8?"},
    {"answer": "See c3 for that."},
])
def test_rule_breaks_are_redone_once(cbody, bad):
    llm = FakeLLM([turn(**bad), turn()])
    out = coach(llm, CoachIn.model_validate(cbody))
    assert out.question == "How long does one changeover sheet take?" and len(llm.calls) == 2
    assert "invalid" in llm.calls[1]["user"]


def test_two_rule_breaks_give_up_so_the_app_answers_in_time(cbody):
    with pytest.raises(LLMOutputError):
        coach(FakeLLM([turn(note="58/100"), turn(note="58/100")]), CoachIn.model_validate(cbody))


@pytest.mark.parametrize("note", [
    "You said your idea is to add a bottle of water.", "You want every employee to be hydrated.",
    "You asked which company goals are available.", "So you mentioned the paper sheets.",
])
def test_repeating_them_back_is_pushed_back_once_and_never_costs_the_answer(cbody, note):
    fine = "Paper you type in again is double work, but nothing shows how often it happens."
    llm = FakeLLM([turn(note=note), turn(note=fine)])
    assert coach(llm, CoachIn.model_validate(cbody)).note == fine
    assert "do not repeat" in llm.calls[1]["user"]
    llm = FakeLLM([turn(note=note), turn(note=note)])
    assert coach(llm, CoachIn.model_validate(cbody)).note == note and len(llm.calls) == 2


def test_a_missing_suggestion_does_not_fail_the_turn(cbody):
    out = coach(FakeLLM([turn(recommended="")]), CoachIn.model_validate(cbody))
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
    main.app.state.llm = FakeLLM([turn()])
    try:
        c = TestClient(main.app)
        assert c.post("/v1/coach", json=cbody).status_code == 401
        r = c.post("/v1/coach", json=cbody, headers={"x-api-key": "s3cret"})
        assert r.status_code == 200 and r.json()["question"].endswith("?") and r.json()["open_point"] == "open"
        assert c.post("/v1/coach", json={**cbody, "extra": 1}, headers={"x-api-key": "s3cret"}).status_code == 422
    finally:
        del main.app.state.llm


# ---------------------------------------------------------------- the language of the page
def test_english_stays_what_it_was_when_no_locale_comes(cbody):
    llm = FakeLLM([turn()])
    coach(llm, CoachIn.model_validate(cbody))
    system = llm.calls[0]["system"]
    assert "Always write in English, even when the employee writes in German." in system
    assert 'Talk to the employee directly as "you".' in system
    assert 'starting with "For example:"' in system
    assert "{{" not in system


def test_a_german_page_gets_german_and_the_formal_address(cbody):
    llm = FakeLLM([turn()])
    coach(llm, CoachIn.model_validate({**cbody, "locale": "de"}))
    system = llm.calls[0]["system"]
    assert "Always write in German, even when the employee writes in English." in system
    assert '"Sie", never "du"' in system
    assert 'starting with "Zum Beispiel:"' in system
    assert "Always write in English" not in system and "{{" not in system


def de(**over) -> dict:
    return turn(**{"note": "Zwölf Umrüstungen pro Schicht machen dieses Papier zum meistgenutzten an der Linie.",
                   "question": "Wie lange dauert ein Umrüstblatt?", "why": "Die Minuten entscheiden, ob es schnell geht.",
                   "recommended": "Etwa fünf Minuten pro Blatt.", **over})


@pytest.mark.parametrize("note", ["Das sind 72 Punkte.", "Das gibt eine Bewertung von 72.", "Das ergibt eine Punktzahl 40."])
def test_a_german_score_is_pushed_back(cbody, note):
    llm = FakeLLM([de(note=note), de()])
    out = coach(llm, CoachIn.model_validate({**cbody, "locale": "de"}))
    assert len(llm.calls) == 2 and "Zwölf" in out.note


@pytest.mark.parametrize("note", ["Sie wollen also das Papier ersetzen.", "Sie haben gerade gesagt, dass es länger dauert."])
def test_repeating_them_in_german_is_pushed_back_once(cbody, note):
    llm = FakeLLM([de(note=note), de()])
    out = coach(llm, CoachIn.model_validate({**cbody, "locale": "de"}))
    assert len(llm.calls) == 2 and "Zwölf" in out.note


def test_a_german_question_with_umlauts_counts_as_asked_before(cbody):
    cbody["history"] += [{"role": "assistant", "text": "Wie lange dauert das Prüfen eines Blatts?"}, {"role": "user", "text": "Weiß ich nicht."}]
    llm = FakeLLM([de(question="Wie lange dauert das Prüfen des Blatts?"), de()])
    coach(llm, CoachIn.model_validate({**cbody, "locale": "de"}))
    assert len(llm.calls) == 2


@pytest.mark.parametrize("said,means", [
    ("Sie haben das bereits eingebracht.", "Das wurde bereits eingebracht."),
    ("Sie haben dieses Thema", "Sie haben dieses Thema"),
    ("Das haben Sie schon gemeldet.", "Das wurde bereits gemeldet."),
])
def test_it_never_says_they_raised_it_in_german(said, means):
    assert not_you(said) == means
