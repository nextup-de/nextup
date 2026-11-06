import pytest
from fastapi.testclient import TestClient

from brain import main
from brain.llm import LLMOutputError
from brain.read import MAX_OPEN, PROMPT_VERSION, read_idea
from brain.schemas import ReadIn
from brain.strict import strict_schema
from brain.schemas import IdeaRead
from tests.conftest import FakeLLM


def dial(score: int, note: str = "Nothing sizes the gain from water bottles.") -> dict:
    return {"note": note, "basis": "A number on the time lost would move this.", "score": score}


def answer(**over) -> dict:
    base = {
        "value": dial(20), "feasibility": dial(50), "cost": dial(40), "fit": dial(10), "risk": dial(80),
        "summary": "Free water on every desk, with no sign that thirst is a real problem here.",
        "closest_id": "", "comparison": "-", "same_problem": False,
        "route_id": "r1", "route_reason": "A small spend is the team lead's.",
        "pattern": "It stands alone: no earlier item is about drinks.",
        "advice": "info", "advice_why": "Nothing yet shows what it would gain.",
        "open": ["What does thirst cost in lost work today?", "Which goal does it serve?"],
    }
    return {**base, **over}


@pytest.fixture
def rbody() -> dict:
    return {
        "company": "Acme Components",
        "idea": {"title": "A new bottle of water on every desk", "body": "Everyone stays hydrated."},
        "goals": [{"name": "Less downtime", "kpi": "minutes per changeover"}],
        "routes": [{"id": "r1", "type": "Spend under €5k", "owner": "Team lead, Production"}],
        "known": [{"id": "c4", "title": "Tolerance drift on station 7", "status": "open"}],
        "affected": 2, "attachments": 1, "spend_limit_eur": 5000,
    }


def test_the_overall_is_the_mean_of_the_dials_and_every_part_comes_back(rbody):
    out = read_idea(FakeLLM([answer()]), ReadIn.model_validate(rbody))
    assert [(d.key, d.score) for d in out.dials] == [("value", 20), ("feasibility", 50), ("cost", 40), ("fit", 10), ("risk", 80)]
    assert out.overall == 40 and out.version == PROMPT_VERSION
    assert out.summary.startswith("Free water") and out.advice == "info" and out.route_id == "r1"
    assert out.dials[0].note and out.dials[0].basis
    assert out.open == ["What does thirst cost in lost work today?", "Which goal does it serve?"]


def test_it_is_judged_against_the_company(rbody):
    llm = FakeLLM([answer()])
    read_idea(llm, ReadIn.model_validate(rbody))
    user = llm.calls[0]["user"]
    assert "- Less downtime (measured on: minutes per changeover)" in user
    assert "- r1: Spend under €5k -> Team lead, Production" in user
    assert "- c4: Tolerance drift on station 7 [open]" in user
    assert "up to 5000" in user and "marked as affected: 2" in user and "Files attached: 1" in user
    assert "(this is the first reading)" in user


def test_the_ids_are_constrained(rbody):
    llm = FakeLLM([answer()])
    read_idea(llm, ReadIn.model_validate(rbody))
    props = llm.calls[0]["schema"]["properties"]
    assert props["closest_id"]["enum"] == ["c4", ""] and props["route_id"]["enum"] == ["r1", "none"]


def test_the_schema_is_strict_all_the_way_down():
    s = strict_schema(IdeaRead.model_json_schema())
    assert s["additionalProperties"] is False and set(s["required"]) == set(s["properties"])
    d = s["$defs"]["DialRead"]
    assert d["additionalProperties"] is False and d["required"] == ["note", "basis", "score"]
    assert "maximum" not in d["properties"]["score"]


def test_the_last_reading_goes_out_so_a_score_only_moves_for_a_reason(rbody):
    rbody["previous"] = [{"key": "value", "score": 20, "note": "Not sized."}]
    llm = FakeLLM([answer()])
    read_idea(llm, ReadIn.model_validate(rbody))
    assert "- value: 20 - Not sized." in llm.calls[0]["user"]


@pytest.mark.parametrize("same,want", [(True, ("c4", None)), (False, (None, "c4"))])
def test_the_closest_item_is_a_repeat_or_only_related(rbody, same, want):
    out = read_idea(FakeLLM([answer(closest_id="c4", same_problem=same)]), ReadIn.model_validate(rbody))
    assert (out.same_as, out.related) == want


def test_a_row_or_item_it_was_not_sent_is_dropped(rbody):
    out = read_idea(FakeLLM([answer(closest_id="c99", same_problem=True, route_id="r9")]), ReadIn.model_validate(rbody))
    assert out.same_as is None and out.related is None and out.route_id is None


def test_a_score_out_of_range_is_redone(rbody):
    llm = FakeLLM([answer(value=dial(140)), answer()])
    assert read_idea(llm, ReadIn.model_validate(rbody)).dials[0].score == 20 and len(llm.calls) == 2


def test_showing_an_id_is_redone(rbody):
    llm = FakeLLM([answer(summary="Like c4, nothing is sized."), answer()])
    assert read_idea(llm, ReadIn.model_validate(rbody)).summary.startswith("Free water") and len(llm.calls) == 2


def test_giving_up_raises_so_the_app_falls_back(rbody):
    with pytest.raises(LLMOutputError):
        read_idea(FakeLLM([answer(value=dial(140))] * 3), ReadIn.model_validate(rbody))


def test_open_keeps_real_questions_once_and_not_what_they_cannot_answer(rbody):
    rbody["skip"] = ["Which goal does it serve?"]
    llm = FakeLLM([answer(open=["What does thirst cost?", "  What does thirst cost?  ", "Which goal does this serve?", "Not a question"])])
    out = read_idea(llm, ReadIn.model_validate(rbody))
    assert out.open == ["What does thirst cost?"]
    assert "- Which goal does it serve?" in llm.calls[0]["user"]


def test_open_is_capped():
    assert MAX_OPEN == 6


def test_read_endpoint_and_key(monkeypatch, rbody):
    monkeypatch.setattr(main.settings, "api_key", "s3cret")
    main.app.state.llm = FakeLLM([answer()])
    try:
        c = TestClient(main.app)
        assert c.post("/v1/read", json=rbody).status_code == 401
        r = c.post("/v1/read", json=rbody, headers={"x-api-key": "s3cret"})
        assert r.status_code == 200 and r.json()["overall"] == 40 and len(r.json()["dials"]) == 5
        assert c.post("/v1/read", json={**rbody, "extra": 1}, headers={"x-api-key": "s3cret"}).status_code == 422
    finally:
        del main.app.state.llm
